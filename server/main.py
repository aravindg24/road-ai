from fastapi import FastAPI, UploadFile, File, Form
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import numpy as np
import io
import base64
import os
import cv2
import torch
import random
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Set seeds for deterministic behavior
torch.manual_seed(42)
np.random.seed(42)
random.seed(42)
if torch.cuda.is_available():
    torch.cuda.manual_seed(42)
    torch.cuda.manual_seed_all(42)

# Cache for storing detection results to avoid re-detection
detection_cache = {}

app = FastAPI(title="Road-AI Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Road-AI Backend is running", "status": "ok"}

# Load YOLOv8 model once on startup. The ultralytics package will download
# `yolov8m.pt` automatically on first use if it's not present.
MODEL_PATH = "yolov8m.pt"
yolo_model = YOLO(MODEL_PATH)

# Set model to deterministic mode
yolo_model.model.eval()
if hasattr(yolo_model.model, 'model'):
    for module in yolo_model.model.modules():
        if hasattr(module, 'training'):
            module.training = False


def annotate_image_and_collect(results):
    # results: list of ultralytics results; we'll process first result
    r = results[0]
    # convert boxes to numpy
    detections = []

    # Create an image from the original (ultralytics keeps the original)
    if hasattr(r, 'orig_img') and r.orig_img is not None:
        img_np = r.orig_img.copy()
    else:
        img_np = None

    # Boxes are in r.boxes
    for box in r.boxes:
        xyxy = box.xyxy[0].tolist()
        x1, y1, x2, y2 = [int(x) for x in xyxy]
        conf = float(box.conf[0])
        cls = int(box.cls[0])
        label = yolo_model.names.get(cls, str(cls))

        detections.append({
            "label": label,
            "confidence": conf,
            "box": [x1, y1, x2, y2],
        })

    # If we have the image, draw simple boxes using PIL
    annotated_b64 = None
    if img_np is not None:
        img_pil = Image.fromarray(img_np).convert("RGBA")
        draw = Image.new("RGBA", img_pil.size)
        # Draw boxes via Pillow ImageDraw to keep dependencies minimal
        try:
            from PIL import ImageDraw
            d = ImageDraw.Draw(img_pil)
            for det in detections:
                x1, y1, x2, y2 = det["box"]
                d.rectangle([x1, y1, x2, y2], outline=(255, 0, 0, 255), width=3)
                d.text((x1, max(0, y1 - 12)), f"{det['label']} {det['confidence']:.2f}", fill=(255, 255, 255, 255))

            buf = io.BytesIO()
            img_pil.convert("RGB").save(buf, format="PNG")
            annotated_b64 = base64.b64encode(buf.getvalue()).decode()
        except Exception:
            annotated_b64 = None

    # Produce counts
    counts = {}
    for d in detections:
        counts[d["label"]] = counts.get(d["label"], 0) + 1

    return counts, detections, annotated_b64


@app.post("/search")
async def search_image(file: UploadFile = File(...)):
    """Accepts an image file upload; runs YOLOv8m detection and returns counts, detections and annotated image as base64.
    Also caches results for potential remove operations."""
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    # Create a hash of the image to use as cache key
    import hashlib
    img_hash = hashlib.md5(contents).hexdigest()

    # Run detection once with consistent parameters for deterministic results
    results = yolo_model(img_np, verbose=False, conf=0.25, iou=0.45)
    counts, detections, annotated_b64 = annotate_image_and_collect(results)
    
    # Add unique detection IDs and cache for potential remove operations
    for i, detection in enumerate(detections):
        detection['detection_id'] = f"{img_hash}_{i}"
    
    detection_cache[img_hash] = {
        'detections': detections,
        'image_data': contents,
        'img_np': img_np
    }
    
    print(f"[search] Cached {len(detections)} detections for image {img_hash[:8]}")
    for i, det in enumerate(detections):
        print(f"  [{i}] {det['label']} at {det['box']} (conf: {det['confidence']:.3f}) ID: {det['detection_id']}")

    return {
        "counts": counts, 
        "detections": detections, 
        "image_base64": annotated_b64,
        "image_hash": img_hash
    }


# ---------------- REMOVE / INPAINTING HELPERS ----------------
def create_mask_from_box(img_np: np.ndarray, box, expand_ratio=0.12):
    h, w = img_np.shape[:2]
    x1, y1, x2, y2 = map(int, box)

    bw = x2 - x1
    bh = y2 - y1
    x1 = max(0, x1 - int(bw * expand_ratio))
    y1 = max(0, y1 - int(bh * expand_ratio))
    x2 = min(w, x2 + int(bw * expand_ratio))
    y2 = min(h, y2 + int(bh * expand_ratio))

    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    # soften/dilate mask
    mask = cv2.GaussianBlur(mask, (21, 21), 11)
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


def np_image_to_base64_png(img_np: np.ndarray):
    buf = io.BytesIO()
    Image.fromarray(img_np).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@app.post("/remove/apply")
async def remove_apply(
    file: UploadFile = File(...),
    index: Optional[int] = Form(None),
    box: Optional[str] = Form(None),
    detection_id: Optional[str] = Form(None),
    image_hash: Optional[str] = Form(None),
    click_x: Optional[int] = Form(None),
    click_y: Optional[int] = Form(None),
    img_w: Optional[int] = Form(None),
    img_h: Optional[int] = Form(None),
    method: str = Form("auto"),
):
    """Apply inpainting to a selected detection using cached results.

    Uses ONLY cached detection results from the /search endpoint - no additional YOLO calls.
    Requires detection_id + image_hash for exact matching.

    If HUGGINGFACE_TOKEN environment variable is set, this will attempt to call
    the Hugging Face Inference API for `stabilityai/stable-diffusion-2-inpainting`.
    Otherwise it will fall back to an OpenCV inpaint operation and return that.
    """
    contents = await file.read()
    try:
        pil = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(pil)
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    print(f"[remove_apply] Request received:")
    print(f"  - image_hash: {image_hash}")
    print(f"  - detection_id: {detection_id}")
    print(f"  - index: {index}")
    print(f"  - box: {box}")
    print(f"  - cache keys: {list(detection_cache.keys())}")
    
    target_box = None
    target_label = None
    cached_detections = None
    
    # Try to use cached detections first
    if image_hash and image_hash in detection_cache:
        cached_detections = detection_cache[image_hash]['detections']
        print(f"[remove_apply] Using cached detections for image {image_hash[:8]}: {len(cached_detections)} objects")
        
        # If detection_id provided, find exact match
        if detection_id:
            for det in cached_detections:
                if det.get('detection_id') == detection_id:
                    target_box = det['box']
                    target_label = det['label']
                    print(f"[remove_apply] Found exact match for detection_id {detection_id}: {target_label} at {target_box}")
                    break
        
        # Fall back to index if detection_id not found
        if not target_box and index is not None:
            if 0 <= index < len(cached_detections):
                det = cached_detections[index]
                target_box = det['box']
                target_label = det['label']
                print(f"[remove_apply] Using index {index}: {target_label} at {target_box}")
    
    # If no cached result, try to use provided box coordinates
    if not target_box and box:
        try:
            import json
            parsed = json.loads(box)
            if not (isinstance(parsed, list) and len(parsed) == 4):
                return {"error": "invalid_box_format"}
            target_box = [int(x) for x in parsed]
            target_label = "unknown"  # Will be determined later
            print(f"[remove_apply] Using provided box coordinates: {target_box}")
        except Exception as e:
            return {"error": "invalid_box", "detail": str(e)}
    
    # No fresh detection - require cached data
    if not target_box:
        available_hashes = list(detection_cache.keys())
        return {
            "error": "no_cached_data", 
            "detail": f"Please run detection first. Requested hash: {image_hash}, Available: {available_hashes}"
        }

    print(f"[remove_apply] Processing removal for {target_label} at {target_box}")

    # Create mask from the target box
    try:
        mask_np = create_mask_from_box(img_np, target_box, expand_ratio=0.15)
        print(f"[remove_apply] Mask created successfully, shape: {mask_np.shape}")
    except Exception as e:
        print(f"[remove_apply] Error creating mask: {e}")
        return {"error": "mask_creation_failed", "detail": str(e)}
    
    # Save a debug overlay image with the mask and target box for inspection
    try:
        debug_img = img_np.copy()
        # draw target box in red
        cv2.rectangle(debug_img, (target_box[0], target_box[1]), (target_box[2], target_box[3]), (0, 0, 255), 3)
        # add label
        cv2.putText(debug_img, target_label or "unknown", (target_box[0], target_box[1]-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
        # overlay mask in green with alpha
        mask_vis = cv2.cvtColor(mask_np, cv2.COLOR_GRAY2BGR)
        mask_vis = (mask_vis > 0).astype("uint8") * 255
        alpha = 0.35
        debug_vis = cv2.addWeighted(debug_img, 1.0, mask_vis, alpha, 0)
        os.makedirs("debug", exist_ok=True)
        fname = os.path.join("debug", f"remove_{target_label or 'unknown'}_{int(torch.randint(0,1e9,(1,)).item())}.png")
        cv2.imwrite(fname, cv2.cvtColor(debug_vis, cv2.COLOR_RGB2BGR))
        print(f"[remove_apply] debug overlay saved to {fname}")
    except Exception as e:
        print(f"[remove_apply] failed to save debug overlay: {e}")

    hf_token = os.environ.get("HUGGINGFACE_TOKEN")

    # If caller explicitly requested OpenCV, use that regardless of HF token.
    if method.lower() == "opencv" or not hf_token:
        try:
            print(f"[remove_apply] Starting OpenCV inpainting...")
            mask_for_inpaint = (mask_np > 127).astype("uint8") * 255
            print(f"[remove_apply] Mask prepared for inpainting, unique values: {np.unique(mask_for_inpaint)}")
            inpainted = cv2.inpaint(img_np, mask_for_inpaint, 3, cv2.INPAINT_TELEA)
            print(f"[remove_apply] Inpainting complete, applying bilateral filter...")
            inpainted = cv2.bilateralFilter(inpainted, 9, 75, 75)
            print(f"[remove_apply] Filter complete, encoding result...")

            out_b64 = np_image_to_base64_png(inpainted)
            print(f"[remove_apply] ✅ Success! Object '{target_label}' removed using OpenCV")
            return {"image_base64": out_b64, "removed_label": target_label, "box": target_box, "method": "opencv_fallback"}
        except Exception as e:
            print(f"[remove_apply] ❌ OpenCV inpaint failed: {e}")
            return {"error": "inpaint_failed", "detail": str(e)}
    else:
        # Use Hugging Face Inference API for Stable Diffusion 2 Inpainting
        api_url = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-inpainting"
        headers = {"Authorization": f"Bearer {hf_token}"}

        # Prepare images as base64
        img_b64 = np_image_to_base64_png(img_np)
        mask_rgb = cv2.cvtColor(mask_np, cv2.COLOR_GRAY2RGB)
        mask_b64 = np_image_to_base64_png(mask_rgb)

        # Correct format for Hugging Face Inference API
        payload = {
            "inputs": "photorealistic, seamless background, high quality",
            "image": img_b64,
            "mask_image": mask_b64
        }

        try:
            print(f"Calling Hugging Face API...")
            import requests
            resp = requests.post(api_url, headers=headers, json=payload, timeout=120)
            print(f"HF API Response Status: {resp.status_code}")

            if resp.status_code == 200:
                # API returns the image as binary content
                out_b64 = base64.b64encode(resp.content).decode()
                print("✅ Successfully inpainted using Stable Diffusion 2")
                return {"image_base64": out_b64, "removed_label": target_label, "box": target_box, "method": "stable_diffusion_2"}
            else:
                print(f"HF API Error: {resp.text}")
                return {"error": "hf_api_error", "status": resp.status_code, "detail": resp.text}
        except Exception as e:
            print(f"HF Request Exception: {str(e)}")
            return {"error": "hf_request_failed", "detail": str(e)}


@app.post("/edit/lighting-filter")
async def apply_lighting_filter(
    file: UploadFile = File(...),
    lighting_filter: str = Form(...)
):
    """Apply lighting filters to the image: red, green, blue, or black_and_white"""
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
    except Exception as e:
        return {"error": "invalid_image", "detail": str(e)}

    print(f"[lighting-filter] Applying {lighting_filter} filter")

    try:
        # Apply the selected lighting filter
        if lighting_filter == "red":
            # Red filter - boost red channel
            filtered = img_np.copy()
            filtered[:, :, 1] = (filtered[:, :, 1] * 0.5).astype(np.uint8)  # Reduce green
            filtered[:, :, 2] = (filtered[:, :, 2] * 0.5).astype(np.uint8)  # Reduce blue

        elif lighting_filter == "green":
            # Green filter - boost green channel
            filtered = img_np.copy()
            filtered[:, :, 0] = (filtered[:, :, 0] * 0.5).astype(np.uint8)  # Reduce red
            filtered[:, :, 2] = (filtered[:, :, 2] * 0.5).astype(np.uint8)  # Reduce blue

        elif lighting_filter == "blue":
            # Blue filter - boost blue channel
            filtered = img_np.copy()
            filtered[:, :, 0] = (filtered[:, :, 0] * 0.5).astype(np.uint8)  # Reduce red
            filtered[:, :, 1] = (filtered[:, :, 1] * 0.5).astype(np.uint8)  # Reduce green

        elif lighting_filter == "black_and_white":
            # Black and white filter - convert to grayscale
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            filtered = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)

        else:
            available_filters = ["red", "green", "blue", "black_and_white"]
            return {
                "error": "invalid_filter",
                "detail": f"Filter '{lighting_filter}' not supported",
                "available": available_filters
            }

        # Convert result to base64
        result_b64 = np_image_to_base64_png(filtered)
        print(f"[lighting-filter] ✅ Successfully applied {lighting_filter} filter")

        return {
            "image_base64": result_b64,
            "filter_applied": lighting_filter
        }

    except Exception as e:
        print(f"[lighting-filter] ❌ Error: {e}")
        return {"error": "filter_failed", "detail": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
