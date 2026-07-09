---
title: Road AI
emoji: traffic_light
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Road AI / AutoVision

Road AI is an AI-powered image and video editing application for detecting, removing, adding, replacing, and transforming objects in visual media. It combines a React frontend with a FastAPI backend that runs computer vision and generative AI models such as YOLOv8, Stable Diffusion, and OpenCV-based processing.

The project is designed as an interactive research prototype: upload an image or video, choose an editing workflow, send the media to the backend, and download the processed result.

## The Problem

Editing objects in road scenes, street imagery, and general visual media is often slow and manual. A user may need to:

- Find and label objects in an image.
- Remove an unwanted object while preserving the background.
- Add a new object at a chosen position.
- Replace one detected object with another.
- Change all objects with a matching color.
- Apply weather or scene-level transformations.
- Prototype similar transformations on video clips.

Traditional editing tools require manual masking, careful brush work, and repeated trial and error. For technical users, model experiments also become fragmented across notebooks, scripts, and disconnected interfaces.

## The Solution

Road AI provides one web interface for AI-assisted visual editing. The frontend lets users upload media, select an operation, and review the result. The backend handles detection, masking, generation, blending, caching, and video processing.

The goal is to make advanced image editing workflows easier to test, demonstrate, and extend without switching between multiple tools.

## What You Can Do

- Detect objects in uploaded images with YOLOv8.
- View bounding boxes, class labels, confidence scores, and JSON detection output.
- Remove a selected object using mask-based inpainting.
- Add a new object inside a user-drawn bounding box.
- Replace a detected object with a text-described alternative.
- Detect objects by color and apply bulk color changes.
- Apply scene transformations such as snow, rain, fog, sun, and clouds.
- Analyze and edit video clips with a scene-level prototype pipeline.

## Demo Screens

### Object Detection

![Search and detect interface](Outputs/WhatsApp%20Image%202025-12-02%20at%205.07.41%20PM.jpeg)

YOLOv8-powered object detection with bounding boxes and class counts.

### Object Addition

![Add object interface](Outputs/Web_Photo_Editor%20(2).jpg)

AI-assisted object insertion inside a selected region.

### Object Removal

![Remove object interface](Outputs/Web_Photo_Editor%20(1).jpg)

Object removal with background reconstruction.

### Object Replacement

![Replace object interface](Outputs/Web_Photo_Editor%20(3).jpg)

Detected object replacement using text-guided image editing.

## How It Works

```text
User uploads image or video
          |
          v
React + Vite frontend
          |
          v
FastAPI backend
          |
          +--> YOLOv8 object detection
          +--> Detection cache and object IDs
          +--> Mask generation and image processing
          +--> Stable Diffusion / InstructPix2Pix workflows
          +--> OpenCV and imageio video utilities
          |
          v
Processed media returned to the browser
```

## Architecture

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Radix UI primitives
- Lucide icons

### Backend

- FastAPI
- Python
- YOLOv8 through Ultralytics
- OpenCV
- Pillow
- NumPy
- imageio and ffmpeg for video decoding/export
- Diffusers, Transformers, Torch, and related model tooling

### Core Models and Tools

| Component | Purpose |
| --- | --- |
| YOLOv8m | Object detection and bounding boxes |
| Stable Diffusion / inpainting pipeline | Object removal, object addition, and scene editing |
| InstructPix2Pix-style editing | Text-guided object replacement |
| OpenCV | Mask handling, blending, color transforms, and fallback processing |
| imageio + ffmpeg | Video frame extraction and MP4 export |

## Main Workflows

### 1. Search / Detect

Upload an image and run object detection. The app returns an annotated image, class counts, bounding boxes, confidence scores, and raw JSON output.

### 2. Remove

Upload an image, detect objects, select one of the numbered boxes, and remove it. The backend uses the selected detection and image hash to target the right object.

### 3. Add

Upload an image, draw a bounding box, describe the object to add, and generate a new result.

### 4. Replace

Detect objects in an image, select one, describe the replacement, and generate an edited image.

### 5. Color and Scene Transform

Use the replace/edit panel to find color-matched objects, recolor them, or apply full-scene weather transformations.

### 6. Video Lab

Upload a video clip, analyze representative frames, choose a scene-level editing method, and export an MP4 result. The current video workflow focuses on scene-level edits and temporal smoothing rather than object-level video replacement.

## API Endpoints

```text
GET  /                    Health check
POST /search              Object detection
POST /remove/apply        Object removal
POST /add/apply           Object addition
POST /replace/detect      Detection for replacement
POST /replace/apply       Object replacement
POST /edit/color-detect   Color match preview
POST /edit/color-change   Bulk color transform
POST /edit/transform      Weather and scene transforms
POST /video/analyze       Video analysis
POST /video/edit          Scene-level video editing
```

## Quick Start

### Prerequisites

- Node.js 18 or newer
- npm
- Python 3.9 or newer
- A GPU is strongly recommended for diffusion-based backend features
- Hugging Face access token if using gated model weights
- ngrok auth token if exposing a Colab backend

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Configure the Backend URL

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:8000
```

For a Colab or hosted backend, replace the value with the public HTTPS URL:

```env
VITE_API_URL=https://your-backend-url.ngrok-free.app
```

### 3. Start the Frontend

```bash
npm run dev
```

Vite will print the local development URL, usually `http://localhost:5173`.

### 4. Start the Backend Locally

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

You can verify the backend with:

```bash
curl http://localhost:8000/
```

Expected response:

```json
{"message":"Road-AI Backend is running","status":"ok"}
```

## Google Colab Backend

Google Colab is useful when you need free GPU access for model inference.

1. Upload or open `Road_AI_Backend_Colab_FIXED.ipynb` in Google Colab.
2. Change the runtime to a GPU runtime.
3. Install the required Python packages from the notebook.
4. Add your Hugging Face token if model access is required.
5. Add your ngrok auth token.
6. Run the FastAPI backend inside the notebook.
7. Copy the generated ngrok URL.
8. Put that URL in the frontend `.env` as `VITE_API_URL`.
9. Restart the Vite dev server after changing `.env`.

For the video workflow, see `server/COLAB_VIDEO_SETUP.md`.

## Project Structure

```text
road-ai/
|-- src/
|   |-- components/
|   |   |-- layout/        Header and navigation layout
|   |   |-- tabs/          Search, Remove, Add, Replace, and Video Lab
|   |   `-- ui/            Reusable UI components
|   |-- contexts/          API and theme configuration
|   |-- lib/               Shared utilities
|   `-- App.tsx            Main application shell
|-- server/
|   |-- main.py            FastAPI backend
|   |-- requirements.txt   Python dependencies
|   `-- COLAB_VIDEO_SETUP.md
|-- Outputs/               Demo screenshots and generated examples
|-- Road_AI_Backend_Colab_FIXED.ipynb
|-- package.json
|-- vite.config.ts
`-- Dockerfile
```

## Build

```bash
npm run build
```

The production frontend build is written to `dist/`.

## Deployment

### Frontend

The frontend can be deployed to Netlify, Vercel, or any static hosting provider that supports Vite builds.

Typical settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_URL`

### Backend

Backend deployment options include:

- Google Colab + ngrok for quick GPU experiments.
- Hugging Face Spaces for a more persistent demo environment.
- A GPU cloud VM for production-style inference.

See `DEPLOYMENT.md` and `HUGGINGFACE_SPACES.md` for more deployment details.

## Known Limitations

- Diffusion-based edits can be slow and usually need GPU acceleration.
- Large images may require significant VRAM.
- Free Colab sessions expire and ngrok URLs may change.
- The video workflow is currently scene-level, not full object-level temporal editing.
- Output quality depends on the source image, prompt, selected region, and model availability.

## Why This Project Matters

Road AI turns several complex AI media tasks into one usable workflow. Instead of manually building masks, running separate detection scripts, and moving files between notebooks, users can interact with the whole pipeline from the browser.

It is also a strong foundation for future work in road-scene editing, synthetic dataset generation, visual simulation, safety research, and AI-assisted media tooling.

## Acknowledgements

- Ultralytics for YOLOv8
- Stability AI and Hugging Face for diffusion model tooling
- FastAPI for the backend framework
- React, Vite, and Tailwind CSS for the frontend stack
- OpenCV, Pillow, NumPy, imageio, and ffmpeg for media processing

## License

This repository currently references the MIT License. Add or update a `LICENSE` file if you plan to distribute the project publicly.
