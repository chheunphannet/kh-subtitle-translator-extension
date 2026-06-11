import { translateBatchWithContext, translateSingleText, GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";
import { SubtitleCue } from "./parsers";

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

  if (message.action === "translateSubtitles") {
    const { cues, targetLanguage, sourceLanguage, config, isTestConnection } = message as {
      cues: SubtitleCue[];
      targetLanguage: string;
      sourceLanguage: string;
      config: GeminiConfig;
      isTestConnection?: boolean;
    };

    performTranslation(cues, targetLanguage, sourceLanguage, config, sender.tab?.id, isTestConnection)
      .then((translatedTexts) => sendResponse({ success: true, translatedTexts }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
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
  isTestConnection?: boolean
): Promise<string[]> {
  const result: string[] = new Array(cues.length).fill("");
  const promptHash = getPromptHash(config.systemPrompt + config.userPrompt);
  
  // 1. Check local cache first
  const missingIndexes: number[] = [];
  const cuesToTranslate: SubtitleCue[] = [];

  for (let i = 0; i < cues.length; i++) {
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
  chrome.runtime.sendMessage({
    action: "translationProgress",
    percent: Math.floor(((cues.length - cuesToTranslate.length) / cues.length) * 100)
  }).catch(() => {}); // Ignore if extension popup is closed

  // 2. Call Gemini API for missing cues
  if (cuesToTranslate.length > 0) {
    const onProgress = (percent: number) => {
      const totalCompleted = (cues.length - cuesToTranslate.length) + Math.floor((cuesToTranslate.length * percent) / 100);
      chrome.runtime.sendMessage({
        action: "translationProgress",
        percent: Math.floor((totalCompleted / cues.length) * 100)
      }).catch(() => {});
    };

    const translatedBatch = await translateBatchWithContext(
      cuesToTranslate,
      targetLanguage,
      sourceLanguage,
      config,
      onProgress,
      undefined,
      isTestConnection
    );

    // 3. Write newly translated cues back to cache & result
    for (let j = 0; j < cuesToTranslate.length; j++) {
      const origIndex = missingIndexes[j];
      const cue = cuesToTranslate[j];
      const translatedText = translatedBatch[j] || cue.text;
      
      result[origIndex] = translatedText;

      if (config.useCache && translatedText && translatedText !== cue.text) {
        const cacheKey = `${config.model}_${sourceLanguage}_${targetLanguage}_${promptHash}_${cue.text}`;
        await setCachedValue(cacheKey, translatedText);
      }
    }
  }

  // Send final progress update
  chrome.runtime.sendMessage({ action: "translationProgress", percent: 100 }).catch(() => {});

  return result;
}
