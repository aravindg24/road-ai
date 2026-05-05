# Google Colab Backend Setup For Video Endpoints

Use this when your backend is running from a Colab notebook and you want the new video workflow to work from the frontend.

## What Changed

The backend now prefers `imageio + ffmpeg` for video decoding and MP4 export, with OpenCV only as a fallback. That is a much better fit for Colab than relying on `cv2.VideoCapture()` alone.

## Colab Runtime

Use a GPU runtime if you also want diffusion features later, but the current scene-level video pipeline does not strictly require it.

## Recommended Colab Cells

### 1. Install dependencies

```python
!apt-get update -qq
!apt-get install -y -qq ffmpeg
!pip install -q fastapi "uvicorn[standard]" python-multipart pillow numpy opencv-python-headless ultralytics requests python-dotenv imageio imageio-ffmpeg pyngrok
```

If you want the rest of your image-generation stack in the same notebook, also install:

```python
!pip install -q diffusers transformers accelerate safetensors torch torchvision
```

### 2. Pull your repo or upload the backend files

```python
%cd /content
!git clone <your-repo-url> road-ai
%cd /content/road-ai/server
```

If you are not cloning the repo, upload `server/main.py` and `server/requirements.txt` into the Colab workspace and `cd` into that folder.

### 3. Add secrets

Create `/content/road-ai/server/.env` if you need Hugging Face inpainting:

```python
%%writefile /content/road-ai/server/.env
HUGGINGFACE_TOKEN=hf_your_token_here
```

### 4. Start FastAPI inside Colab

```python
import os
os.chdir("/content/road-ai/server")
```

```python
!uvicorn main:app --host 0.0.0.0 --port 8000
```

Run this in its own cell and leave it active.

### 5. Expose the API with ngrok

Open a second notebook cell:

```python
from pyngrok import ngrok

ngrok.set_auth_token("YOUR_NGROK_AUTH_TOKEN")
public_url = ngrok.connect(8000, "http")
print(public_url)
```

Copy the printed HTTPS URL.

## Frontend Configuration

Update the frontend `.env` in the repo root:

```bash
VITE_API_URL=https://your-ngrok-url.ngrok-free.app
```

If you are using a different ngrok domain suffix, keep whatever HTTPS URL Colab prints.

## Endpoints You Should Be Able To Hit

Once the notebook is running, these should work:

- `GET /`
- `POST /video/analyze`
- `POST /video/edit`

## Quick Health Checks

From your local machine:

```bash
curl https://your-ngrok-url.ngrok-free.app/
```

Expected response:

```json
{"message":"Road-AI Backend is running","status":"ok"}
```

For video analysis:

```bash
curl -X POST \
  -F "file=@sample.mp4" \
  -F "anchor_count=6" \
  https://your-ngrok-url.ngrok-free.app/video/analyze
```

## Notes

- Colab usually handles `ffmpeg`-based decoding much more reliably than the local Windows OpenCV setup.
- If a video still fails, it is more likely to be a malformed upload or a very unusual codec rather than the previous `cv2.VideoCapture.read()` issue.
- The current video pipeline is scene-level. Object-level temporal editing would still need masks, tracking, and propagation logic on top of this backend.
