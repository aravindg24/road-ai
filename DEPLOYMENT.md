# Deployment Guide

This project is now set up for the path that fits your workflow best:

- `Netlify` for the React frontend
- `Google Colab` temporarily for backend experiments
- `Hugging Face Spaces` later for a persistent backend

## Recommended architecture

### Frontend

- deploy the Vite app to Netlify
- build command: `npm run build`
- publish directory: `dist`

The repo already includes [netlify.toml](/D:/road-ai/netlify.toml), so Netlify can use the default configuration directly.

### Backend

For now:
- run the backend in Colab and expose it with a public HTTPS URL

Later:
- move the backend to Hugging Face Spaces using the root [Dockerfile](/D:/road-ai/Dockerfile)

## Important frontend behavior

The frontend no longer depends only on a build-time `VITE_API_URL`.

You can now:
- deploy the frontend once
- open the app
- click the `Backend` control in the header
- paste your current backend URL

That runtime override is saved in `localStorage`, which makes Colab and Hugging Face Spaces much easier to use.

## Netlify deployment

### Option 1: Netlify dashboard

1. Push this repo to GitHub.
2. Go to [Netlify](https://www.netlify.com/).
3. Create a new site from Git.
4. Select this repository.
5. Confirm these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Deploy.

### Option 2: Netlify CLI

1. Install the CLI:

```bash
npm install -g netlify-cli
```

2. Login:

```bash
netlify login
```

3. Initialize the site:

```bash
netlify init
```

4. For production deploys:

```bash
netlify deploy --build --prod
```

## Frontend environment options

If you want a default backend URL at build time, create a local `.env` from [.env.example](/D:/road-ai/.env.example):

```env
VITE_API_URL=https://your-default-backend-url
```

This is optional now because the app also supports a runtime override in the header.

## Current free workflow

### While using Colab

1. Start the backend notebook.
2. Expose it with ngrok.
3. Copy the public HTTPS URL.
4. Open the deployed Netlify app.
5. Click the `Backend` control in the header.
6. Paste the Colab URL and save.

No rebuild is needed when the Colab URL changes.

### After moving to Hugging Face Spaces

1. Deploy the backend Space.
2. Copy the Space URL like `https://your-space-name.hf.space`.
3. Paste that into the same frontend `Backend` control.

If you want that Space URL to be the long-term default, set it in Netlify as `VITE_API_URL` and redeploy once.

## Hugging Face Spaces deployment

See [HUGGINGFACE_SPACES.md](/D:/road-ai/HUGGINGFACE_SPACES.md) for the backend packaging steps.

## Quick verification checklist

- `npm run build` succeeds locally
- Netlify site loads
- backend root endpoint returns `{"message":"Road-AI Backend is running","status":"ok"}`
- uploads work against the selected backend URL
