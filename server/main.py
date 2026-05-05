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
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from ultralytics import YOLO

try:
    import imageio
    import imageio.v3 as iio
except Exception:
    imageio = None
    iio = None

load_dotenv()

torch.manual_seed(42)
np.random.seed(42)
random.seed(42)
if torch.cuda.is_available():
    torch.cuda.manual_seed(42)
    torch.cuda.manual_seed_all(42)

detection_cache = {}
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Road-AI Search API")

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


@app.get("/")
def root():
    return {"message": "Road-AI Backend is running", "status": "ok"}


MODEL_PATH = "yolov8m.pt"
yolo_model = YOLO(MODEL_PATH)
yolo_model.model.eval()
if hasattr(yolo_model.model, "model"):
    for module in yolo_model.model.modules():
        if hasattr(module, "training"):
            module.training = False


def annotate_image_and_collect(results):
    r = results[0]
    detections = []

    img_np = r.orig_img.copy() if hasattr(r, "orig_img") and r.orig_img is not None else None

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

            draw = ImageDraw.Draw(img_pil)
            for det in detections:
                x1, y1, x2, y2 = det["box"]
                draw.rectangle([x1, y1, x2, y2], outline=(255, 0, 0, 255), width=3)
                draw.text(
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
    for det in detections:
        counts[det["label"]] = counts.get(det["label"], 0) + 1

    return counts, detections, annotated_b64


def image_hash_from_bytes(contents: bytes) -> str:
    return hashlib.md5(contents).hexdigest()


def np_image_to_base64_png(img_np: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(img_np.astype(np.uint8)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


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
    mask = cv2.GaussianBlur(mask, (21, 21), 11)
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


def apply_lighting_filter_np(img_np: np.ndarray, lighting_filter: str) -> np.ndarray:
    filtered = img_np.copy()

    if lighting_filter == "red":
        filtered[:, :, 1] = (filtered[:, :, 1] * 0.5).astype(np.uint8)
        filtered[:, :, 2] = (filtered[:, :, 2] * 0.5).astype(np.uint8)
    elif lighting_filter == "green":
        filtered[:, :, 0] = (filtered[:, :, 0] * 0.5).astype(np.uint8)
        filtered[:, :, 2] = (filtered[:, :, 2] * 0.5).astype(np.uint8)
    elif lighting_filter == "blue":
        filtered[:, :, 0] = (filtered[:, :, 0] * 0.5).astype(np.uint8)
        filtered[:, :, 1] = (filtered[:, :, 1] * 0.5).astype(np.uint8)
    elif lighting_filter == "black_and_white":
        gray = cv2.cvtColor(filtered, cv2.COLOR_RGB2GRAY)
        filtered = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    else:
        raise ValueError(f"Unsupported lighting filter: {lighting_filter}")

    return filtered


def add_weather_particles(canvas: np.ndarray, count: int, color, length_range=(4, 12), thickness=1):
    h, w = canvas.shape[:2]
    for _ in range(count):
        x = random.randint(0, w - 1)
        y = random.randint(0, h - 1)
        length = random.randint(*length_range)
        x2 = min(w - 1, x + random.randint(-2, 2))
        y2 = min(h - 1, y + length)
        cv2.line(canvas, (x, y), (x2, y2), color, thickness)


def apply_weather_transform_np(img_np: np.ndarray, transformation: str, intensity: float) -> np.ndarray:
    intensity = float(np.clip(intensity, 0.1, 1.0))
    base = img_np.astype(np.float32)
    h, w = base.shape[:2]

    if transformation == "snowy":
        overlay = np.zeros_like(base)
        particle_count = max(150, int(h * w * 0.0012 * intensity))
        add_weather_particles(overlay, particle_count, (255, 255, 255), length_range=(1, 5), thickness=1)
        blurred = cv2.GaussianBlur(overlay, (5, 5), 0)
        cooled = base * np.array([0.92, 0.96, 1.05], dtype=np.float32)
        result = cv2.addWeighted(cooled, 1.0, blurred.astype(np.float32), 0.55, 10)
    elif transformation == "rainy":
        overlay = np.zeros_like(base)
        particle_count = max(180, int(h * w * 0.0014 * intensity))
        add_weather_particles(overlay, particle_count, (190, 205, 255), length_range=(8, 18), thickness=1)
        darkened = base * (0.82 - 0.12 * intensity)
        darkened[:, :, 2] *= 1.05
        result = cv2.addWeighted(darkened, 1.0, overlay.astype(np.float32), 0.45, 0)
    elif transformation == "foggy":
        fog_color = np.full_like(base, 220, dtype=np.float32)
        blur = cv2.GaussianBlur(base, (0, 0), sigmaX=8 + 10 * intensity)
        result = cv2.addWeighted(blur, 0.55, fog_color, 0.45 * intensity, 0)
    elif transformation == "sunny":
        warm = base.copy()
        warm[:, :, 0] *= 1.08
        warm[:, :, 1] *= 1.03
        gradient = np.zeros((h, w, 3), dtype=np.float32)
        center_x = int(w * 0.7)
        center_y = int(h * 0.25)
        max_radius = max(1.0, math.hypot(w, h) * 0.55)
        for y in range(h):
            for x in range(w):
                distance = math.hypot(x - center_x, y - center_y)
                glow = max(0.0, 1.0 - distance / max_radius)
                gradient[y, x] = np.array([55, 35, 0], dtype=np.float32) * glow * intensity
        result = np.clip(warm + gradient + 12 * intensity, 0, 255)
    elif transformation == "cloudy":
        gray = cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        gray_rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB).astype(np.float32)
        result = cv2.addWeighted(base, 0.55, gray_rgb, 0.45, -8 * intensity)
    else:
        raise ValueError(f"Unsupported weather transformation: {transformation}")

    return np.clip(result, 0, 255).astype(np.uint8)


def apply_scene_edit_np(
    img_np: np.ndarray,
    operation: str,
    lighting_filter: Optional[str] = None,
    transformation: Optional[str] = None,
    intensity: float = 0.8,
) -> np.ndarray:
    if operation == "lighting":
        if not lighting_filter:
            raise ValueError("lighting_filter is required for lighting operation")
        return apply_lighting_filter_np(img_np, lighting_filter)
    if operation == "weather":
        if not transformation:
            raise ValueError("transformation is required for weather operation")
        return apply_weather_transform_np(img_np, transformation, intensity)
    raise ValueError(f"Unsupported operation: {operation}")


def save_upload_to_temp(contents: bytes, suffix: str) -> Path:
    path = TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(contents)
    return path


def _read_video_frames_opencv(video_path: Path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Could not open uploaded video")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    frames = []
    while True:
        success, frame_bgr = cap.read()
        if not success:
            break
        frames.append(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    cap.release()

    duration = (len(frames) / fps) if fps else 0.0
    metadata = {
        "fps": float(fps),
        "frame_count": len(frames) if frames else frame_count,
        "width": width,
        "height": height,
        "duration_seconds": round(duration, 2),
        "reader": "opencv",
    }
    return frames, metadata


def _read_video_frames_imageio(video_path: Path):
    if iio is None:
        raise ValueError("imageio is not available")

    metadata_raw = iio.immeta(video_path, plugin="ffmpeg")
    fps = float(metadata_raw.get("fps") or 24.0)
    frame_count = int(metadata_raw.get("nframes") or 0)
    frames = [np.asarray(frame).astype(np.uint8) for frame in iio.imiter(video_path, plugin="ffmpeg")]

    if not frames:
        raise ValueError("No frames decoded from uploaded video")

    height, width = frames[0].shape[:2]
    duration = len(frames) / fps if fps else 0.0
    metadata = {
        "fps": fps,
        "frame_count": len(frames) if frames else frame_count,
        "width": width,
        "height": height,
        "duration_seconds": round(duration, 2),
        "reader": "imageio_ffmpeg",
    }
    return frames, metadata


def read_video_frames(video_path: Path):
    last_error = None

    if iio is not None:
        try:
            return _read_video_frames_imageio(video_path)
        except Exception as exc:
            last_error = exc

    try:
        return _read_video_frames_opencv(video_path)
    except Exception as exc:
        if last_error is not None:
            raise ValueError(
                f"Video decode failed with imageio/ffmpeg ({last_error}) and OpenCV ({exc})"
            ) from exc
        raise


def compute_frame_deltas(frames: list[np.ndarray]) -> list[float]:
    if len(frames) <= 1:
        return [0.0 for _ in frames]

    deltas = [0.0]
    prev_small = cv2.resize(cv2.cvtColor(frames[0], cv2.COLOR_RGB2GRAY), (160, 90))
    for frame in frames[1:]:
        curr_small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY), (160, 90))
        delta = float(np.mean(cv2.absdiff(curr_small, prev_small)))
        deltas.append(delta)
        prev_small = curr_small
    return deltas


def select_anchor_indices(frame_count: int, deltas: list[float], anchor_count: int) -> list[int]:
    if frame_count == 0:
        return []
    if frame_count <= anchor_count:
        return list(range(frame_count))

    anchor_count = max(2, min(anchor_count, frame_count))
    candidates = {0, frame_count - 1}

    if anchor_count > 2:
        ranked = sorted(range(1, frame_count - 1), key=lambda idx: deltas[idx], reverse=True)
        for idx in ranked:
            candidates.add(idx)
            if len(candidates) >= anchor_count:
                break

    uniform = np.linspace(0, frame_count - 1, num=anchor_count, dtype=int)
    candidates.update(int(idx) for idx in uniform.tolist())
    selected = sorted(candidates)
    return selected[:anchor_count]


def warp_previous_output(prev_frame: np.ndarray, curr_frame: np.ndarray, prev_output: np.ndarray) -> np.ndarray:
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_RGB2GRAY)
    curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_RGB2GRAY)
    flow = cv2.calcOpticalFlowFarneback(
        curr_gray,
        prev_gray,
        None,
        pyr_scale=0.5,
        levels=3,
        winsize=15,
        iterations=3,
        poly_n=5,
        poly_sigma=1.2,
        flags=0,
    )
    h, w = curr_gray.shape
    grid_x, grid_y = np.meshgrid(np.arange(w), np.arange(h))
    map_x = (grid_x + flow[:, :, 0]).astype(np.float32)
    map_y = (grid_y + flow[:, :, 1]).astype(np.float32)
    return cv2.remap(prev_output, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def write_video(frames: list[np.ndarray], fps: float) -> Path:
    if not frames:
        raise ValueError("No frames available to write")

    output_path = TEMP_DIR / f"video_edit_{uuid.uuid4().hex}.mp4"

    if imageio is not None:
        try:
            with imageio.get_writer(
                output_path,
                fps=max(float(fps), 1.0),
                codec="libx264",
                format="FFMPEG",
            ) as writer:
                for frame in frames:
                    writer.append_data(frame.astype(np.uint8))
            return output_path
        except Exception:
            pass

    h, w = frames[0].shape[:2]
    writer = cv2.VideoWriter(str(output_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        raise ValueError("Could not open MP4 writer")

    for frame in frames:
        writer.write(cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
    writer.release()
    return output_path


@app.post("/search")
async def search_image(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
    except Exception as exc:
        return {"error": "invalid_image", "detail": str(exc)}

    img_hash = image_hash_from_bytes(contents)
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


@app.post("/replace/detect")
async def replace_detect(file: UploadFile = File(...)):
    return await search_image(file)


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
    contents = await file.read()
    try:
        pil = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(pil)
    except Exception as exc:
        return {"error": "invalid_image", "detail": str(exc)}

    target_box = None
    target_label = None

    if image_hash and image_hash in detection_cache:
        cached_detections = detection_cache[image_hash]["detections"]
        if detection_id:
            for det in cached_detections:
                if det.get("detection_id") == detection_id:
                    target_box = det["box"]
                    target_label = det["label"]
                    break

        if not target_box and index is not None and 0 <= index < len(cached_detections):
            det = cached_detections[index]
            target_box = det["box"]
            target_label = det["label"]

    if not target_box and box:
        try:
            parsed = json.loads(box)
            if isinstance(parsed, list) and len(parsed) == 4:
                target_box = [int(x) for x in parsed]
                target_label = "unknown"
        except Exception as exc:
            return {"error": "invalid_box", "detail": str(exc)}

    if not target_box:
        return {
            "error": "no_cached_data",
            "detail": f"Please run detection first. Requested hash: {image_hash}",
        }

    try:
        mask_np = create_mask_from_box(img_np, target_box, expand_ratio=0.15)
        mask_for_inpaint = (mask_np > 127).astype("uint8") * 255
        inpainted = cv2.inpaint(img_np, mask_for_inpaint, 3, cv2.INPAINT_TELEA)
        inpainted = cv2.bilateralFilter(inpainted, 9, 75, 75)
        out_b64 = np_image_to_base64_png(inpainted)
        return {
            "image_base64": out_b64,
            "removed_label": target_label,
            "box": target_box,
            "method": "opencv_fallback" if method.lower() == "opencv" or True else method,
        }
    except Exception as exc:
        return {"error": "inpaint_failed", "detail": str(exc)}


@app.post("/edit/lighting-filter")
async def apply_lighting_filter(
    file: UploadFile = File(...),
    lighting_filter: str = Form(...),
):
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
        filtered = apply_lighting_filter_np(img_np, lighting_filter)
    except ValueError as exc:
        return {
            "error": "invalid_filter",
            "detail": str(exc),
            "available": ["red", "green", "blue", "black_and_white"],
        }
    except Exception as exc:
        return {"error": "invalid_image", "detail": str(exc)}

    return {
        "image_base64": np_image_to_base64_png(filtered),
        "filter_applied": lighting_filter,
    }


@app.post("/edit/transform")
async def apply_scene_transform(
    file: UploadFile = File(...),
    transformation: str = Form(...),
    intensity: float = Form(0.8),
):
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(img)
        transformed = apply_weather_transform_np(img_np, transformation, intensity)
    except ValueError as exc:
        return {
            "error": "invalid_transformation",
            "detail": str(exc),
            "available": ["snowy", "rainy", "foggy", "sunny", "cloudy"],
        }
    except Exception as exc:
        return {"error": "invalid_image", "detail": str(exc)}

    return {
        "image_base64": np_image_to_base64_png(transformed),
        "transformation": transformation,
        "intensity": intensity,
    }


@app.post("/video/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    anchor_count: int = Form(6),
):
    contents = await file.read()
    video_path = save_upload_to_temp(contents, ".mp4")

    try:
        frames, metadata = read_video_frames(video_path)
        deltas = compute_frame_deltas(frames)
        anchors = select_anchor_indices(len(frames), deltas, anchor_count)
        anchor_previews = []

        for idx in anchors:
            frame = frames[idx]
            anchor_previews.append(
                {
                    "index": idx,
                    "time_seconds": round(idx / metadata["fps"], 2) if metadata["fps"] else 0.0,
                    "change_score": round(deltas[idx], 3),
                    "image_base64": np_image_to_base64_png(frame),
                }
            )

        recommended_method = "keyframe_propagation" if metadata["frame_count"] > 24 else "frame_stitch"
        return {
            "metadata": metadata,
            "anchors": anchor_previews,
            "recommendations": {
                "recommended_method": recommended_method,
                "anchor_count": len(anchors),
                "notes": [
                    "Use frame_stitch as a baseline for fully independent frame editing.",
                    "Use keyframe_propagation when you want temporal smoothing between anchor refreshes.",
                    "Scene-level transforms are implemented today; object-level propagation is the next research step.",
                ],
            },
        }
    except Exception as exc:
        return {"error": "video_analysis_failed", "detail": str(exc)}


@app.post("/video/edit")
async def edit_video(
    file: UploadFile = File(...),
    method: str = Form("keyframe_propagation"),
    operation: str = Form("weather"),
    lighting_filter: Optional[str] = Form(None),
    transformation: Optional[str] = Form(None),
    intensity: float = Form(0.8),
    anchor_count: int = Form(6),
):
    contents = await file.read()
    video_path = save_upload_to_temp(contents, ".mp4")

    try:
        frames, metadata = read_video_frames(video_path)
        if not frames:
            return {"error": "empty_video", "detail": "No frames found in uploaded video"}

        deltas = compute_frame_deltas(frames)
        anchors = set(select_anchor_indices(len(frames), deltas, anchor_count))

        processed_frames = []
        prev_frame = None
        prev_output = None
        for idx, frame in enumerate(frames):
            current_edited = apply_scene_edit_np(frame, operation, lighting_filter, transformation, intensity)

            if method == "frame_stitch" or prev_frame is None or prev_output is None or idx in anchors:
                output_frame = current_edited
            elif method == "keyframe_propagation":
                warped_prev = warp_previous_output(prev_frame, frame, prev_output)
                output_frame = cv2.addWeighted(current_edited, 0.72, warped_prev, 0.28, 0)
            else:
                return {
                    "error": "invalid_method",
                    "detail": f"Unsupported method: {method}",
                    "available": ["frame_stitch", "keyframe_propagation"],
                }

            processed_frames.append(output_frame)
            prev_frame = frame
            prev_output = output_frame

        output_path = write_video(processed_frames, metadata["fps"])
        response_metadata = {
            **metadata,
            "anchor_count": len(anchors),
            "method": method,
            "operation": operation,
        }

        headers = {
            "X-Video-Metadata": json.dumps(response_metadata),
            "X-Video-Method": method,
            "X-Video-Operation": operation,
            "X-Video-Output": output_path.name,
        }
        return FileResponse(
            path=output_path,
            media_type="video/mp4",
            filename=f"edited-{operation}-{method}.mp4",
            headers=headers,
        )
    except ValueError as exc:
        detail = str(exc)
        if "Unsupported lighting filter" in detail:
            return {"error": "invalid_filter", "detail": detail}
        if "Unsupported weather transformation" in detail:
            return {"error": "invalid_transformation", "detail": detail}
        return {"error": "video_edit_failed", "detail": detail}
    except Exception as exc:
        return {"error": "video_edit_failed", "detail": str(exc)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
