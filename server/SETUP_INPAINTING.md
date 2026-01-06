# Setting Up Stable Diffusion 2 Inpainting

## Current Situation
- Your system: **CPU only** (no GPU)
- Running SD2 locally on CPU: **Very slow** (2-5 minutes per image)

## Recommended Solution: Hugging Face Inference API

### Why Use Hugging Face API?
✅ Runs on **their GPUs** (fast, ~5-10 seconds per image)
✅ **FREE tier** available
✅ Same **Stable Diffusion 2 Inpainting** model
✅ No local installation needed
✅ Already implemented in your code

### Setup Steps (5 minutes):

#### 1. Create Hugging Face Account
- Go to: https://huggingface.co/join
- Sign up (free)

#### 2. Get API Token
- Go to: https://huggingface.co/settings/tokens
- Click "New token"
- Name: `road-ai-inpainting`
- Type: **Read**
- Click "Generate"
- Copy the token (starts with `hf_...`)

#### 3. Add Token to Backend
Create a file: `D:\road-ai\server\.env`

```bash
HUGGINGFACE_TOKEN=hf_your_token_here
```

#### 4. Install python-dotenv (if not installed)
```bash
pip install python-dotenv
```

#### 5. Update main.py to load .env
Add at the top of `server/main.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

#### 6. Restart Backend Server
- Stop current server (Ctrl+C)
- Run: `python main.py`

### That's it!
Your Remove feature will now use Stable Diffusion 2 running on Hugging Face's GPUs.

---

## Alternative Options (Not Recommended for CPU):

### Option 2: Local SD2 on CPU
- **Speed**: 2-5 minutes per image ❌
- **Quality**: Same as API ✅
- **Cost**: Free ✅
- **Verdict**: Too slow for practical use

### Option 3: Use Google Colab (like your notebook)
- **Speed**: Fast (Colab provides free GPU) ✅
- **Cost**: Free (with limits) ✅
- **Complexity**: Need to run backend on Colab + ngrok ⚠️
- **Verdict**: Good for testing, not for permanent solution

### Option 4: Smaller/Faster Models
- **LaMa** (Fast inpainting model)
- **MAT** (Mask-Aware Transformer)
- **Speed**: Much faster on CPU ✅
- **Quality**: Good but not as good as SD2 ⚠️

---

## Current Fallback
If no Hugging Face token is set, your app uses:
- **OpenCV TELEA inpainting**
- Very fast, basic quality
- Good for simple backgrounds
