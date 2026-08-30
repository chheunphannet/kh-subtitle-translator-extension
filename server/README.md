# Erase Server API

This is the backend server responsible for erasing original text from manga images using EasyOCR and OpenCV. 
It features a bounded job queue, a fixed-size worker pool, Redis caching, and rate limiting to prevent overload.

## Prerequisites

1. **Python 3.8+**
2. **Redis** server running locally (or adjust `REDIS_URL` in environment).

## Installation

You can install the dependencies using `pip` (or `uv` if preferred):

```bash
cd server
pip install -r requirements.txt
```

> **Note**: For GPU acceleration with EasyOCR and PyTorch, you may need to install the CUDA-enabled version of PyTorch according to the [PyTorch website](https://pytorch.org/get-started/locally/) before installing `easyocr`.

## Running the Server

Start the server using `uvicorn`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Configuration

You can configure the server using environment variables:

- `REDIS_URL`: URL to the Redis server (default: `redis://localhost:6379`)
- `MAX_QUEUE_SIZE`: Maximum number of jobs in the queue before returning `503 Busy` (default: `30`)
- `WORKER_COUNT`: Number of worker processes in the pool (default: `2`). Adjust this based on your GPU/CPU capacity.
- `CACHE_TTL`: Time-to-live for cached images in seconds (default: `86400` / 24 hours).

## API Endpoints

- `GET /health`: Returns server status, queue depth, and worker usage.
- `POST /erase`: Upload a manga image to be erased. Returns a base64 encoded image or `503 Busy` if the server is overloaded.

## Linux VM / VPS Deployment & Maintenance

For complete step-by-step commands to manage the server background process (`systemd`), view live logs (`journalctl`), manage Redis cache, and pull GitHub updates on a Linux VM, see:
👉 **[Linux VM / VPS Command Cheat Sheet](../VM-COMMANDS.md)**
