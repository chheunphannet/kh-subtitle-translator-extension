import { parseSrt, parseVtt, parseAss, parseLrc, buildVtt, SubtitleCue, formatSubtitleText, generateSubtitleExport, formatMsToVttTime, parseTimeToMs, languagesList } from "./parsers";
import { GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";

// ------------------------------------
// Iframe Auto-Scraping & Injection
// ------------------------------------
interface SupportedSite {
  name: string;
  isMatch: (hostname: string, pathname: string) => boolean;
}

const SUPPORTED_SITES: SupportedSite[] = [
  {
    name: "Khanime",
    isMatch: (host, path) => host.includes("stream.khanime.co") && path.startsWith("/e/")
  },
  {
    name: "KHFullHD",
    isMatch: (host, path) => host.includes("stream.khfullhd.co") && path.startsWith("/e/")
  },
  {
    name: "Anistream",
    isMatch: (host, _) => host.includes("anistream.one")
  }
];

const matchedSite = SUPPORTED_SITES.find(site => site.isMatch(window.location.hostname, window.location.pathname));

if (matchedSite) {
  console.log(`[JW Subtitle Tester] ${matchedSite.name} player iframe detected. Initializing auto-translator...`);
  
  const announcePlayer = () => {
    const info = scanForSubtitles();
    if (info.hasPlayer) {
      chrome.runtime.sendMessage({ action: "playerDetected", info }).catch(() => {});
      return true;
    }
    return false;
  };

  // Announce immediately, or poll for up to 10 seconds if the player is loading slowly
  if (!announcePlayer()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (announcePlayer() || attempts >= 20) {
        clearInterval(interval);
      }
    }, 500);
  }
  
  // Listen for the popup requests (or check if we should auto-trigger)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const info = scanForSubtitles();
    if (!info.hasPlayer) {
      return false; // Let other frames that contain the player respond
    }

    if (request.action === "getDetectedSubtitles") {
      sendResponse(info);
      return true;
    }

    if (request.action === "autoTranslateAndInject") {
      runAutoTranslateFlow(request.targetLanguage, request.sourceLanguage, request.displayFormat || 'translated', request.exportFormat || 'vtt')
        .then((res) => sendResponse({ success: true, text: res.text, fileName: res.fileName, ext: res.ext }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (request.action === "injectSubtitles") {
      // Manual inject VTT text directly into the frame
      injectVttToPlayer(request.content, request.fileName, undefined, request.targetLanguage)
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
  const video = document.querySelector('video');
  const hasPlayer = !!(document.querySelector('.jwplayer') || document.querySelector('#player') || video);
  let englishSubUrl: string | null = null;
  let videoTitle = document.title || "Video";

  if (matchedSite?.name === "Anistream") {
    if (video) {
      const tracks = video.textTracks;
      let foundTrack = false;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === 'captions' || t.kind === 'subtitles') {
          foundTrack = true;
          break;
        }
      }
      if (foundTrack) {
        englishSubUrl = "native-text-track";
      }
    }
    return { hasPlayer, englishSubUrl, videoTitle };
  }

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

async function getSubtitleCuesFromVideoElement(): Promise<SubtitleCue[]> {
  const video = document.querySelector('video');
  if (!video) {
    throw new Error("No video element found");
  }

  const tracks = video.textTracks;
  let englishTrack: TextTrack | null = null;

  // Find English track
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.kind === 'captions' || t.kind === 'subtitles') {
      if (
        t.label?.toLowerCase().includes('english') ||
        t.language?.toLowerCase().includes('en')
      ) {
        englishTrack = t;
        break;
      }
    }
  }

  // Fallback: first caption track
  if (!englishTrack) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') {
        englishTrack = tracks[i];
        break;
      }
    }
  }

  if (!englishTrack) {
    throw new Error("No caption or subtitle track found on the video element.");
  }

  const oldMode = englishTrack.mode;
  englishTrack.mode = 'showing';

  let retries = 5;
  while ((!englishTrack.cues || englishTrack.cues.length === 0) && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
    retries--;
  }

  const cues = englishTrack.cues;
  if (!cues || cues.length === 0) {
    englishTrack.mode = oldMode;
    throw new Error("No cues loaded from the video text track.");
  }

  const cueArray: SubtitleCue[] = Array.from(cues).map((cue: any, idx) => ({
    id: String(idx + 1),
    startTime: formatMsToVttTime(cue.startTime * 1000),
    endTime: formatMsToVttTime(cue.endTime * 1000),
    text: cue.text,
    originalText: cue.text,
    _rawStartTime: cue.startTime,
    _rawEndTime: cue.endTime
  } as any));

  englishTrack.mode = oldMode;
  return cueArray;
}

async function runAutoTranslateFlow(
  targetLanguage: string,
  sourceLanguage: string,
  displayFormat: string,
  exportFormat: string
): Promise<{ success: boolean; text: string; fileName: string; ext: string }> {
  const scan = scanForSubtitles();
  if (!scan.englishSubUrl) {
    throw new Error("No English subtitle track was detected in this video player.");
  }

  let cues: SubtitleCue[] = [];
  let ext = 'vtt';

  if (scan.englishSubUrl === "native-text-track") {
    // 1 & 2. Extract subtitle cues directly from video element
    cues = await getSubtitleCuesFromVideoElement();
  } else {
    // 1. Download English subtitle using background to bypass CORS
    const fetchRes = await chrome.runtime.sendMessage({
      action: "fetchSubtitle",
      url: scan.englishSubUrl
    });

    if (!fetchRes.success) {
      throw new Error(`Failed to download English subtitles: ${fetchRes.error}`);
    }

    // 2. Parse subtitle into cues
    ext = scan.englishSubUrl.split('.').pop()?.split('?')[0].toLowerCase() || 'srt';
    const rawText = fetchRes.text;

    if (ext === 'vtt' || rawText.trim().startsWith('WEBVTT')) {
      cues = parseVtt(rawText);
    } else if (ext === 'ass') {
      cues = parseAss(rawText).cues;
    } else if (ext === 'lrc') {
      cues = parseLrc(rawText);
    } else {
      cues = parseSrt(rawText); // Fallback to SRT
    }
  }

  if (cues.length === 0) {
    throw new Error("Failed to parse cues from downloaded subtitle file.");
  }

  // 3. Get configurations from extension local storage
  const storage = await chrome.storage.local.get(["userConfig"]);
  const config = getGeminiConfig(storage.userConfig);

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
    text: formatSubtitleText(cue.originalText || cue.text, transRes.translatedTexts[idx], displayFormat)
  }));

  const translatedVttText = buildVtt(translatedCues);
  const baseName = scan.videoTitle.replace(/[^a-zA-Z0-9]/g, "_");
  const vttFileName = `${baseName}_${targetLanguage}.vtt`;

  // 6. Inject VTT into JW Player
  await injectVttToPlayer(translatedVttText, vttFileName, translatedCues, targetLanguage);

  // 7. Generate export file using user's preferred format
  // For Auto Translate, we only have VTT/SRT source, so AssFile is not preserved. generateBasicAss will be used.
  const exportData = generateSubtitleExport(translatedCues, exportFormat);
  const cleanFileName = `${baseName}_${targetLanguage}.${exportData.ext}`;

  return { success: true, text: exportData.text, fileName: cleanFileName, ext: exportData.ext };
}

function getGeminiConfig(user: any): GeminiConfig {
  const activeConfig = { ...DEFAULT_GEMINI_CONFIG };

  activeConfig.apiKey = user?.apiKey || activeConfig.apiKey;
  activeConfig.model = user?.model || activeConfig.model;
  activeConfig.temperature = user?.temperature ?? activeConfig.temperature;
  activeConfig.systemPrompt = user?.systemPrompt || activeConfig.systemPrompt;
  activeConfig.userPrompt = user?.userPrompt || activeConfig.userPrompt;
  activeConfig.contextWindow = user?.contextWindow ?? activeConfig.contextWindow;
  activeConfig.contextBatchSize = user?.contextBatchSize ?? activeConfig.contextBatchSize;
  activeConfig.delayTime = user?.delayTime ?? activeConfig.delayTime;
  activeConfig.useCache = user?.useCache ?? activeConfig.useCache;
  activeConfig.isMature = user?.isMature ?? activeConfig.isMature;

  return activeConfig;
}

// Create blob URL and inject via inject.js script injection
async function injectVttToPlayer(vttText: string, fileName: string, cues?: any[], targetLanguage?: string): Promise<void> {
  if (matchedSite?.name === "Anistream") {
    setupNativeSubtitle(cues || parseVtt(vttText), targetLanguage || 'km');
    return;
  }

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

function setupNativeSubtitle(cues: any[], targetLanguage: string) {
  const video     = document.querySelector('video');
  const videoSkin = document.querySelector('video-skin');
  const shadow    = videoSkin?.shadowRoot;

  if (!shadow || !video) {
    console.error('❌ No shadow root or video found');
    return;
  }

  let currentActiveLabel = 'English';
  let isUpdating = false;

  function injectStyle() {
    const styleId = 'khmer-cue-style';
    if (document.getElementById(styleId)) return;
    
    const fontUrlKhmer = chrome.runtime.getURL("fonts/kantumruypro-khmer.woff2");
    const fontUrlLatin = chrome.runtime.getURL("fonts/kantumruypro-latin.woff2");

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @font-face {
        font-family: 'Kantumruy Pro';
        src: url('${fontUrlKhmer}') format('woff2');
        unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D;
        font-weight: 100 900;
        font-style: normal;
      }
      @font-face {
        font-family: 'Kantumruy Pro';
        src: url('${fontUrlLatin}') format('woff2');
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        font-weight: 100 900;
        font-style: normal;
      }
      
      video::cue {
        font-family: 'Kantumruy Pro', sans-serif !important;
      }
    `;
    document.head.appendChild(style);
  }

  function injectTrack() {
    if (!video) return;
    const existing = Array.from(video.textTracks).find(t => t.label === targetLanguage);
    if (existing) {
      // Clear old cues and replace them
      const oldMode = existing.mode;
      existing.mode = 'hidden'; // Must be hidden or showing to access cues list
      try {
        while (existing.cues && existing.cues.length > 0) {
          existing.removeCue(existing.cues[0]);
        }
      } catch (e) {}
      existing.mode = oldMode;
      
      cues.forEach(cue => {
        try {
          const start = cue._rawStartTime ?? parseTimeToMs(cue.startTime) / 1000;
          const end = cue._rawEndTime ?? parseTimeToMs(cue.endTime) / 1000;
          existing.addCue(new (window as any).VTTCue(start, end, cue.text));
        } catch (e) {}
      });
      return;
    }

    const track = video.addTextTrack("captions", targetLanguage, targetLanguage);
    cues.forEach(cue => {
      try {
        const start = cue._rawStartTime ?? parseTimeToMs(cue.startTime) / 1000;
        const end = cue._rawEndTime ?? parseTimeToMs(cue.endTime) / 1000;
        track.addCue(new (window as any).VTTCue(start, end, cue.text));
      } catch (e) {}
    });
    console.log('✅ Native VTTCue Track injected');
  }

  function activateTrack(label: string) {
    if (!video) return;
    Array.from(video.textTracks).forEach(t => {
      t.mode = t.label === label ? 'showing' : 'disabled';
    });
    currentActiveLabel = label;
  }

  function addIndependentToggle() {
    const existingBtn = document.getElementById('native-independent-toggle');
    if (existingBtn) existingBtn.remove();
    
    const langInfo = languagesList.find(l => l.value === targetLanguage) || { value: 'km', name: 'Khmer', nativelabel: 'ភាសាខ្មែរ' };
    const langLabel = langInfo.name.split(' (')[0];
    
    const toggleBtn = document.createElement('div');
    toggleBtn.id = 'native-independent-toggle';
    toggleBtn.style.position = 'absolute';
    toggleBtn.style.bottom = '60px';
    toggleBtn.style.right = '20px';
    toggleBtn.style.zIndex = '999999';
    toggleBtn.style.display = 'flex';
    toggleBtn.style.alignItems = 'center';
    toggleBtn.style.gap = '8px';
    toggleBtn.style.padding = '4px 12px 4px 6px';
    toggleBtn.style.borderRadius = '20px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    toggleBtn.style.backdropFilter = 'blur(4px)';
    toggleBtn.style.transition = 'opacity 0.3s ease';

    // Switch Track
    const switchBg = document.createElement('div');
    switchBg.style.width = '32px';
    switchBg.style.height = '18px';
    switchBg.style.borderRadius = '18px';
    switchBg.style.position = 'relative';
    switchBg.style.transition = 'background-color 0.2s ease';
    
    // Switch Handle
    const switchKnob = document.createElement('div');
    switchKnob.style.width = '14px';
    switchKnob.style.height = '14px';
    switchKnob.style.backgroundColor = '#fff';
    switchKnob.style.borderRadius = '50%';
    switchKnob.style.position = 'absolute';
    switchKnob.style.top = '2px';
    switchKnob.style.transition = 'left 0.2s ease';
    switchKnob.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    switchBg.appendChild(switchKnob);

    // Label Text
    const textSpan = document.createElement('span');
    textSpan.style.fontFamily = "'Kantumruy Pro', sans-serif";
    textSpan.style.fontSize = '13px';
    textSpan.style.color = '#fff';
    textSpan.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
    textSpan.textContent = langInfo.nativelabel;

    toggleBtn.appendChild(switchBg);
    toggleBtn.appendChild(textSpan);

    const updateBtnUI = () => {
      const nativeTrack = Array.from(video!.textTracks).find(t => t.label === targetLanguage);
      const isShowing = nativeTrack?.mode === 'showing';
      
      switchBg.style.backgroundColor = isShowing ? '#E54D2E' : 'rgba(255, 255, 255, 0.25)';
      switchKnob.style.left = isShowing ? '16px' : '2px';
      textSpan.style.opacity = isShowing ? '1' : '0.8';
    };

    let fadeTimeout: any;
    const showButton = () => {
      toggleBtn.style.opacity = '1';
      clearTimeout(fadeTimeout);
      fadeTimeout = setTimeout(() => {
        toggleBtn.style.opacity = '0.3';
      }, 2500); // Fade out after 2.5 seconds of no movement
    };

    toggleBtn.addEventListener('mouseenter', () => {
      clearTimeout(fadeTimeout);
      toggleBtn.style.opacity = '1';
      toggleBtn.style.transform = 'scale(1.05)';
    });
    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.transform = 'scale(1)';
      showButton();
    });

    toggleBtn.addEventListener('click', () => {
      const nativeTrack = Array.from(video!.textTracks).find(t => t.label === targetLanguage);
      if (nativeTrack) {
        const isShowing = nativeTrack.mode === 'showing';
        activateTrack(isShowing ? 'English' : targetLanguage);
        updateBtnUI();
      }
    });

    const playerContainer = document.querySelector('.jwplayer') || document.querySelector('#player') || video.parentElement;
    if (playerContainer) {
      playerContainer.style.position = 'relative';
      playerContainer.appendChild(toggleBtn);
      
      // Listen to activity on the video player to wake up the button opacity
      playerContainer.addEventListener('mousemove', showButton);
      playerContainer.addEventListener('mousedown', showButton);
      playerContainer.addEventListener('touchstart', showButton);
      video!.addEventListener('play', showButton);
      video!.addEventListener('pause', showButton);
      
      updateBtnUI(); // Initial render
      showButton(); // Start idle timer
    }
  }

  injectStyle();
  injectTrack();
  activateTrack(targetLanguage); // Automatically activate it
  addIndependentToggle();

  // JW Player detects new tracks via 'addtrack' event and asynchronously forces them 
  // to 'disabled' to match its internal state menu. We wait for its sync to finish, 
  // then forcefully reactivate our track so the user doesn't have to click twice.
  setTimeout(() => activateTrack(targetLanguage), 50);
  setTimeout(() => activateTrack(targetLanguage), 250);

  console.log(`✅ ${targetLanguage} subtitle VTTCue setup complete!`);
}
