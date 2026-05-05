# Hugging Face Spaces Backend Setup

This repo is prepared for a Docker-based Hugging Face Space that runs the FastAPI backend from `server/main.py`.

## Why this split works

- `Netlify` hosts the React frontend well
- `Hugging Face Spaces` is a better long-term home for the Python inference API
- the frontend now supports a runtime backend URL override, so you can switch from Colab to Spaces without rebuilding

## What is already configured

- root `Dockerfile` for a Docker Space
- `server/requirements.txt` for backend dependencies
- frontend runtime backend URL switching via the header control

## Create the Space

1. Go to [Hugging Face Spaces](https://huggingface.co/spaces)
2. Create a new Space
3. Choose:
   - SDK: `Docker`
   - Visibility: your choice
4. Connect the Space to this repository, or push this repo into the Space repository

## Environment and secrets

If you use protected models or gated downloads, add:

- `HF_TOKEN`

in the Space settings.

## Resulting backend URL

After deployment, the backend URL will look like:

`https://your-space-name.hf.space`

### 1. Connect via Frontend (Runtime)
You can paste that full base URL into the **Backend** control in the top-right of the application.

### 2. Connect via Netlify (Permanent)
To make this the default for everyone:
1. Go to your **Netlify Dashboard**.
2. Select your project -> **Site settings**.
3. Navigate to **Build & deploy** -> **Environment variables**.
4. Add a variable:
   - Key: `VITE_API_URL`
   - Value: `https://your-space-name.hf.space`
5. **Redeploy** your site (or trigger a new build) for the changes to take effect.

## Notes

- **Docker Build:** The `Dockerfile` is configured to download the YOLO model during build, so the Space will be ready to serve requests immediately.
- **Free Spaces:** Free Spaces are CPU-first, so video editing and detection might have a slight delay.
- **Transience:** The `temp/` directory used for video processing is local to the container and will be cleared when the Space restarts.
