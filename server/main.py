import base64
import hashlib
import io
import json
import math
import os
import random
import uuid
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
from diffusers import (
    StableDiffusion3InpaintPipeline,
    StableDiffusionInstructPix2PixPipeline,
)
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from huggingface_hub import login
from PIL import Image, ImageFilter
from ultralytics import YOLO

try:
    import imageio
    import imageio.v3 as iio
except Exception:
    imageio = None
    iio = None

load_dotenv()

# Hugging Face Token for SD3
hf_token = os.getenv("HF_TOKEN")
if hf_token:
    login(token=hf_token)

# Device Configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32

# Setup Directories
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

# Load Models
print("📥 Loading YOLOv8...")
yolo_model = YOLO("yolov8m.pt")
print("✅ YOLO loaded!")

print("📥 Loading Stable Diffusion 3 Inpainting...")
inpaint_pipe = StableDiffusion3InpaintPipeline.from_pretrained(
    "stabilityai/stable-diffusion-3-medium-diffusers",
    torch_dtype=torch_dtype,
).to(device)

if device == "cuda":
    inpaint_pipe.enable_model_cpu_offload()
    torch.cuda.empty_cache()
print("✅ Stable Diffusion 3 loaded successfully!")

print("📥 Loading InstructPix2Pix...")
instruct_pix2pix_pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
    "timbrooks/instruct-pix2pix",
    torch_dtype=torch_dtype,
    safety_checker=None,
).to(device)
print("✅ InstructPix2Pix loaded successfully!")

# Cache and App Initialization
detection_cache = {}
app = FastAPI(title="Road-AI Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Video-Metadata",
        "X-Video-Method",
        "X-Video-Operation",
        "X-Video-Output",
    ],
)


# Helper Functions
def annotate_image_and_collect(results):
    r = results[0]
    detections = []
    img_np = (
        r.orig_img.copy() if hasattr(r, "orig_img") and r.orig_img is not None else None
    )

    for box in r.boxes:
        xyxy = box.xyxy[0].tolist()
        x1, y1, x2, y2 = [int(x) for x in xyxy]
        conf = float(box.conf[0])
        cls = int(box.cls[0])
        label = yolo_model.names.get(cls, str(cls))

        detections.append(
            {
                "label": label,
                "confidence": conf,
                "box": [x1, y1, x2, y2],
            }
        )

    annotated_b64 = None
    if img_np is not None:
        img_pil = Image.fromarray(img_np).convert("RGBA")
        try:
            from PIL import ImageDraw

            d = ImageDraw.Draw(img_pil)
            for det in detections:
                x1, y1, x2, y2 = det["box"]
                d.rectangle([x1, y1, x2, y2], outline=(255, 0, 0, 255), width=3)
                d.text(
                    (x1, max(0, y1 - 12)),
                    f"{det['label']} {det['confidence']:.2f}",
                    fill=(255, 255, 255, 255),
                )

            buf = io.BytesIO()
            img_pil.convert("RGB").save(buf, format="PNG")
            annotated_b64 = base64.b64encode(buf.getvalue()).decode()
        except Exception:
            annotated_b64 = None

    counts = {}
    for d in detections:
        counts[d["label"]] = counts.get(d["label"], 0) + 1

    return counts, detections, annotated_b64


def create_mask_from_box(img_np, box, expand_ratio=0.25):
    h, w = img_np.shape[:2]
    x1, y1, x2, y2 = map(int, box)
    bw, bh = x2 - x1, y2 - y1
    x1 = max(0, x1 - int(bw * expand_ratio))
    y1 = max(0, y1 - int(bh * expand_ratio))
    x2 = min(w, x2 + int(bw * expand_ratio))
    y2 = min(h, y2 + int(bh * expand_ratio))

    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    mask = cv2.GaussianBlur(mask, (31, 31), 15)
    kernel = np.ones((11, 11), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=2)
    return mask


def get_removal_prompts(label: str):
    label_lower = label.lower() if label else "unknown"
    if any(
        v in label_lower
        for v in ["car", "truck", "bus", "vehicle", "motorcycle", "bike", "bicycle"]
    ):
        prompt = "empty asphalt road surface, plain gray pavement, road texture only, no objects, clean street"
        negative = "car, cars, vehicle, vehicles, automobile, truck, bus, motorcycle, bike, any vehicle, wheels, tires, bumper, headlights, windshield, metal, reflection, shadow of car, new car, replacement car, another car, object, person, people, animal"
    elif any(
        p in label_lower
        for p in ["person", "people", "human", "man", "woman", "child", "pedestrian"]
    ):
        prompt = "empty sidewalk, plain pavement surface, concrete ground, no people, clean walkway"
        negative = "person, people, human, man, woman, child, pedestrian, body, face, figure, legs, arms, head, silhouette, shadow of person, new person, another person, replacement person, object, animal"
    elif any(s in label_lower for s in ["traffic light", "stop sign", "sign", "parking meter"]):
        prompt = "clear sky, empty background, building wall continuation, natural scenery"
        negative = "traffic light, sign, post, pole, any sign, new sign, replacement sign, object, text, symbols"
    elif any(a in label_lower for a in ["dog", "cat", "bird", "animal", "horse", "cow", "sheep"]):
        prompt = "empty ground surface, natural floor, clean area, no animals"
        negative = "dog, cat, bird, animal, pet, creature, any animal, new animal, replacement animal, object"
    elif any(f in label_lower for f in ["chair", "couch", "sofa", "bed", "table", "desk", "bench"]):
        prompt = "empty floor, room interior, plain surface, no furniture"
        negative = "chair, couch, furniture, table, desk, any furniture, new furniture, object"
    else:
        prompt = "natural background only, empty space, seamless continuation, plain surface"
        negative = f"{label}, any {label}, new {label}, replacement {label}, object, item, thing, any object"

    negative += ", new object, replacement object, added object, generated object, hallucinated object, any new item, anything new, text, logo, watermark, artifact, distortion, blur, duplicate, ghost"
    return prompt, negative


def np_image_to_base64_png(img_np):
    buf = io.BytesIO()
    Image.fromarray(img_np.astype(np.uint8)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def get_dominant_color(img_crop):
    try:
        pixels = img_crop.reshape(-1, 3).astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, _, centers = cv2.kmeans(
            pixels, 2, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS
        )
        h, w = img_crop.shape[:2]
        center_pixel = img_crop[h // 2, w // 2]
        min_dist = float("inf")
        dominant_color = centers[0]
        for center in centers:
            dist = np.linalg.norm(center - center_pixel)
            if dist < min_dist:
                min_dist = dist
                dominant_color = center
        return dominant_color
    except Exception:
        return img_crop.mean(axis=(0, 1))


# Endpoints
@app.get("/")
def root():
    return {"message": "Road-AI Backend is running", "status": "ok"}


@app.post("/search")
async def search_image(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    img_hash = hashlib.md5(contents).hexdigest()
    results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
    counts, detections, annotated_b64 = annotate_image_and_collect(results)

    for i, detection in enumerate(detections):
        detection["detection_id"] = f"{img_hash}_{i}"

    detection_cache[img_hash] = {
        "detections": detections,
        "image_data": contents,
        "img_np": img_np,
    }

    return {
        "counts": counts,
        "detections": detections,
        "image_base64": annotated_b64,
        "image_hash": img_hash,
    }


@app.post("/remove/apply")
async def remove_apply(
    file: UploadFile = File(...),
    index: Optional[int] = Form(None),
    detection_id: Optional[str] = Form(None),
    image_hash: Optional[str] = Form(None),
):
    contents = await file.read()
    try:
        pil = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(pil)
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    target_box, target_label = None, None
    if image_hash and image_hash in detection_cache:
        cached = detection_cache[image_hash]["detections"]
        if detection_id:
            for d in cached:
                if d.get("detection_id") == detection_id:
                    target_box, target_label = d["box"], d["label"]
                    break
        if not target_box and index is not None and 0 <= index < len(cached):
            target_box, target_label = cached[index]["box"], cached[index]["label"]

    if not target_box:
        results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
        _, detections, _ = annotate_image_and_collect(results)
        if index is not None and 0 <= index < len(detections):
            target_box, target_label = detections[index]["box"], detections[index]["label"]

    if not target_box:
        return {"error": "no_target_found"}

    mask_np = create_mask_from_box(img_np, target_box, expand_ratio=0.25)
    prompt, negative = get_removal_prompts(target_label)

    try:
        image_pil = Image.fromarray(img_np).convert("RGB")
        mask_pil = Image.fromarray(mask_np).convert("L")
        w, h = image_pil.size
        new_w, new_h = (w // 64) * 64, (h // 64) * 64
        if (new_w, new_h) != (w, h):
            image_pil = image_pil.resize((new_w, new_h), Image.LANCZOS)
            mask_pil = mask_pil.resize((new_w, new_h), Image.LANCZOS)

        result = inpaint_pipe(
            prompt=prompt,
            negative_prompt=negative,
            image=image_pil,
            mask_image=mask_pil,
            num_inference_steps=35,
            guidance_scale=8.0,
        ).images[0]

        if (new_w, new_h) != (w, h):
            result = result.resize((w, h), Image.LANCZOS)

        return {
            "image_base64": np_image_to_base64_png(np.array(result)),
            "removed_label": target_label,
            "method": "stable_diffusion_3",
        }
    except Exception as e:
        return {"error": "generation_failed", "detail": str(e)}


@app.post("/add/apply")
async def add_apply(
    file: UploadFile = File(...),
    prompt: str = Form(...),
    box: str = Form(...),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    try:
        parsed_box = json.loads(box)
        x1, y1, x2, y2 = [int(x) for x in parsed_box]
    except Exception as e:
        return {"error": "invalid_box", "detail": str(e)}

    h, w = img_np.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    ks = max(5, min(21, int(min(x2 - x1, y2 - y1) * 0.1)))
    mask = cv2.GaussianBlur(mask, (ks | 1, ks | 1), 0)

    try:
        image_pil = Image.fromarray(img_np).convert("RGB")
        mask_pil = Image.fromarray(mask).convert("L")
        orig_w, orig_h = image_pil.size
        new_w, new_h = (orig_w // 64) * 64, (orig_h // 64) * 64
        if (new_w, new_h) != (orig_w, orig_h):
            image_pil = image_pil.resize((new_w, new_h), Image.LANCZOS)
            mask_pil = mask_pil.resize((new_w, new_h), Image.LANCZOS)

        result = inpaint_pipe(
            prompt=f"{prompt}, photorealistic, sharp focus, high quality, detailed",
            negative_prompt="blurry, distorted, low quality, cartoon, drawing, wrong object, artifact",
            image=image_pil,
            mask_image=mask_pil,
            num_inference_steps=40,
            guidance_scale=8.5,
        ).images[0]

        if (new_w, new_h) != (orig_w, orig_h):
            result = result.resize((orig_w, orig_h), Image.LANCZOS)

        return {
            "image_base64": np_image_to_base64_png(np.array(result)),
            "prompt": prompt,
            "method": "stable_diffusion_3",
        }
    except Exception as e:
        return {"error": "generation_failed", "detail": str(e)}


@app.post("/replace/apply")
async def replace_apply(
    file: UploadFile = File(...),
    index: int = Form(...),
    replacement: str = Form(...),
    image_hash: Optional[str] = Form(None),
    detection_id: Optional[str] = Form(None),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    target_box, target_label = None, None
    if image_hash and image_hash in detection_cache:
        cached = detection_cache[image_hash]["detections"]
        if 0 <= index < len(cached):
            target_box, target_label = cached[index]["box"], cached[index]["label"]

    if not target_box:
        results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
        _, detections, _ = annotate_image_and_collect(results)
        if 0 <= index < len(detections):
            target_box, target_label = detections[index]["box"], detections[index]["label"]

    if not target_box:
        return {"error": "no_target_found"}

    # Crop the object region with a modest expansion for context
    mask_np = create_mask_from_box(img_np, target_box, expand_ratio=0.25)

    try:
        image_pil = Image.fromarray(img_np).convert("RGB")
        mask_pil = Image.fromarray(mask_np).convert("L")
        orig_w, orig_h = image_pil.size

        # Use InstructPix2Pix for style-preserving, instruction-based replacement
        # Resize to 512x512 as required by the model, then restore original size
        ip2p_size = 512
        image_resized = image_pil.resize((ip2p_size, ip2p_size), Image.LANCZOS)

        edit_instruction = f"replace the {target_label} with {replacement}"
        result_resized = instruct_pix2pix_pipe(
            prompt=edit_instruction,
            image=image_resized,
            num_inference_steps=50,
            image_guidance_scale=1.5,
            guidance_scale=7.5,
        ).images[0]

        # Composite: paste inpainted region back using the mask to preserve surroundings
        result_full = result_resized.resize((orig_w, orig_h), Image.LANCZOS)
        mask_blur = mask_pil.filter(ImageFilter.GaussianBlur(radius=6))
        composited = Image.composite(result_full, image_pil, mask_blur)

        return {
            "image_base64": np_image_to_base64_png(np.array(composited)),
            "original": target_label,
            "replacement": replacement,
            "method": "instruct_pix2pix",
        }
    except Exception as e:
        return {"error": "failed", "detail": str(e)}


@app.post("/edit/color-detect")
async def color_detect(
    file: UploadFile = File(...),
    target_color: str = Form(...),
    tolerance: int = Form(30),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
    _, detections, _ = annotate_image_and_collect(results)

    color_map = {
        "black": (0, 0, 0),
        "white": (255, 255, 255),
        "red": (255, 0, 0),
        "blue": (0, 0, 255),
        "green": (0, 255, 0),
        "yellow": (255, 255, 0),
        "gray": (128, 128, 128),
        "grey": (128, 128, 128),
        "silver": (192, 192, 192),
    }
    target_rgb = color_map.get(target_color.lower(), (0, 0, 0))

    matching_objects, all_objects = [], []
    for i, det in enumerate(detections):
        box = det["box"]
        obj_region = img_np[box[1] : box[3], box[0] : box[2]]
        detected_color = get_dominant_color(obj_region)
        diff = float(np.linalg.norm(detected_color - target_rgb))
        match = bool(diff < tolerance * 2)
        info = {
            "index": i,
            "label": det["label"],
            "box": box,
            "detected_color": detected_color.astype(int).tolist(),
            "color_diff": round(diff, 1),
            "is_match": match,
        }
        all_objects.append(info)
        if match:
            matching_objects.append(info)

    img_pil = Image.fromarray(img_np).convert("RGB")
    from PIL import ImageDraw

    draw = ImageDraw.Draw(img_pil)
    for obj in all_objects:
        x1, y1, x2, y2 = obj["box"]
        clr = (0, 255, 0) if obj["is_match"] else (255, 0, 0)
        draw.rectangle([x1, y1, x2, y2], outline=clr, width=4)
        draw.rectangle([x1, y1 - 25, x1 + 150, y1], fill=clr)
        draw.text(
            (x1 + 5, y1 - 22),
            f"{'MATCH' if obj['is_match'] else 'NO'}: {obj['label']}",
            fill=(0, 0, 0) if obj["is_match"] else (255, 255, 255),
        )

    buf = io.BytesIO()
    img_pil.save(buf, format="PNG")
    return {
        "matching_objects": matching_objects,
        "all_objects": all_objects,
        "total_objects": len(detections),
        "matches_count": len(matching_objects),
        "preview_image": base64.b64encode(buf.getvalue()).decode(),
    }


@app.post("/edit/color-change")
async def color_change(
    file: UploadFile = File(...),
    target_color: str = Form(...),
    new_color: str = Form(...),
    tolerance: int = Form(30),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
    _, detections, _ = annotate_image_and_collect(results)
    color_map = {
        "black": (0, 0, 0),
        "white": (255, 255, 255),
        "red": (255, 0, 0),
        "blue": (0, 0, 255),
        "green": (0, 255, 0),
        "yellow": (255, 255, 0),
        "gray": (128, 128, 128),
        "grey": (128, 128, 128),
        "silver": (192, 192, 192),
    }
    target_rgb = color_map.get(target_color.lower(), (0, 0, 0))

    matching = []
    for i, det in enumerate(detections):
        box = det["box"]
        detected = get_dominant_color(img_np[box[1] : box[3], box[0] : box[2]])
        if np.linalg.norm(detected - target_rgb) < tolerance * 2:
            matching.append(det)

    if not matching:
        return {"error": "no_matching_objects"}

    h, w = img_np.shape[:2]
    combined_mask = np.zeros((h, w), dtype=np.uint8)
    for det in matching:
        combined_mask = np.maximum(
            combined_mask, create_mask_from_box(img_np, det["box"], expand_ratio=0.15)
        )

    try:
        image_pil = Image.fromarray(img_np).convert("RGB")
        mask_pil = Image.fromarray(combined_mask).convert("L")
        orig_w, orig_h = image_pil.size
        new_w, new_h = (orig_w // 64) * 64, (orig_h // 64) * 64
        if (new_w, new_h) != (orig_w, orig_h):
            image_pil = image_pil.resize((new_w, new_h), Image.LANCZOS)
            mask_pil = mask_pil.resize((new_w, new_h), Image.LANCZOS)

        result = inpaint_pipe(
            prompt=f"change to {new_color} color, maintain shape and details, photorealistic, natural lighting",
            negative_prompt=f"{target_color}, wrong color, distorted, artifacts",
            image=image_pil,
            mask_image=mask_pil,
            num_inference_steps=40,
            guidance_scale=8.0,
        ).images[0]

        if (new_w, new_h) != (orig_w, orig_h):
            result = result.resize((orig_w, orig_h), Image.LANCZOS)

        return {
            "image_base64": np_image_to_base64_png(np.array(result)),
            "objects_changed": len(matching),
            "method": "bulk_color_change",
        }
    except Exception as e:
        return {"error": "failed", "detail": str(e)}


@app.post("/edit/transform")
async def scene_transform(
    file: UploadFile = File(...),
    transformation: str = Form(...),
    intensity: float = Form(0.8),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    # InstructPix2Pix is better than SD3 inpainting for weather: it preserves
    # scene geometry and object layout while applying the weather effect.
    instructions = {
        "snowy": "make it snowy, add snow on all surfaces and ground, winter weather",
        "rainy": "make it rainy, add rain drops, wet reflective roads and puddles",
        "foggy": "add thick fog and mist across the entire scene, reduce visibility",
        "sunny": "make it a bright sunny day with clear blue sky and strong sunlight",
        "cloudy": "make it overcast with dark gray clouds covering the sky, diffused light",
    }

    if transformation.lower() not in instructions:
        return {"error": "invalid_transformation", "available": list(instructions.keys())}

    instruction = instructions[transformation.lower()]

    try:
        image_pil = Image.fromarray(img_np).convert("RGB")
        orig_w, orig_h = image_pil.size
        image_resized = image_pil.resize((512, 512), Image.LANCZOS)

        # Lower image_guidance_scale = more transformation; tuned by intensity
        img_guidance = 1.8 - (intensity * 0.6)  # 1.2 at max intensity, 1.8 at min

        result_resized = instruct_pix2pix_pipe(
            prompt=instruction + ", photorealistic, high quality, natural lighting",
            image=image_resized,
            num_inference_steps=int(30 + intensity * 20),
            image_guidance_scale=img_guidance,
            guidance_scale=7.5,
        ).images[0]

        result_full = result_resized.resize((orig_w, orig_h), Image.LANCZOS)
        # Blend with original so intensity controls effect strength
        blended = Image.blend(image_pil, result_full, alpha=min(1.0, intensity * 1.2))

        return {
            "image_base64": np_image_to_base64_png(np.array(blended)),
            "transformation": transformation,
            "method": "instruct_pix2pix",
        }
    except Exception as e:
        return {"error": "failed", "detail": str(e)}


@app.post("/replace/detect")
async def replace_detect(file: UploadFile = File(...)):
    return await search_image(file)


@app.post("/edit/lighting-filter")
async def apply_lighting_filter(
    file: UploadFile = File(...),
    lighting_filter: str = Form(...),
):
    contents = await file.read()
    try:
        img_np = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    try:
        base = img_np.astype(np.float32)

        if lighting_filter == "red":
            filtered = base.copy()
            filtered[:, :, 1] *= 0.4
            filtered[:, :, 2] *= 0.4
            filtered = np.clip(filtered, 0, 255).astype(np.uint8)
        elif lighting_filter == "green":
            filtered = base.copy()
            filtered[:, :, 0] *= 0.4
            filtered[:, :, 2] *= 0.4
            filtered = np.clip(filtered, 0, 255).astype(np.uint8)
        elif lighting_filter == "blue":
            filtered = base.copy()
            filtered[:, :, 0] *= 0.4
            filtered[:, :, 1] *= 0.4
            filtered = np.clip(filtered, 0, 255).astype(np.uint8)
        elif lighting_filter == "black_and_white":
            # Luminance-weighted conversion with slight contrast boost
            gray = 0.299 * base[:, :, 0] + 0.587 * base[:, :, 1] + 0.114 * base[:, :, 2]
            gray = np.clip((gray - 128) * 1.15 + 128, 0, 255)
            filtered = np.stack([gray, gray, gray], axis=2).astype(np.uint8)
        elif lighting_filter == "golden_hour":
            # Warm sunset: boost red/orange, reduce blue, slight brightness lift
            filtered = base.copy()
            filtered[:, :, 0] = np.clip(filtered[:, :, 0] * 1.25, 0, 255)
            filtered[:, :, 1] = np.clip(filtered[:, :, 1] * 1.05, 0, 255)
            filtered[:, :, 2] = np.clip(filtered[:, :, 2] * 0.55, 0, 255)
            filtered = np.clip(filtered * 1.08, 0, 255).astype(np.uint8)
        elif lighting_filter == "night":
            # Dark scene: desaturate, darken, shift toward deep blue
            gray = 0.299 * base[:, :, 0] + 0.587 * base[:, :, 1] + 0.114 * base[:, :, 2]
            filtered = np.zeros_like(base)
            filtered[:, :, 0] = np.clip(gray * 0.25 + base[:, :, 0] * 0.15, 0, 255)
            filtered[:, :, 1] = np.clip(gray * 0.25 + base[:, :, 1] * 0.15, 0, 255)
            filtered[:, :, 2] = np.clip(gray * 0.35 + base[:, :, 2] * 0.35, 0, 255)
            filtered = np.clip(filtered * 0.55, 0, 255).astype(np.uint8)
        elif lighting_filter == "cool":
            # Cool/overcast daylight: pull down reds, lift blues slightly
            filtered = base.copy()
            filtered[:, :, 0] = np.clip(filtered[:, :, 0] * 0.82, 0, 255)
            filtered[:, :, 1] = np.clip(filtered[:, :, 1] * 0.93, 0, 255)
            filtered[:, :, 2] = np.clip(filtered[:, :, 2] * 1.18, 0, 255)
            filtered = np.clip(filtered, 0, 255).astype(np.uint8)
        else:
            return {
                "error": "invalid_filter",
                "available": ["red", "green", "blue", "black_and_white", "golden_hour", "night", "cool"],
            }

        return {
            "image_base64": np_image_to_base64_png(filtered),
            "filter_applied": lighting_filter,
        }
    except Exception as e:
        return {"error": "filter_failed", "detail": str(e)}


# Video Helpers
def save_upload_to_temp(contents: bytes, suffix: str) -> Path:
    path = TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(contents)
    return path


def apply_scene_edit_np(
    img_np, operation, lighting_filter=None, transformation=None, intensity=0.8
):
    if operation == "lighting":
        if lighting_filter == "red":
            res = img_np.copy()
            res[:, :, 1] = (res[:, :, 1] * 0.5).astype(np.uint8)
            res[:, :, 2] = (res[:, :, 2] * 0.5).astype(np.uint8)
            return res
        elif lighting_filter == "green":
            res = img_np.copy()
            res[:, :, 0] = (res[:, :, 0] * 0.5).astype(np.uint8)
            res[:, :, 2] = (res[:, :, 2] * 0.5).astype(np.uint8)
            return res
        elif lighting_filter == "blue":
            res = img_np.copy()
            res[:, :, 0] = (res[:, :, 0] * 0.5).astype(np.uint8)
            res[:, :, 1] = (res[:, :, 1] * 0.5).astype(np.uint8)
            return res
        elif lighting_filter == "black_and_white":
            return cv2.cvtColor(cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY), cv2.COLOR_GRAY2RGB)
    elif operation == "weather" and transformation:
        # For video, we use a faster simplified weather transform to avoid SD3 timeouts per frame
        intensity = float(np.clip(intensity, 0.1, 1.0))
        base = img_np.astype(np.float32)
        h, w = base.shape[:2]
        if transformation == "snowy":
            overlay = np.zeros_like(base)
            for _ in range(max(150, int(h * w * 0.001 * intensity))):
                x, y = random.randint(0, w - 1), random.randint(0, h - 1)
                cv2.circle(overlay, (x, y), random.randint(1, 2), (255, 255, 255), -1)
            return cv2.addWeighted(base, 1.0, overlay, 0.5, 0).astype(np.uint8)
        elif transformation == "rainy":
            overlay = np.zeros_like(base)
            for _ in range(max(150, int(h * w * 0.001 * intensity))):
                x, y = random.randint(0, w - 1), random.randint(0, h - 1)
                cv2.line(overlay, (x, y), (x + 2, y + 10), (200, 200, 255), 1)
            return cv2.addWeighted(base, 0.8, overlay, 0.2, 0).astype(np.uint8)
        elif transformation == "foggy":
            fog = np.full_like(base, 200)
            return cv2.addWeighted(base, 1 - 0.5 * intensity, fog, 0.5 * intensity, 0).astype(
                np.uint8
            )
        elif transformation == "sunny":
            res = base.copy()
            res[:, :, 0] *= 1 + 0.1 * intensity
            res[:, :, 1] *= 1 + 0.05 * intensity
            return np.clip(res, 0, 255).astype(np.uint8)
        elif transformation == "cloudy":
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            gray_rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB).astype(np.float32)
            return cv2.addWeighted(base, 0.6, gray_rgb, 0.4, 0).astype(np.uint8)
    return img_np


def read_video_frames(video_path: Path):
    if iio:
        try:
            meta = iio.immeta(video_path, plugin="ffmpeg")
            fps = float(meta.get("fps") or 24.0)
            frames = [np.asarray(f).astype(np.uint8) for f in iio.imiter(video_path, plugin="ffmpeg")]
            return frames, {"fps": fps, "frame_count": len(frames)}
        except Exception:
            pass
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames, {"fps": fps, "frame_count": len(frames)}


@app.post("/video/analyze")
async def analyze_video(file: UploadFile = File(...), anchor_count: int = Form(6)):
    contents = await file.read()
    video_path = save_upload_to_temp(contents, ".mp4")
    try:
        frames, meta = read_video_frames(video_path)
        step = max(1, len(frames) // anchor_count)
        anchors = []
        for i in range(0, len(frames), step):
            if len(anchors) >= anchor_count:
                break
            anchors.append(
                {
                    "index": i,
                    "time_seconds": round(i / meta["fps"], 2),
                    "image_base64": np_image_to_base64_png(frames[i]),
                }
            )
        return {"metadata": meta, "anchors": anchors}
    except Exception as e:
        return {"error": "video_analysis_failed", "detail": str(e)}


@app.post("/video/edit")
async def edit_video(
    file: UploadFile = File(...),
    method: str = Form("frame_stitch"),
    operation: str = Form("weather"),
    lighting_filter: Optional[str] = Form(None),
    transformation: Optional[str] = Form(None),
    intensity: float = Form(0.8),
):
    contents = await file.read()
    video_path = save_upload_to_temp(contents, ".mp4")
    try:
        frames, meta = read_video_frames(video_path)
        processed = [
            apply_scene_edit_np(f, operation, lighting_filter, transformation, intensity)
            for f in frames
        ]
        output_path = TEMP_DIR / f"video_{uuid.uuid4().hex}.mp4"
        if imageio:
            with imageio.get_writer(output_path, fps=meta["fps"], codec="libx264") as writer:
                for f in processed:
                    writer.append_data(f)
        else:
            h, w = processed[0].shape[:2]
            writer = cv2.VideoWriter(
                str(output_path), cv2.VideoWriter_fourcc(*"mp4v"), meta["fps"], (w, h)
            )
            for f in processed:
                writer.write(cv2.cvtColor(f, cv2.COLOR_RGB2BGR))
            writer.release()
        return FileResponse(output_path, media_type="video/mp4")
    except Exception as e:
        return {"error": "video_edit_failed", "detail": str(e)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
