import { translateBatchWithContext, translateSingleText, translateMangaTexts, GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";
import { SubtitleCue } from "./parsers";

let activeAbortController: AbortController | null = null;

interface TranslationState {
  translating: boolean;
  percent: number;
  status: string;
  translatedTexts: string[] | null;
  error: string | null;
  cues: SubtitleCue[] | null;
  fileName: string | null;
  targetLang: string | null;
  exportMode: string | null;
  bilingualOrder: string | null;
  formatPref: string | null;
}

let activeTranslationState: TranslationState = {
  translating: false,
  percent: 0,
  status: "",
  translatedTexts: null,
  error: null,
  cues: null,
  fileName: null,
  targetLang: null,
  exportMode: null,
  bilingualOrder: null,
  formatPref: null
};

const DB_NAME = "SubtitlesCache";
const DB_VERSION = 1;
const STORE_NAME = "cues-cache";

// ------------------------------------
// IndexedDB Cache Wrapper
// ------------------------------------
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getCachedValue(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (e) {
    console.error("IndexedDB cache read error:", e);
    return null;
  }
}

async function setCachedValue(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.error("IndexedDB cache write error:", e);
  }
}

async function clearDBCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.error("IndexedDB clear error:", e);
  }
}

// Simple hash function for caching prompts
function getPromptHash(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return String(hash);
}

// ------------------------------------
// Service Worker Keep-Alive Heartbeat
// ------------------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "manga-keep-alive") {
    console.log("[Background] Keep-alive port connected.");
    port.onMessage.addListener((message) => {
      if (message.action === "ping") {
        console.log("[Background] Received local ping. Resetting idle timer...");
        // Trigger a dummy Chrome API call to keep service worker alive
        chrome.storage.local.get(["keep_alive_dummy"]).catch(() => {});
      }
    });
    port.onDisconnect.addListener(() => {
      console.log("[Background] Keep-alive port disconnected.");
    });
  }
});

// ------------------------------------
// Service Worker Message Handlers
// ------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchSubtitle") {
    // Fetch subtitle content from CDN bypassing CORS
    fetch(message.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.text();
      })
      .then((text) => sendResponse({ success: true, text }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }

  if (message.action === "fetchImageAsBase64") {
    fetch(message.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        return res.blob();
      })
      .then(async (blob) => {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        sendResponse({ success: true, base64 });
      })
      .catch((err) => {
        console.error("[Background] Failed to fetch image as base64:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open
  }

  if (message.action === "translateSubtitles") {
    const { cues, targetLanguage, sourceLanguage, config, isTestConnection, fileName, exportMode, bilingualOrder, formatPref } = message as {
      cues: SubtitleCue[];
      targetLanguage: string;
      sourceLanguage: string;
      config: GeminiConfig;
      isTestConnection?: boolean;
      fileName?: string;
      exportMode?: string;
      bilingualOrder?: string;
      formatPref?: string;
    };

    if (isTestConnection) {
      performTranslation(cues, targetLanguage, sourceLanguage, config, sender.tab?.id, isTestConnection)
        .then((translatedTexts) => sendResponse({ success: true, translatedTexts }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open
    }

    // 1. Abort existing active translation first
    if (activeAbortController) {
      activeAbortController.abort();
    }

    // 2. Create new AbortController
    const currentController = new AbortController();
    activeAbortController = currentController;

    // 3. Reset state
    activeTranslationState = {
      translating: true,
      percent: 0,
      status: "Starting...",
      translatedTexts: null,
      error: null,
      cues,
      fileName: fileName || null,
      targetLang: targetLanguage,
      exportMode: exportMode || null,
      bilingualOrder: bilingualOrder || null,
      formatPref: formatPref || null
    };

    performTranslation(cues, targetLanguage, sourceLanguage, config, sender.tab?.id, isTestConnection, currentController.signal)
      .then((translatedTexts) => {
        if (activeAbortController === currentController) {
          activeTranslationState = {
            ...activeTranslationState,
            translating: false,
            percent: 100,
            status: "Completed",
            translatedTexts,
            error: null
          };
          activeAbortController = null;
        }
        sendResponse({ success: true, translatedTexts });
      })
      .catch((err) => {
        if (activeAbortController === currentController) {
          const isAbort = err.name === "AbortError" || err.message?.includes("aborted");
          activeTranslationState = {
            ...activeTranslationState,
            translating: false,
            percent: 0,
            status: isAbort ? "Cancelled" : "Failed",
            translatedTexts: null,
            error: isAbort ? "Cancelled by user" : err.message
          };
          activeAbortController = null;
        }
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep channel open
  }

  if (message.action === "getTranslationStatus") {
    if (mangaTranslationState.translating) {
      sendResponse({ ...mangaTranslationState, isManga: true });
    } else {
      sendResponse(activeTranslationState);
    }
    return false;
  }

  if (message.action === "cancelTranslation") {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    activeTranslationState = {
      ...activeTranslationState,
      translating: false,
      percent: 0,
      status: "Cancelled",
      translatedTexts: null,
      error: "Cancelled by user"
    };
    chrome.runtime.sendMessage({ action: "translationProgress", percent: 0, status: "Cancelled", error: "Cancelled" }).catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "translateMangaPages") {
    // Abort any active manga translation before starting a new one
    if (mangaAbortController) {
      try {
        mangaAbortController.abort();
      } catch (e) {
        console.warn("Failed to abort previous manga translation:", e);
      }
    }
    
    // Apply mangaLimit slice starting from message.startIndex
    let urlsToTranslate = message.imageUrls;
    const startIndex = message.startIndex || 0;
    const limit = message.config?.mangaLimit || 0;
    if (limit > 0 && urlsToTranslate.length > (startIndex + limit)) {
      urlsToTranslate = urlsToTranslate.slice(startIndex, startIndex + limit);
    } else {
      urlsToTranslate = urlsToTranslate.slice(startIndex);
    }
    
    // Reset manga state
    mangaTranslationState = {
      translating: true,
      percent: 0,
      status: "Translating",
      totalImages: urlsToTranslate.length,
      completedCount: 0,
      error: "",
      startIndex: message.startIndex || 0
    };
    activeTranslationState = {
      translating: false,
      percent: 0,
      status: "",
      translatedTexts: null,
      cues: null,
      error: ""
    };
    mangaAbortController = new AbortController();
    
    const mangaServerUrl = message.mangaServerUrl || "https://example.com";
    const tabId = sender.tab?.id || message.tabId;
    performMangaTranslation(urlsToTranslate, message.config, mangaServerUrl, message.targetLanguage, tabId, mangaAbortController.signal, message.startIndex || 0)
      .then(() => {
        mangaTranslationState = { ...mangaTranslationState, translating: false, percent: 100, status: "Completed" };
        chrome.runtime.sendMessage({ 
          action: "mangaTranslationProgress", 
          percent: 100, 
          status: "Completed",
          startIndex: mangaTranslationState.startIndex,
          completed: mangaTranslationState.completedCount,
          total: mangaTranslationState.totalImages
        }).catch(() => {});
      })
      .catch((err) => {
        if (mangaAbortController) {
          try {
            mangaAbortController.abort();
          } catch (e) {}
          mangaAbortController = null;
        }
        if (err.name === 'AbortError') {
          mangaTranslationState = { ...mangaTranslationState, translating: false, status: "Cancelled" };
          chrome.runtime.sendMessage({ action: "mangaTranslationProgress", status: "Cancelled", percent: mangaTranslationState.percent }).catch(() => {});
        } else {
          console.error("Manga translation failed:", err);
          mangaTranslationState = { ...mangaTranslationState, translating: false, status: "Failed", error: err.message };
          chrome.runtime.sendMessage({ action: "mangaTranslationProgress", status: "Failed", error: err.message, percent: mangaTranslationState.percent }).catch(() => {});
        }
      });
      
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "getMangaTranslationStatus") {
    sendResponse(mangaTranslationState);
    return false;
  }

  if (message.action === "cancelMangaTranslation") {
    if (mangaAbortController) {
      mangaAbortController.abort();
      mangaAbortController = null;
    }
    mangaTranslationState = { ...mangaTranslationState, translating: false, percent: 0, status: "Cancelled" };
    chrome.runtime.sendMessage({ action: "mangaTranslationProgress", percent: 0, status: "Cancelled", error: "Cancelled" }).catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "clearCache") {
    clearDBCache()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Coordinate subtitle translation, checking cache line by line
async function performTranslation(
  cues: SubtitleCue[],
  targetLanguage: string,
  sourceLanguage: string,
  config: GeminiConfig,
  tabId?: number,
  isTestConnection?: boolean,
  signal?: AbortSignal
): Promise<string[]> {
  const result: string[] = new Array(cues.length).fill("");
  const promptHash = getPromptHash(config.systemPrompt + config.userPrompt);
  
  // 1. Check local cache first
  const missingIndexes: number[] = [];
  const cuesToTranslate: SubtitleCue[] = [];

  for (let i = 0; i < cues.length; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const cue = cues[i];
    if (config.useCache) {
      // Key format: [model]_[source]_[target]_[promptHash]_[originalText]
      const cacheKey = `${config.model}_${sourceLanguage}_${targetLanguage}_${promptHash}_${cue.text}`;
      const cached = await getCachedValue(cacheKey);
      if (cached) {
        result[i] = cached;
        continue;
      }
    }
    missingIndexes.push(i);
    cuesToTranslate.push(cue);
  }

  // Report initial progress
  const initialPercent = Math.floor(((cues.length - cuesToTranslate.length) / cues.length) * 100);
  if (!isTestConnection) {
    activeTranslationState.percent = initialPercent;
    activeTranslationState.status = `Checked cache. Starting remaining...`;
    chrome.runtime.sendMessage({
      action: "translationProgress",
      percent: initialPercent,
      status: `Starting...`
    }).catch(() => {});
  }

  // 2. Call Gemini API for missing cues
  if (cuesToTranslate.length > 0) {
    const onProgress = (percent: number) => {
      const totalCompleted = (cues.length - cuesToTranslate.length) + Math.floor((cuesToTranslate.length * percent) / 100);
      const finalPercent = Math.floor((totalCompleted / cues.length) * 100);
      
      if (!isTestConnection) {
        activeTranslationState.percent = finalPercent;
        activeTranslationState.status = `Translating: ${finalPercent}%`;
        chrome.runtime.sendMessage({
          action: "translationProgress",
          percent: finalPercent,
          status: `Translating: ${finalPercent}%`
        }).catch(() => {});
      }
    };

    const onBatchComplete = async (batchStart: number, batchCues: SubtitleCue[], translatedTexts: string[]) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (!config.useCache) return;
      for (let j = 0; j < batchCues.length; j++) {
        const cue = batchCues[j];
        const translatedText = translatedTexts[j];
        if (translatedText && translatedText !== cue.text) {
          const cacheKey = `${config.model}_${sourceLanguage}_${targetLanguage}_${promptHash}_${cue.text}`;
          await setCachedValue(cacheKey, translatedText);
        }
      }
    };

    const translatedBatch = await translateBatchWithContext(
      cuesToTranslate,
      targetLanguage,
      sourceLanguage,
      config,
      onProgress,
      onBatchComplete,
      signal,
      isTestConnection
    );

    // 3. Map newly translated cues back to result
    for (let j = 0; j < cuesToTranslate.length; j++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const origIndex = missingIndexes[j];
      const cue = cuesToTranslate[j];
      const translatedText = translatedBatch[j] || cue.text;
      result[origIndex] = translatedText;
    }
  }

  // Send final progress update
  if (!isTestConnection) {
    activeTranslationState.percent = 100;
    activeTranslationState.status = "Completed";
    chrome.runtime.sendMessage({ action: "translationProgress", percent: 100, status: "Completed" }).catch(() => {});
  }

  return result;
}

// ==========================================
// Manga Translation Logic
// ==========================================
// Add state tracking for manga
let mangaTranslationState = {
  translating: false,
  percent: 0,
  completedCount: 0,
  totalCount: 0,
  startIndex: 0,
  status: "Idle"
};
let mangaAbortController: AbortController | null = null;

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        attempt++;
        if (attempt >= maxRetries) return response;
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      attempt++;
      if (attempt >= maxRetries) throw error;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Max retries reached');
}

async function performMangaTranslation(
  imageUrls: string[],
  config: GeminiConfig,
  serverUrl: string,
  targetLanguage: string,
  tabId: number,
  signal: AbortSignal,
  startIndex: number = 0
) {
  const concurrency = config.mangaConcurrency || 3;
  let activeWorkers = 0;
  let currentIndex = 0;

  return new Promise<void>(async (resolve, reject) => {
    // Check server health first if in normal mode
    if (config.mangaTranslationMode === 'normal') {
      try {
        const healthRes = await fetch(`${serverUrl}/health`, { signal });
        if (!healthRes.ok) {
          throw new Error(`Server returned status ${healthRes.status}`);
        }
      } catch (e: any) {
        reject(new Error(`Server offline or unreachable at ${serverUrl}. Please check your Manga Server URL in settings or verify that your server is running.`));
        return;
      }
    }

    const processNext = async () => {
      if (signal.aborted) {
        if (activeWorkers === 0) reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      
      if (currentIndex >= imageUrls.length) {
        if (activeWorkers === 0) resolve();
        return;
      }

      const taskIndex = currentIndex++;
      activeWorkers++;
      const url = imageUrls[taskIndex];

      try {
        let base64Img = "";
        let buffer: ArrayBuffer;

        try {
          // Ask the tab content script to extract the decrypted image bytes (bypassing scrambled image copy-protection)
          const contentRes = await chrome.tabs.sendMessage(tabId, { action: "grabImageBytes", url });
          if (contentRes && contentRes.success && contentRes.base64) {
            base64Img = contentRes.base64;
            // Convert base64 back to ArrayBuffer
            const binaryString = atob(base64Img);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            buffer = bytes.buffer;
          } else {
            throw new Error(contentRes?.error || "Empty base64 returned from tab");
          }
        } catch (grabErr) {
          console.warn(`[Manga] Failed to grab decrypted image from tab, falling back to direct background fetch:`, grabErr);
          const response = await fetch(url, { signal });
          buffer = await response.arrayBuffer();
          base64Img = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
        }

        const imgHash = await hashArrayBuffer(buffer);
        const mangaModel = config.mangaTranslateModel || config.model || "gemini-3.5-flash";
        const cacheKey = `manga_${mangaModel}_${imgHash}`;

        let finalResult: any = null;

        // 1. Check local IndexedDB cache
        if (config.useCache) {
          const cached = await getCachedValue(cacheKey);
          if (cached) {
            finalResult = JSON.parse(cached);
          }
        }

        // 2. Check Server Cache (normal mode only since fast mode doesn't hit server)
        if (!finalResult && config.mangaTranslationMode === 'normal') {
          try {
            const formData = new FormData();
            formData.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');
            formData.append('text_blocks', '[]'); // Empty forces cache-only check
            formData.append('model', mangaModel);
            
            const serverRes = await fetch(`${serverUrl}/erase`, {
              method: 'POST',
              body: formData,
              signal
            });
            const serverData = await serverRes.json();
            if (serverData.status === 'ok' && serverData.cached) {
              finalResult = serverData;
            }
          } catch (e) {
            console.warn("Server cache check failed:", e);
          }
        }

        // 3. Call Gemini
        if (!finalResult) {
          // Step 1: Spatial Detection & Transcription (Vision Call)
          const detectPrompt = `You are an expert manga analyzer. Analyze this manga page.
1. Determine if this page has no translatable text. Set 'is_skip' to true if so.
2. Detect all text blocks (the text itself, NOT the speech bubble).
CRITICAL RULES:
- ONLY detect readable dialogue inside speech bubbles, thought bubbles, rectangular narration boxes, or clean non-graphic dialogue fonts.
- DO NOT detect or transcribe hand-drawn, graphic, or highly stylized sound effects (SFX) / onomatopoeia (e.g., 'SLAM!!', 'TADADAAH!!!', 'WHOOSH', 'THUD', 'BOOM'). You MUST skip these completely!
- DO NOT detect chapter titles, page numbers, credits, or margin text.
- DO NOT hallucinate text! DO NOT draw boxes around empty space, character faces, shadows, or speech bubble borders.
- The 2D bounding box [ymin, xmin, ymax, xmax] (0-1000) MUST tightly wrap the text and nothing else.
- Transcribe the original English/Japanese text.
- Judge font size (large/medium/small).
- Judge if bold or italic.
- CRITICAL: You MUST detect and sort the array of 'text_blocks' following the natural human manga reading order (right-to-left, top-to-bottom) so the dialogue sequence flows chronologically.`;

          const detectSchema = {
            type: "OBJECT",
            properties: {
              is_skip: { type: "BOOLEAN" },
              text_blocks: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
                    original_text: { type: "STRING" },
                    fontSize: { type: "STRING" },
                    isBold: { type: "BOOLEAN" },
                    isItalic: { type: "BOOLEAN" }
                  },
                  required: ["box_2d", "original_text", "fontSize", "isBold", "isItalic"]
                }
              }
            },
            required: ["is_skip", "text_blocks"]
          };

          const detectPayload = {
            contents: [{
              parts: [
                { text: detectPrompt },
                { inlineData: { mimeType: "image/jpeg", data: base64Img } }
              ]
            }],
            generationConfig: {
              temperature: config.temperature,
              responseMimeType: "application/json",
              responseSchema: detectSchema
            }
          };

          const detectRes = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(detectPayload),
            signal
          });

          const detectData = await detectRes.json();
          if (detectData.error) throw new Error(detectData.error.message || "Gemini detection API error");

          const detectText = detectData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!detectText) throw new Error("Empty response from Gemini detection");

          let parsed = JSON.parse(detectText);

          // Step 2: Dialogue Translation (Text Call)
          if (!parsed.is_skip && parsed.text_blocks.length > 0) {
            const originalTexts = parsed.text_blocks.map((b: any) => b.original_text);
            const translatedTexts = await translateMangaTexts(originalTexts, targetLanguage, config, signal);
            
            for (let idx = 0; idx < parsed.text_blocks.length; idx++) {
              parsed.text_blocks[idx].translated_text_khmer = translatedTexts[idx] || parsed.text_blocks[idx].original_text;
            }
          }

          // 4. Handle Server /erase for normal mode
          if (config.mangaTranslationMode === 'normal' && !parsed.is_skip && parsed.text_blocks.length > 0) {
            const formData = new FormData();
            formData.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');
            // Server expects 'text' field, not translated_text_khmer
            const mappedBlocks = parsed.text_blocks.map((b: any) => ({
              ...b,
              text: b.translated_text_khmer
            }));
            formData.append('text_blocks', JSON.stringify(mappedBlocks));
            formData.append('model', mangaModel);

            let serverRes;
            try {
              serverRes = await fetch(`${serverUrl}/erase`, {
                method: 'POST',
                body: formData,
                signal
              });
            } catch (fetchErr) {
              throw new Error(`Server connection error: Cannot reach the translation server at ${serverUrl}. Please check your Manga Server URL in settings or verify that your server is running.`);
            }

            if (serverRes.status === 503) {
              throw new Error("Server is currently busy (too many concurrent requests). Please try again in a few moments.");
            }

            if (!serverRes.ok) {
              throw new Error(`Server error: Translation server returned status ${serverRes.status}.`);
            }

            const serverData = await serverRes.json();
            if (serverData.status === 'ok') {
              finalResult = serverData;
            } else {
              throw new Error(serverData.error || "Server erase failed");
            }
          } else {
            // Fast mode or skipped
            const mappedBlocks = (parsed.text_blocks || []).map((b: any) => {
              const box = b.box_2d || [0, 0, 0, 0];
              return {
                coords: [box[1], box[0], box[3], box[2]], // Map box_2d to coords
                text: b.translated_text_khmer,
                font_size: b.font_size || b.fontSize
              };
            });
            finalResult = { ...parsed, text_blocks: mappedBlocks };
          }

          // 5. Save to cache
          if (config.useCache) {
            await setCachedValue(cacheKey, JSON.stringify(finalResult));
          }
        }

        // 6. Broadcast progress (increment completed count regardless of success or failure)
        mangaTranslationState.completedCount++;
        mangaTranslationState.percent = Math.round((mangaTranslationState.completedCount / imageUrls.length) * 100);
        
        chrome.runtime.sendMessage({ 
          action: "mangaTranslationProgress", 
          percent: mangaTranslationState.percent, 
          status: "Translating",
          startIndex: mangaTranslationState.startIndex,
          completed: mangaTranslationState.completedCount,
          total: mangaTranslationState.totalImages
        }).catch(() => {});

        chrome.tabs.sendMessage(tabId, {
          action: "mangaPageTranslated",
          imageIndex: startIndex + taskIndex,
          totalImages: imageUrls.length,
          completedCount: mangaTranslationState.completedCount,
          result: finalResult
        }).catch(() => {});

        // Delay before picking up next task
        if (config.delayTime > 0) {
          await new Promise(r => setTimeout(r, config.delayTime));
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;

        console.error(`Error processing image ${taskIndex}:`, err);
        // Abort all other workers and reject immediately on any failure
        reject(err);
        return;
      } finally {
        activeWorkers--;
        processNext();
      }
    };

    // Start initial workers
    for (let i = 0; i < concurrency; i++) {
      processNext();
    }
  });
}
