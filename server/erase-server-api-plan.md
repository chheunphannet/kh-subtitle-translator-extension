# Erase Server API — Plan

## Scope
This covers only the server component: the shared erase service that removes original text from manga images using EasyOCR + cleanup. Gemini calls, the extension UI, and client-side compositing are out of scope here.

---

## Responsibilities
- Accept a raw manga page image.
- Detect text regions (EasyOCR).
- Clean/erase the detected text (ink-level cleanup, not full-box fill).
- Return the cleaned image.
- Cache results by image content hash so repeated images (same scan, possibly from different sites) skip reprocessing.
- Never receive, store, or need the user's Gemini API key — this server only ever handles image bytes.

---

## API surface

### `POST /erase`
Request:
```json
{
  "image": "<base64 or multipart bytes>",
  "request_id": "optional-client-generated-id"
}
```

Response (success):
```json
{
  "status": "ok",
  "cached": false,
  "erased_image": "<base64 or URL to result>"
}
```

Response (queue full / overloaded):
```json
{
  "status": "busy"
}
```
HTTP `503`, returned immediately — no accepting-and-hoping. Client is expected to fall back to un-erased rendering on this response.

### `GET /health`
```json
{ "status": "ok", "queue_depth": 4, "workers_busy": 2 }
```
Lightweight, used by clients for a pre-flight check before sending a job (or just rely on fast `503`s from `/erase` directly — either approach is fine).

---

## Internal architecture

```
Request → Rate limiter → Bounded job queue → Fixed-size worker pool → EasyOCR + cleanup → Cache write → Response
```

### 1. Rate limiter (gate, before queueing)
- Per-client cap (e.g. token bucket) to stop one runaway source from flooding the server.
- Global cap so total accepted load never exceeds what the queue + workers can realistically process.

### 2. Bounded job queue
- Fixed max size (e.g. 20-30 pending jobs). This is the single most important safety measure — it turns "server crashes under load" into "server returns 503 under load."
- Reject immediately when full; never let the queue grow unbounded in memory.

### 3. Fixed-size worker pool
- Number of workers sized to actual GPU capacity, not to incoming demand — start conservative (e.g. 1-2 workers per available GPU with enough free VRAM for EasyOCR + cleanup), benchmark, then adjust.
- Workers pull jobs one at a time from the queue; no per-request dynamic scaling that could overcommit memory.

### 4. Cache layer — Redis (required, not optional)
- **Redis is the mandated cache backend** — not SQLite/disk. Reasons: sub-millisecond lookups keep the fast-path (cache hit) genuinely fast, native TTL/eviction policies (e.g. LRU) let you bound memory use without custom cleanup logic, and it's the natural fit if the erase server ever runs as multiple worker processes/replicas that all need to share the same cache state.
- Key: `sha256(original_image_bytes)` — content hash, not filename or URL, since different sites can share filenames but only share identical bytes if it's genuinely the same image.
- Value: the erased image bytes (or a pointer/URL to where they're stored, if images are kept in object storage and Redis only holds the reference) plus optional metadata (processing time, timestamp) for monitoring.
- Cache hit → skip EasyOCR + cleanup entirely, return stored result directly from Redis.
- Cache miss → run pipeline, then `SET` the result under that hash (with a TTL / max-memory eviction policy configured) before responding.
- If Redis is unreachable, degrade to "no cache" mode — still process the request normally rather than failing it (see failure modes table).

### 5. Erase logic (per job) — EasyOCR detects per line, not per bubble/paragraph group

**Important correction:** EasyOCR does **not** detect a whole speech bubble or paragraph as one grouped region. It detects and returns bounding boxes **line by line** — each line of text inside a bubble is its own separate detection box, even when multiple lines belong to the same sentence/bubble visually.

This matters directly for how erasing must work:
- ❌ **Wrong assumption:** "detect the group of text (whole bubble), then erase that one big region." EasyOCR never gives you that single grouped box — treating its output as if it did will under-erase (lines EasyOCR split apart get treated as one box incorrectly) or mis-align cleanup.
- ✅ **Correct approach:** erase **each detected line box individually**. Loop over every line-level box EasyOCR returns and apply the ink-threshold cleanup (or textured-background inpainting fallback) to that single line's region — not to a merged/grouped area spanning multiple lines.
- If you want bubble-level grouping for any other purpose (e.g. matching against Gemini's bubble-level boxes later during compositing), that grouping has to be done **yourself**, as a separate step after EasyOCR returns its line-level results (e.g. by clustering nearby/overlapping line boxes) — it is not something EasyOCR provides natively.

Per-line erase logic:
- For each line box: only replace dark/text-ink pixels within that line's box (threshold-based), not the entire bounding rectangle — avoids leaving oversized flat-color patches that spill outside actual glyph shapes.
- For lines where the surrounding area is highly textured (high pixel variance — likely art, not a flat bubble), fall back to a local inpainting pass for that line's region instead of ink-thresholding, since simple thresholding won't cleanly separate text from busy backgrounds.
- **Never flat-fill an entire line box with a hardcoded color (e.g. plain white).** This was tested and rejected: it produces visible mismatched patches on any non-white bubble fill (colored/gradient/shadowed bubbles) and punches a flat-color hole through textured art when text sits directly on artwork instead of inside a bubble.
- Correct per-line algorithm, validated against test images:
  1. Sample the local background by reading a small ring of pixels just outside the line's box (excluding the box interior).
  2. Compute the median color of that ring (robust to line-art/outlier pixels) and its brightness variance.
  3. If variance is low (flat/bubble background) → threshold the box region for dark pixels and replace only those with the sampled median color.
  4. If variance is high (textured art background) → run local inpainting (e.g. OpenCV Telea) confined to that line's box only, rather than a flat fill.
  5. Small safety padding (~2px) added around each detected box before processing, to fully cover anti-aliased glyph edges.
- Threshold values (dark-pixel cutoff, variance cutoff for "textured vs flat") are starting points from initial testing, not fixed constants — validate against a representative batch of real source images per target site, since scan quality/compression varies and can shift what counts as background vs. ink.

---

## Failure modes and how the server should behave

| Situation | Server behavior |
|---|---|
| Queue full | Return `503` immediately, do not accept the job |
| Worker crashes mid-job | Job is dropped; client times out and falls back client-side; server logs and continues serving other jobs |
| GPU OOM | Should not happen if worker pool is sized correctly; if it does, that job fails and returns an error, other workers unaffected |
| Cache store unavailable | Degrade to "no cache" mode (still process normally), don't fail the whole request over a cache miss-write failure |
| Malformed/corrupt image upload | Return `400` with a clear error, no processing attempted |

The server is designed to **fail predictably and cheaply** rather than degrade unpredictably — every overload scenario should resolve in a fast, explicit response the client can act on (fall back to un-erased rendering), not a hang or crash.

---

## Open items to finalize
- [ ] Actual worker count per GPU (needs benchmarking on target hardware)
- [ ] Redis deployment details: TTL policy, max-memory/eviction policy, whether image bytes live in Redis directly or in object storage with Redis holding just references
- [ ] Whether to add perceptual hashing alongside exact SHA256 to catch resized/re-compressed duplicates
- [ ] Line-box grouping strategy, if bubble-level grouping is ever needed downstream (EasyOCR only gives line-level boxes natively)
- [ ] Monitoring/alerting on queue depth and rejection rate, to know when to add capacity
- [ ] Image size/dimension limits accepted by the API (to bound per-job memory use)
