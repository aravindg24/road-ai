# Deployment Guide for Road-AI

This guide provides instructions for deploying your React + Vite application to various platforms.

## Prerequisites

Before deploying, make sure your application builds successfully:

```bash
npm install
npm run build
```

## Option 1: Deploy to Vercel (Recommended - Easiest)

### Method A: Using Vercel CLI

1. Install Vercel CLI globally:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. For production deployment:
```bash
vercel --prod
```

### Method B: Using Vercel Dashboard

1. Push your code to GitHub (if not already)
2. Go to [vercel.com](https://vercel.com)
3. Sign up/Login with GitHub
4. Click "Add New Project"
5. Import your GitHub repository
6. Vercel will auto-detect Vite settings
7. Click "Deploy"

Your app will be live in minutes with a URL like `https://road-ai.vercel.app`

## Option 2: Deploy to Netlify

### Method A: Using Netlify CLI

1. Install Netlify CLI globally:
```bash
npm install -g netlify-cli
```

2. Login to Netlify:
```bash
netlify login
```

3. Initialize and deploy:
```bash
netlify init
```

4. Follow the prompts and select:
   - Build command: `npm run build`
   - Publish directory: `dist`

5. For subsequent deployments:
```bash
netlify deploy --prod
```

### Method B: Using Netlify Dashboard

1. Push your code to GitHub (if not already)
2. Go to [netlify.com](https://netlify.com)
3. Sign up/Login with GitHub
4. Click "Add new site" → "Import an existing project"
5. Connect to GitHub and select your repository
6. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
7. Click "Deploy site"

Your app will be live with a URL like `https://road-ai.netlify.app`

## Option 3: Deploy to GitHub Pages

1. Install the `gh-pages` package:
```bash
npm install --save-dev gh-pages
```

2. Add these scripts to your `package.json`:
```json
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}
```

3. Update `vite.config.ts` to include the base path:
```typescript
export default defineConfig({
  base: '/road-ai/',
  plugins: [react()],
})
```

4. Deploy:
```bash
npm run deploy
```

5. Enable GitHub Pages in your repository settings:
   - Go to Settings → Pages
   - Select branch: `gh-pages`
   - Click Save

Your app will be available at `https://[username].github.io/road-ai/`

## Option 4: Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com)
3. Sign up/Login with GitHub
4. Click "New" → "Static Site"
5. Connect your repository
6. Configure:
   - Build command: `npm run build`
   - Publish directory: `dist`
7. Click "Create Static Site"

## Environment Variables

If your app uses environment variables:

### Vercel
- Add them in the Vercel dashboard under "Settings" → "Environment Variables"
- Or use `.env` files with prefix `VITE_`

### Netlify
- Add them in the Netlify dashboard under "Site settings" → "Environment variables"
- Or use `.env` files with prefix `VITE_`

## Continuous Deployment

Both Vercel and Netlify offer automatic deployments:
- Every push to your main branch triggers a production deployment
- Pull requests get preview deployments with unique URLs
- No additional configuration needed!

## Troubleshooting

### Build fails
- Make sure `npm run build` works locally
- Check that all dependencies are in `package.json` (not just devDependencies)
- Review build logs for specific errors

### Blank page after deployment
- Check browser console for errors
- Verify the base path is correctly configured
- Ensure all routes have proper redirects (already configured in `netlify.toml` and `vercel.json`)

### Routes not working (404 errors)
- This is already handled by the configuration files
- For Vercel: `vercel.json` handles SPA routing
- For Netlify: `netlify.toml` includes redirect rules

## Recommended: Vercel or Netlify

Both platforms offer:
- ✅ Free tier with generous limits
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Automatic deployments from Git
- ✅ Preview deployments for PRs
- ✅ Easy custom domain setup
- ✅ Excellent performance

Choose Vercel if you might add Next.js features later.
Choose Netlify if you need more flexibility with build plugins.

