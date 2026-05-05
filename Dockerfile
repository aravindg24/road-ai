FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better caching
COPY server/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the server code
COPY server/ .

# Pre-download the YOLO model to the image
# This ensures it is baked into the image and ready for the first request
RUN python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')"

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
