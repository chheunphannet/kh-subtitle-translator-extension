\*\*FastAPI + bounded queue + worker pool + Redis cache

sha256(image) is the shared key across both caches
│
┌──────────┴──────────┐
Client cache Server cache
(always checked) (only checked if
erase mode is ON)
│ │
boxes, translated_text, erased_image
fontSize, isBold,
isItalic, isSkip

1. hash = sha256(image)
2. Check client cache[hash] for gemini_result
   - HIT → skip Gemini call entirely, reuse boxes/text/style/isSkip
   - MISS → call Gemini, store result in client cache[hash]
3. If gemini_result.isSkip → done, show original image
4. If erase mode is OFF (user choice) → render translated text directly over original image (fallback-style rendering), done — server never contacted
5. If erase mode is ON:
   a. Check server cache[hash] for erased_image
   - HIT → server returns cached erased_image immediately
   - MISS → server runs EasyOCR + cleanup, caches, returns
     b. Composite translated text (from step 2's client cache) onto erased_image
