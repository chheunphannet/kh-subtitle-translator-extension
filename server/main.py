import os
import hashlib
import asyncio
import logging
from contextlib import asynccontextmanager

from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Request, Form
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from worker import get_worker_status, init_workers, stop_workers

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MAX_QUEUE_SIZE = int(os.getenv("MAX_QUEUE_SIZE", "30"))
CACHE_TTL = int(os.getenv("CACHE_TTL", "86400")) # Default 24 hours

# Globals
redis_client = None
job_queue = None

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, job_queue
    logger.info("Starting up server...")
    
    # Initialize Redis connection
    try:
        redis_client = redis.from_url(REDIS_URL)
        await redis_client.ping()
        logger.info(f"Connected to Redis at {REDIS_URL}")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}. Running in NO-CACHE mode.")
        redis_client = None
        
    # Initialize Bounded Queue and Workers
    job_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
    init_workers(job_queue)
    
    yield
    
    # Shutdown
    logger.info("Shutting down server...")
    # Signal workers to stop
    for _ in range(get_worker_status()["total"]):
        if job_queue:
            await job_queue.put(None)
            
    stop_workers()
    
    if redis_client:
        await redis_client.close()

app = FastAPI(lifespan=lifespan, title="Erase Server API")

# Add rate limiter state to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS (allow extension to call it)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static assets paths
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
EXT_DIR = BASE_DIR.parent / "src" / "extension"

# Mount static fonts & icons if directories exist
fonts_dir = STATIC_DIR / "fonts" if (STATIC_DIR / "fonts").exists() else (EXT_DIR / "fonts" if (EXT_DIR / "fonts").exists() else None)
if fonts_dir and fonts_dir.exists():
    app.mount("/fonts", StaticFiles(directory=str(fonts_dir)), name="fonts")

icons_dir = STATIC_DIR / "icons" if (STATIC_DIR / "icons").exists() else (BASE_DIR.parent / "jw-subtitle-tester" / "icons" if (BASE_DIR.parent / "jw-subtitle-tester" / "icons").exists() else None)
if icons_dir and icons_dir.exists():
    app.mount("/icons", StaticFiles(directory=str(icons_dir)), name="icons")

@app.get("/", response_class=HTMLResponse)
@app.get("/guide.html", response_class=HTMLResponse)
async def serve_guide():
    for candidate in [STATIC_DIR / "guide.html", EXT_DIR / "guide.html", BASE_DIR / "guide.html"]:
        if candidate.exists():
            return FileResponse(candidate)
    return HTMLResponse("<h1>khtranslator Guide</h1><p>Guide file not found.</p>", status_code=404)

@app.get("/guide.js")
async def serve_guide_js():
    for candidate in [STATIC_DIR / "guide.js", EXT_DIR / "guide.js", BASE_DIR / "guide.js"]:
        if candidate.exists():
            return FileResponse(candidate, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/health")
async def health_check():
    status_info = get_worker_status()
    queue_depth = job_queue.qsize() if job_queue else 0
    return {
        "status": "ok",
        "queue_depth": queue_depth,
        "workers_busy": status_info["busy"],
        "workers_total": status_info["total"]
    }

@app.post("/erase")
@limiter.limit("60/minute") # Rate limit: 60 requests per minute per IP
async def erase_image(
    request: Request, 
    image: UploadFile = File(...), 
    text_blocks: str = Form("[]"), 
    model: str = Form(None),
    request_id: str = None
):
    # 1. Read and validate image
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image uploaded.")
        
    import json
    try:
        parsed_blocks = json.loads(text_blocks)
    except Exception:
        parsed_blocks = []
        
    # 2. Check Cache — keyed by image + model so different models have isolated caches
    model_str = (model or "").encode('utf-8')
    img_hash = hashlib.sha256(b"v2_" + image_bytes + model_str).hexdigest()
    
    if redis_client:
        try:
            cached_result = await redis_client.get(img_hash)
            if cached_result:
                logger.info(f"Cache HIT for {img_hash}")
                try:
                    data = json.loads(cached_result.decode("utf-8"))
                    return {
                        "status": "ok",
                        "cached": True,
                        **data
                    }
                except json.JSONDecodeError:
                    return {
                        "status": "ok",
                        "cached": True,
                        "erased_image": cached_result.decode("utf-8")
                    }
        except Exception as e:
            logger.warning(f"Redis cache GET error: {e}")

    # 2b. Cache-only check mode: if text_blocks is empty, don't process — just report miss
    if not parsed_blocks:
        logger.info(f"Cache-only check for {img_hash} — MISS (no text_blocks provided)")
        return {"status": "ok", "cached": False, "cache_miss": True}

    logger.info(f"Cache MISS for {img_hash} - Submitting to queue")

    # 3. Submit to bounded queue
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    
    try:
        job_queue.put_nowait({
            "image_bytes": image_bytes, 
            "text_blocks": parsed_blocks,
            "future": future
        })
    except asyncio.QueueFull:
        logger.warning(f"Queue full! Rejecting request_id={request_id}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "busy"}
        )
    
    # 4. Wait for worker processing
    try:
        # Client handles their own timeout, but we can set one here too if we want.
        # For now, rely on queue size and worker throughput to bound wait times.
        result_data = await future
    except Exception as e:
        logger.error(f"Error processing image in worker: {e}")
        raise HTTPException(status_code=500, detail="Error processing image")
        
    # 5. Store result in cache
    if redis_client:
        try:
            import json
            await redis_client.setex(name=img_hash, time=CACHE_TTL, value=json.dumps(result_data))
            logger.info(f"Cached result for {img_hash}")
        except Exception as e:
            logger.warning(f"Redis cache SET error: {e}")
            
    return {
        "status": "ok",
        "cached": False,
        **result_data
    }
