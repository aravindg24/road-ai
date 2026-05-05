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

Paste that full base URL into the frontend `Backend` control, or set it as Netlify env var `VITE_API_URL`.

## Notes

- Free Spaces are CPU-first, so video editing and diffusion pipelines may be slow
- this is still a cleaner demo setup than rebuilding the frontend for every Colab tunnel
- if you later move to a GPU-enabled Space, the frontend can stay exactly the same
