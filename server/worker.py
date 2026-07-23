import easyocr
import cv2
import numpy as np
import base64
import asyncio
from concurrent.futures import ProcessPoolExecutor
import os
import logging
import json
from io import BytesIO
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WORKER_COUNT = int(os.getenv("WORKER_COUNT", "2"))
executor = None
reader = None
busy_workers = 0

playwright_context = None
browser = None
page = None

def init_worker_globals():
    """Initializes globals once per worker process."""
    global reader, playwright_context, browser, page
    if reader is None:
        logger.info("Initializing EasyOCR (this may take a moment to load models...)")
        reader = easyocr.Reader(['en', 'ja'], verbose=False)
        logger.info("EasyOCR initialized.")
    if playwright_context is None:
        logger.info("Initializing Playwright...")
        playwright_context = sync_playwright().start()
        browser = playwright_context.chromium.launch(headless=True)
        page = browser.new_page()
        logger.info("Playwright initialized.")

FONT_SIZE_RATIO = {"large": 0.22, "medium": 0.16, "small": 0.11}
FONT_SIZE_START_PX = {"large": 26, "medium": 20, "small": 15}

def render_khmer_text_via_browser(page, text, box_width, box_height, font_size_key, is_bold, is_italic=False, min_font_size=6, is_transparent_bg=False):
    font_family = "Koulen" if font_size_key == "large" else "Kdam Thmor Pro"
    font_weight = 400
    font_style = "italic" if is_italic else "normal"
    line_height = "calc(1.4em + 4px)" if font_size_key == "large" else "calc(1.2em + 4px)"
    start_px = FONT_SIZE_START_PX.get(font_size_key, 18)

    google_font_query = "family=Koulen&family=Kdam+Thmor+Pro"

    bg_style = "background: transparent;" if is_transparent_bg else "background: white; border-radius: 20%;"

    html = f"""<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?{google_font_query}&display=swap" rel="stylesheet">
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: transparent; width: {box_width}px; height: {box_height}px;
       display: flex; align-items: center; justify-content: center; overflow: hidden; }}
#text-container {{
    font-family: '{font_family}', sans-serif;
    font-weight: {font_weight};
    color: black; text-align: center; line-height: {line_height};
    font-style: {font_style};
    word-wrap: break-word; overflow-wrap: break-word;
    width: {box_width}px; height: {box_height}px;
    display: flex; align-items: center; justify-content: center;
    {bg_style}
    padding: 6px;
    overflow: hidden; 
}}
</style></head><body><div id="text-container"></div></body></html>"""

    page.set_viewport_size({"width": box_width, "height": box_height})
    page.set_content(html, wait_until="networkidle")
    result = page.evaluate(f"""async () => {{
        await document.fonts.ready;
        const el = document.getElementById('text-container');
        el.textContent = {json.dumps(text)};
        let fontSize = {start_px};
        el.style.fontSize = fontSize + 'px';
        while ((el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && fontSize > {min_font_size}) {{
            fontSize -= 1;
            el.style.fontSize = fontSize + 'px';
        }}
        return {{
            overflows: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
            scrollWidth: el.scrollWidth,
            scrollHeight: el.scrollHeight
        }};
    }}""")

    if result["overflows"]:
        new_width = max(box_width, result["scrollWidth"] + 6)
        new_height = max(box_height, result["scrollHeight"] + 6)
        if new_height > box_height * 1.2:
            new_width = int(new_width * 1.15)
        page.set_viewport_size({"width": new_width, "height": new_height})
        page.evaluate(f"""() => {{
            const body = document.body;
            const el = document.getElementById('text-container');
            body.style.width = '{new_width}px';
            body.style.height = '{new_height}px';
            el.style.width = '{new_width}px';
            el.style.height = '{new_height}px';
        }}""")
        box_width = new_width
        box_height = new_height

    screenshot_bytes = page.screenshot(type="png", omit_background=True)
    return Image.open(BytesIO(screenshot_bytes)).convert("RGBA"), box_width, box_height

def check_overlap(box1, box2):
    l1, t1, r1, b1 = box1
    l2, t2, r2, b2 = box2
    return not (r1 < l2 or l1 > r2 or b1 < t2 or t1 > b2)

def _process_image_sync(job_data):
    if reader is None or playwright_context is None:
        init_worker_globals()
        
    image_bytes = job_data["image_bytes"]
    text_blocks = job_data.get("text_blocks", [])
    
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None: raise ValueError("Invalid image")
        
    h, w = img.shape[:2]
    result_img = img.copy()
    boxes_img = img.copy()
    
    ocr_results = reader.readtext(img, paragraph=False)
    
    clean_pil = Image.fromarray(cv2.cvtColor(result_img, cv2.COLOR_BGR2RGB)).convert("RGBA")
    draw = ImageDraw.Draw(clean_pil)

    for item in text_blocks:
        box = item.get("box_2d", [])
        khmer_text = item.get("translated_text_khmer", "")
        if len(box) != 4 or not khmer_text:
            continue
            
        ymin, xmin, ymax, xmax = box
        left = max(0, int(xmin * w / 1000))
        top_px = max(0, int(ymin * h / 1000))
        right = min(w, int(xmax * w / 1000))
        bottom = min(h, int(ymax * h / 1000))
        
        box_width = right - left
        box_height = bottom - top_px
        if box_width < 10 or box_height < 10:
            continue
            
        g_box = (left, top_px, right, bottom)
        cv2.rectangle(boxes_img, (left, top_px), (right, bottom), (255, 0, 0), 2)
        
        g_area = box_width * box_height
        
        lines_to_erase = []
        for res in ocr_results:
            res_box = res[0]
            xs = [pt[0] for pt in res_box]
            ys = [pt[1] for pt in res_box]
            ocr_box = (min(xs), min(ys), max(xs), max(ys))
            
            ocr_w = ocr_box[2] - ocr_box[0]
            ocr_h = ocr_box[3] - ocr_box[1]
            ocr_area = ocr_w * ocr_h
            
            if check_overlap(g_box, ocr_box):
                # If EasyOCR box is massively larger than Gemini box, it's a hallucination or bad grouping
                if ocr_area > g_area * 4:
                    continue
                lines_to_erase.append(ocr_box)
                cv2.rectangle(boxes_img, (int(ocr_box[0]), int(ocr_box[1])), (int(ocr_box[2]), int(ocr_box[3])), (0, 0, 255), 2)
                
        if lines_to_erase:
            for l_box in lines_to_erase:
                el, et, er, eb = [int(v) for v in l_box]
                draw.rectangle([el-2, et-2, er+2, eb+2], fill="white")
                cv2.rectangle(result_img, (max(0, el-2), max(0, et-2)), (min(w, er+2), min(h, eb+2)), (255, 255, 255), -1)
        else:
            if g_area > (w * h) * 0.15:
                # Suspiciously large empty box (EasyOCR found nothing), likely hallucinated
                continue
            draw.rectangle([left-2, top_px-2, right+2, bottom+2], fill="white")
            cv2.rectangle(result_img, (max(0, left-2), max(0, top_px-2)), (min(w, right+2), min(h, bottom+2)), (255, 255, 255), -1)

        # Draw Khmer
        font_size_key = item.get("fontSize", "medium")
        is_bold = item.get("isBold", False)
        is_italic = item.get("isItalic", False)
        
        render_width = box_width
        render_height = box_height
        render_left = left
        render_top = top_px
        
        original_text = item.get("original_text", "")
        english_word_count = len(original_text.strip().split())
        khmer_char_length = len(khmer_text)
        is_short_text = english_word_count <= 2 and khmer_char_length <= 10
        
        if is_short_text and font_size_key != "large":
            # Short text needs vertical space for Khmer vowels, but rarely needs massive horizontal expansion
            expand_w = int(box_width * 0.1) # Reduced from 0.4
            expand_h = int(box_height * 0.3)
            render_width = box_width + expand_w
            render_height = box_height + expand_h
            render_left = max(0, left - expand_w // 2)
            render_top = max(0, top_px - expand_h // 2)
            
        is_transparent_bg = is_short_text and font_size_key == "large"
        text_img, final_w, final_h = render_khmer_text_via_browser(
            page, khmer_text, render_width, render_height, font_size_key, is_bold,
            is_italic=is_italic, min_font_size=12 if is_short_text else 10,
            is_transparent_bg=is_transparent_bg
        )
        
        center_x = render_left + render_width // 2
        center_y = render_top + render_height // 2
        new_left = max(0, center_x - final_w // 2)
        new_top = max(0, center_y - final_h // 2)
        
        clean_pil.paste(text_img, (new_left, new_top), text_img)

    final_cv = cv2.cvtColor(np.array(clean_pil.convert("RGB")), cv2.COLOR_RGB2BGR)

    success, encoded_img = cv2.imencode('.jpg', result_img)
    success2, encoded_boxes_img = cv2.imencode('.jpg', boxes_img)
    success3, encoded_final_img = cv2.imencode('.jpg', final_cv)

    if not success or not success2 or not success3:
        raise ValueError("Encode failed")
        
    return {
        "erased_image": base64.b64encode(encoded_img.tobytes()).decode('utf-8'),
        "boxes_image": base64.b64encode(encoded_boxes_img.tobytes()).decode('utf-8'),
        "final_image": base64.b64encode(encoded_final_img.tobytes()).decode('utf-8')
    }

async def process_image_task(job_data, future):
    global busy_workers
    busy_workers += 1
    loop = asyncio.get_running_loop()
    try:
        sync_data = {
            "image_bytes": job_data["image_bytes"],
            "text_blocks": job_data.get("text_blocks", [])
        }
        result = await loop.run_in_executor(executor, _process_image_sync, sync_data)
        future.set_result(result)
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        future.set_exception(e)
    finally:
        busy_workers -= 1

async def worker_loop(queue):
    while True:
        job = await queue.get()
        if job is None:
            queue.task_done()
            break
        future = job["future"]
        await process_image_task(job, future)
        queue.task_done()

workers_tasks = []

def init_workers(queue):
    global executor, workers_tasks
    executor = ProcessPoolExecutor(max_workers=WORKER_COUNT, initializer=init_worker_globals)
    loop = asyncio.get_running_loop()
    for _ in range(WORKER_COUNT):
        task = loop.create_task(worker_loop(queue))
        workers_tasks.append(task)
    logger.info(f"Initialized {WORKER_COUNT} worker loops and process pool.")

def stop_workers():
    global executor, playwright_context
    if executor:
        logger.info("Shutting down worker process pool...")
        executor.shutdown(wait=True)
        
def get_worker_status():
    return {
        "busy": busy_workers,
        "total": WORKER_COUNT
    }
