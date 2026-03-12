FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (PyTorch CPU — saves ~2GB vs GPU build)
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create working directories
RUN mkdir -p uploads exports masks uploads/keyframes

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
