import { parseSrt, parseVtt, parseAss, parseLrc, buildVtt, SubtitleCue } from "./parsers";
import { GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";

// ------------------------------------
// Web App Settings Syncing
// ------------------------------------
function syncSettingsFromPage() {
  try {
    const configs = localStorage.getItem("translation-configs");
    if (configs) {
      const systemPrompt = localStorage.getItem("translation-systemPrompt") || "";
      const userPrompt = localStorage.getItem("translation-userPrompt") || "";
      const method = localStorage.getItem("translation-method") || "gemini";
      
      const settings = {
        configs: JSON.parse(configs),
        systemPrompt,
        userPrompt,
        method
      };
      
      chrome.runtime.sendMessage({
        action: "syncSettings",
        settings
      });
      console.log("[JW Subtitle Tester] Auto-synced settings from web application.");
    }
  } catch (e) {
    console.error("[JW Subtitle Tester] Failed to sync settings:", e);
  }
}

// Auto-run sync if on the translation web app
const isLocalhost = window.location.hostname === "localhost";
const isHostedTranslator = window.location.hostname.includes("kh-subtitle-translator") || window.location.pathname.includes("subtitle-translator");
if (isLocalhost || isHostedTranslator) {
  // Run immediately and listen for changes
  syncSettingsFromPage();
  window.addEventListener("storage", (e) => {
    if (e.key && (e.key.startsWith("translation-") || e.key === "translation-configs")) {
      syncSettingsFromPage();
    }
  });
}

// ------------------------------------
// Iframe Auto-Scraping & Injection
// ------------------------------------
const isKhanimeIframe = window.location.hostname.includes("stream.khanime.co") && window.location.pathname.startsWith("/e/");

if (isKhanimeIframe) {
  console.log("[JW Subtitle Tester] Khanime player iframe detected. Initializing auto-translator...");
  
  // Listen for the popup requests (or check if we should auto-trigger)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getDetectedSubtitles") {
      const info = scanForSubtitles();
      sendResponse(info);
      return true;
    }

    if (request.action === "autoTranslateAndInject") {
      runAutoTranslateFlow(request.targetLanguage, request.sourceLanguage)
        .then((res) => sendResponse({ success: true, text: res.text, fileName: res.fileName }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (request.action === "injectSubtitles") {
      // Manual inject VTT text directly into the frame
      injectVttToPlayer(request.content, request.fileName)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
}

interface DetectedSubInfo {
  hasPlayer: boolean;
  englishSubUrl: string | null;
  videoTitle: string;
}

function scanForSubtitles(): DetectedSubInfo {
  const hasPlayer = !!(document.querySelector('.jwplayer') || document.querySelector('#player') || document.querySelector('video'));
  let englishSubUrl: string | null = null;
  let videoTitle = document.title || "Video";

  try {
    const html = document.documentElement.innerHTML;
    // Regex to match tracks array in javascript string
    const tracksRegex = /"tracks"\s*:\s*(\[[\s\S]*?\])/g;
    let match;
    
    while ((match = tracksRegex.exec(html)) !== null) {
      try {
        const tracks = JSON.parse(match[1]);
        const englishTrack = tracks.find((t: any) => 
          t.kind === "captions" && 
          (t.label?.toLowerCase() === "english" || t.file?.toLowerCase().includes("english"))
        );
        if (englishTrack && englishTrack.file) {
          englishSubUrl = englishTrack.file;
          break;
        }
      } catch (e) {
        // Parse error fallback: use string regex matching
        const subMatch = match[1].match(/"file"\s*:\s*"([^"]+__english_[^"]+)"/);
        if (subMatch && subMatch[1]) {
          englishSubUrl = subMatch[1].replace(/\\/g, ''); // Remove backslashes
          break;
        }
      }
    }
  } catch (err) {
    console.error("[JW Subtitle Tester] Error scanning for subtitles:", err);
  }

  return { hasPlayer, englishSubUrl, videoTitle };
}

async function runAutoTranslateFlow(
  targetLanguage: string,
  sourceLanguage: string
): Promise<{ success: boolean; text: string; fileName: string }> {
  const scan = scanForSubtitles();
  if (!scan.englishSubUrl) {
    throw new Error("No English subtitle track was detected in this video player.");
  }

  // 1. Download English subtitle using background to bypass CORS
  const fetchRes = await chrome.runtime.sendMessage({
    action: "fetchSubtitle",
    url: scan.englishSubUrl
  });

  if (!fetchRes.success) {
    throw new Error(`Failed to download English subtitles: ${fetchRes.error}`);
  }

  // 2. Parse subtitle into cues
  const ext = scan.englishSubUrl.split('.').pop()?.split('?')[0].toLowerCase() || 'srt';
  const rawText = fetchRes.text;
  let cues: SubtitleCue[] = [];

  if (ext === 'vtt' || rawText.trim().startsWith('WEBVTT')) {
    cues = parseVtt(rawText);
  } else if (ext === 'ass') {
    cues = parseAss(rawText).cues;
  } else if (ext === 'lrc') {
    cues = parseLrc(rawText);
  } else {
    cues = parseSrt(rawText); // Fallback to SRT
  }

  if (cues.length === 0) {
    throw new Error("Failed to parse cues from downloaded subtitle file.");
  }

  // 3. Get configurations from extension local storage
  const storage = await chrome.storage.local.get(["syncedConfig", "userConfig"]);
  
  // Merge configurations
  const config = getGeminiConfig(storage.syncedConfig, storage.userConfig);

  // 4. Translate cues in background (so IndexedDB and API requests work seamlessly)
  const transRes = await chrome.runtime.sendMessage({
    action: "translateSubtitles",
    cues,
    targetLanguage,
    sourceLanguage,
    config
  });

  if (!transRes.success) {
    throw new Error(`Translation error: ${transRes.error}`);
  }

  // 5. Build translated VTT
  const translatedCues = cues.map((cue, idx) => ({
    ...cue,
    text: transRes.translatedTexts[idx] || cue.text
  }));

  const translatedVttText = buildVtt(translatedCues);
  const cleanFileName = `${scan.videoTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${targetLanguage}.vtt`;

  // 6. Inject VTT into JW Player
  await injectVttToPlayer(translatedVttText, cleanFileName);

  return { success: true, text: translatedVttText, fileName: cleanFileName };
}

function getGeminiConfig(synced: any, user: any): GeminiConfig {
  const activeConfig = { ...DEFAULT_GEMINI_CONFIG };

  // Prioritize synced configuration from web app, fallback to user config inside popup settings
  const webConfigs = synced?.configs || user?.configs;
  const geminiWeb = webConfigs?.gemini || {};

  activeConfig.apiKey = geminiWeb.apiKey || activeConfig.apiKey;
  activeConfig.model = geminiWeb.model || activeConfig.model;
  activeConfig.temperature = geminiWeb.temperature !== undefined ? geminiWeb.temperature : activeConfig.temperature;
  activeConfig.systemPrompt = synced?.systemPrompt || user?.systemPrompt || activeConfig.systemPrompt;
  activeConfig.userPrompt = synced?.userPrompt || user?.userPrompt || activeConfig.userPrompt;
  
  // Other settings
  activeConfig.contextWindow = geminiWeb.contextWindow || activeConfig.contextWindow;
  activeConfig.contextBatchSize = geminiWeb.contextBatchSize || activeConfig.contextBatchSize;
  activeConfig.delayTime = geminiWeb.delayTime !== undefined ? geminiWeb.delayTime : activeConfig.delayTime;
  activeConfig.useCache = user?.useCache !== undefined ? user.useCache : activeConfig.useCache;

  return activeConfig;
}

// Create blob URL and inject via inject.js script injection
async function injectVttToPlayer(vttText: string, fileName: string): Promise<void> {
  const blob = new Blob([vttText], { type: "text/vtt" });
  const blobUrl = URL.createObjectURL(blob);
  const eventId = "jw-subtitle-injection-" + Math.random().toString(36).substring(2, 9);

  return new Promise((resolve, reject) => {
    const onResult = (e: any) => {
      document.removeEventListener(eventId, onResult);
      if (e.detail.success) {
        resolve();
      } else {
        reject(new Error(e.detail.error));
      }
    };

    document.addEventListener(eventId, onResult);

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.setAttribute("data-blob-url", blobUrl);
    script.setAttribute("data-file-name", fileName);
    script.setAttribute("data-event-id", eventId);
    
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  });
}
