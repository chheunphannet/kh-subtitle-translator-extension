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
    isMatch: (host, _) => host.includes("stream.khanime.co")
  },
  {
    name: "KHFullHD",
    isMatch: (host, _) => host.includes("stream.khfullhd.co")
  },
  {
    name: "Anistream",
    isMatch: (host, _) => host.includes("anistream.one")
  },
  {
    name: "MangaKatana",
    isMatch: (host, _) => host.includes("mangakatana.com")
  },
  {
    name: "Comix.to",
    isMatch: (host, _) => host.includes("comix.to") || host.includes("comix")
  },
  {
    name: "MangaPlus",
    isMatch: (host, _) => host.includes("mangaplus.shueisha.co.jp")
  }
];

const matchedSite = SUPPORTED_SITES.find(site => site.isMatch(window.location.hostname, window.location.pathname));

if (matchedSite) {
  console.log(`[JW Subtitle Tester] ${matchedSite.name} site detected. Initializing content script...`);
  
  const announcePlayer = () => {
    const info = scanForMedia();
    if (info.hasPlayer || info.hasManga) {
      chrome.runtime.sendMessage({ action: "playerDetected", info }).catch(() => {});
      return true;
    }
    return false;
  };

  // Announce immediately, or poll for up to 10 seconds if the content is loading slowly
  if (!announcePlayer()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (announcePlayer() || attempts >= 20) {
        clearInterval(interval);
      }
    }, 500);
  }

  // Monitor URL changes and page/image count updates
  let lastUrl = location.href;
  let lastImageCount = 0;
  const spaObserver = new MutationObserver(() => {
    const url = location.href;
    const info = scanForMedia();
    const currentImageCount = info.mangaImagesCount;
    
    if (url !== lastUrl || currentImageCount !== lastImageCount) {
      lastUrl = url;
      lastImageCount = currentImageCount;
      announcePlayer();
    }
  });
  spaObserver.observe(document, { subtree: true, childList: true });

  // Watch for React re-rendering images or lazy-loaders changing src/data-src attributes
  const imageRevertObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const imgs = el.tagName === 'IMG' ? [el as HTMLImageElement] : Array.from(el.querySelectorAll('img'));
            imgs.forEach(img => {
              const src = img.getAttribute("data-src") || img.src;
              if (src && mangaTranslatedCache.has(src)) {
                const data = mangaTranslatedCache.get(src);
                if (!img.getAttribute('data-translated-applied')) {
                  applyTranslationToImage(img, data.result, data.completedCount, data.totalImages, data.imageIndex);
                }
              }
            });
          }
        });
      } else if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
        const img = mutation.target as HTMLImageElement;
        if (img.tagName === 'IMG') {
          const src = img.getAttribute("data-src") || img.src;
          if (src && mangaTranslatedCache.has(src)) {
            const data = mangaTranslatedCache.get(src);
            if (!img.getAttribute('data-translated-applied')) {
              applyTranslationToImage(img, data.result, data.completedCount, data.totalImages, data.imageIndex);
            }
          }
        }
      }
    }
  });
  imageRevertObserver.observe(document, { 
    subtree: true, 
    childList: true, 
    attributes: true, 
    attributeFilter: ['src', 'data-src'] 
  });
  
  // Store manga translation results globally (originalUrl -> result)
  const mangaTranslatedCache = new Map<string, any>();

  function applyTranslationToImage(imgEl: HTMLImageElement, result: any, completedCount: number, totalImages: number, imageIndex: number) {
    if (result.final_image) {
      // Normal mode: The holy grail for React SPAs. 
      imgEl.style.content = `url("data:image/jpeg;base64,${result.final_image}")`;
      imgEl.setAttribute('data-translated-applied', 'true');
      console.log(`[Manga] Image ${imageIndex} translated (normal mode) [${completedCount}/${totalImages}]`);
    } else if (result.text_blocks && result.text_blocks.length > 0) {
      // Fast mode: render text blocks on canvas overlay
      if (imgEl.getAttribute('data-translated-applied')) return;
      imgEl.setAttribute('data-translated-applied', 'true');
      const url = activeMangaUrls[imageIndex];
      renderMangaFastMode(imgEl, result.text_blocks, url)
        .then(() => console.log(`[Manga] Image ${imageIndex} translated (fast mode) [${completedCount}/${totalImages}]`))
        .catch((err) => {
          console.error(`[Manga] Fast mode rendering error for image ${imageIndex}:`, err);
        });
    } else {
      console.log(`[Manga] Image ${imageIndex} - no text detected [${completedCount}/${totalImages}]`);
    }
  }

  // Track manga UI state
  let mangaStartIndex = 0;
  let mangaAbortController: AbortController | null = null;
  const mangaImageElementMap = new Map<number, HTMLImageElement>();
  let activeMangaUrls: string[] = [];

  // Keep-alive port setup for manga translation in MV3
  let mangaKeepAlivePort: chrome.runtime.Port | null = null;
  let mangaKeepAliveInterval: any = null;

  function startMangaKeepAlive() {
    stopMangaKeepAlive();
    try {
      mangaKeepAlivePort = chrome.runtime.connect({ name: "manga-keep-alive" });
      mangaKeepAliveInterval = setInterval(() => {
        if (mangaKeepAlivePort) {
          mangaKeepAlivePort.postMessage({ action: "ping" });
          console.log("[Manga] Sent local ping to keep service worker alive.");
        }
      }, 15000);
      console.log("[Manga] Started background keep-alive heartbeat port.");
    } catch (e) {
      console.warn("[Manga] Failed to establish keep-alive port:", e);
    }
  }

  function stopMangaKeepAlive() {
    if (mangaKeepAliveInterval) {
      clearInterval(mangaKeepAliveInterval);
      mangaKeepAliveInterval = null;
    }
    if (mangaKeepAlivePort) {
      try {
        mangaKeepAlivePort.disconnect();
      } catch (e) {}
      mangaKeepAlivePort = null;
      console.log("[Manga] Stopped background keep-alive heartbeat port.");
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const info = scanForMedia();
    if (!info.hasPlayer && !info.hasManga) {
      return false; // Let other frames respond
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

    if (request.action === "translateManga") {
      const mangaInfo = scanForManga();
      if (!mangaInfo.hasManga) {
        sendResponse({ success: false, error: "No manga images found on this page." });
        return true;
      }

      // Determine the correct selector based on matched site
      let imgSelector = "img.rpage-page__img";
      if (matchedSite?.name === "MangaPlus") {
        imgSelector = "img.zao-image";
      } else if (matchedSite?.name === "MangaKatana") {
        imgSelector = "#imgs .wrap_img img";
      }

      const imgElements = document.querySelectorAll(imgSelector);
      if (imgElements.length === 0) {
        sendResponse({ success: false, error: "No manga image elements found." });
        return true;
      }

      const visibleIndex = getFirstVisibleImageIndex(imgElements);

      // Collect image URLs starting from the visible image and store DOM mapping
      const imageUrls: string[] = [];
      mangaImageElementMap.clear();
      activeMangaUrls = []; // Clear old URLs
      for (let i = visibleIndex; i < imgElements.length; i++) {
        const imgEl = imgElements[i] as HTMLImageElement;
        // Prioritize lazy-load source URLs over active src (which could be a placeholder)
        let url = imgEl.getAttribute("data-src") || 
                  imgEl.getAttribute("data-original") || 
                  imgEl.getAttribute("data-lazy-src") || 
                  imgEl.src || 
                  "";
        
        // If url is a data-URL placeholder, try to fall back to data-src
        if (url.startsWith("data:image/")) {
          const rawDataSrc = imgEl.getAttribute("data-src");
          if (rawDataSrc && !rawDataSrc.startsWith("data:image/")) {
            url = rawDataSrc;
          }
        }
        
        if (url) {
          mangaImageElementMap.set(i, imgEl);
          imageUrls.push(url);
          activeMangaUrls[i] = url; // Store by original index
        }
      }

      if (imageUrls.length === 0) {
        sendResponse({ success: false, error: "No valid image URLs found." });
        return true;
      }

      // Store the starting index so background can map back
      mangaStartIndex = visibleIndex;

      startMangaKeepAlive();

      chrome.runtime.sendMessage({
        action: "translateMangaPages",
        imageUrls,
        config: request.config,
        targetLanguage: request.targetLanguage,
        mangaServerUrl: request.mangaServerUrl,
        startIndex: visibleIndex
      }).catch((err) => {
        console.error("[Manga] Failed to send translateMangaPages:", err);
        stopMangaKeepAlive();
      });

      sendResponse({ success: true, totalImages: imageUrls.length, startIndex: visibleIndex });
      return true;
    }

    if (request.action === "mangaPageTranslated") {
      const { imageIndex, totalImages, completedCount, result } = request;
      const imgEl = mangaImageElementMap.get(imageIndex) as HTMLImageElement | undefined;
      const url = activeMangaUrls[imageIndex];

      if (url) {
        mangaTranslatedCache.set(url, { result, completedCount, totalImages, imageIndex });
      }

      if (!imgEl) {
        console.warn(`[Manga] No DOM element found for image index ${imageIndex}`);
        return false;
      }

      if (result.error) {
        console.error(`[Manga] Translation error for image ${imageIndex}:`, result.error);
        imgEl.style.outline = "3px solid #E54D2E";
        imgEl.style.outlineOffset = "-3px";
        stopMangaKeepAlive();
        return false;
      }

      applyTranslationToImage(imgEl, result, completedCount, totalImages, imageIndex);
      
      if (completedCount === totalImages) {
        stopMangaKeepAlive();
      }
      return false;
    }

    if (request.action === "grabImageBytes") {
      const url = request.url;
      grabDecryptedImageBytes(url)
        .then(base64 => sendResponse({ success: true, base64 }))
        .catch(err => {
          console.warn("[Manga] grabImageBytes error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (request.action === "cancelMangaTranslation") {
      stopMangaKeepAlive();
      chrome.runtime.sendMessage({
        action: "cancelMangaTranslation"
      }).catch((err) => console.error("[Manga] Failed to send cancel:", err));
      sendResponse({ success: true });
      return true;
    }
  });
}

interface DetectedSubInfo {
  hasPlayer: boolean;
  englishSubUrl: string | null;
  videoTitle: string;
}

interface DetectedMediaInfo {
  hasPlayer: boolean;
  englishSubUrl: string | null;
  videoTitle: string;
  hasManga: boolean;
  mangaImagesCount: number;
  mangaTitle: string;
  mangaChapter: string;
  mangaPagesRange?: string;
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

function scanForManga(): { hasManga: boolean; mangaImagesCount: number; mangaTitle: string; mangaChapter: string; mangaPagesRange: string } {
  const host = window.location.hostname;
  const path = window.location.pathname;
  const isMangaPlus = host.includes("mangaplus");
  const isMangaKatana = host.includes("mangakatana");
  const isComixto = host.includes("comix.to") || host.includes("comix");
  
  let imgSelector = "img.rpage-page__img"; // default/comix.to
  if (isMangaPlus) {
    imgSelector = "img.zao-image";
  } else if (isMangaKatana) {
    imgSelector = "#imgs .wrap_img img";
  } else if (isComixto) {
    imgSelector = "img.rpage-page__img"; 
  }
  
  const imgElements = document.querySelectorAll(imgSelector);
  const mangaImagesCount = imgElements.length;
  
  let isReader = false;
  if (isMangaPlus) {
    isReader = path.includes("/viewer/");
  } else if (isMangaKatana) {
    isReader = path.includes("/manga/") && (path.split("/").length >= 4);
  } else if (isComixto) {
    isReader = path.includes("read") || mangaImagesCount > 0;
  } else {
    isReader = (path.includes("/title/") && path.includes("chapter")) || mangaImagesCount > 0;
  }

  if (!isReader && mangaImagesCount === 0) {
    return { hasManga: false, mangaImagesCount: 0, mangaTitle: "", mangaChapter: "", mangaPagesRange: "" };
  }
  
  let mangaTitle = "Manga";
  let mangaChapter = "0";
  
  if (isMangaPlus) {
    const h1 = document.querySelector("h1");
    if (h1) {
      mangaTitle = h1.textContent.trim();
    } else {
      const titleEl = document.querySelector('div[class*="Navigation-module_detailContainer"] h1');
      if (titleEl) mangaTitle = titleEl.textContent.trim();
    }
    
    const chapTitleEl = document.querySelector('p[class*="Navigation-module_chapterTitle"]');
    if (chapTitleEl) {
      mangaChapter = chapTitleEl.textContent.trim();
    } else {
      const match = path.match(/viewer\/(\d+)/);
      if (match) mangaChapter = match[1];
    }
  } else if (isMangaKatana) {
    const breadcrumbs = document.querySelectorAll(".uk-breadcrumb li");
    if (breadcrumbs.length >= 2) {
      const titleLink = breadcrumbs[1].querySelector("span");
      if (titleLink) mangaTitle = titleLink.textContent.trim();
    }
    const activeBreadcrumb = document.querySelector(".uk-breadcrumb li.uk-active span");
    if (activeBreadcrumb) {
      mangaChapter = activeBreadcrumb.textContent.trim();
    } else if (breadcrumbs.length >= 3) {
      mangaChapter = breadcrumbs[breadcrumbs.length - 1].textContent.trim();
    }
  } else {
    // Comix.to / default
    const titleText = document.title;
    if (titleText.includes("·")) {
      const parts = titleText.split("·");
      mangaTitle = parts[0].trim();
      const chapPart = parts[1].toLowerCase();
      if (chapPart.includes("ch.")) {
        mangaChapter = chapPart.split("ch.")[1].trim();
      } else {
        mangaChapter = chapPart.replace(/[^\d.]/g, "").trim();
      }
    }
  }
  
  // Calculate range of loaded/visible pages
  let mangaPagesRange = "0";
  if (mangaImagesCount > 0) {
    const firstVisibleIndex = getFirstVisibleImageIndex(imgElements);
    
    // Find how many consecutive images starting from firstVisibleIndex are loaded
    let loadedCount = 0;
    for (let i = firstVisibleIndex; i < imgElements.length; i++) {
      const imgEl = imgElements[i] as HTMLImageElement;
      const src = imgEl.src || "";
      const isPlaceholder = src.startsWith("data:image/svg") || src.startsWith("data:image/gif") || src.startsWith("data:image/webp;base64,UklGR");
      const isLoaded = src && !isPlaceholder;
      
      if (isLoaded) {
        loadedCount++;
      } else {
        break;
      }
    }
    
    const startPage = firstVisibleIndex + 1;
    const endPage = startPage + Math.max(0, loadedCount - 1);
    mangaPagesRange = startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`;
  }
  
  return { hasManga: true, mangaImagesCount, mangaTitle, mangaChapter, mangaPagesRange };
}

function scanForMedia(): DetectedMediaInfo {
  const host = window.location.hostname;
  const path = window.location.pathname;
  const isMangaSite = ["MangaKatana", "Comix.to", "MangaPlus"].includes(matchedSite?.name || "");
  
  if (isMangaSite) {
    const mangaInfo = scanForManga();
    return {
      hasPlayer: false,
      englishSubUrl: null,
      videoTitle: "",
      hasManga: mangaInfo.hasManga,
      mangaImagesCount: mangaInfo.mangaImagesCount,
      mangaTitle: mangaInfo.mangaTitle,
      mangaChapter: mangaInfo.mangaChapter,
      mangaPagesRange: mangaInfo.mangaPagesRange
    };
  } else {
    // Verify path starts with /e/ for Khanime/KHFullHD, or is Anistream
    const isVideoMatch = (matchedSite?.name === "Anistream") || 
                         ((matchedSite?.name === "Khanime" || matchedSite?.name === "KHFullHD") && path.startsWith("/e/"));
                         
    if (!isVideoMatch) {
      return {
        hasPlayer: false,
        englishSubUrl: null,
        videoTitle: "",
        hasManga: false,
        mangaImagesCount: 0,
        mangaTitle: "",
        mangaChapter: ""
      };
    }
    
    const subInfo = scanForSubtitles();
    return {
      hasPlayer: subInfo.hasPlayer,
      englishSubUrl: subInfo.englishSubUrl,
      videoTitle: subInfo.videoTitle,
      hasManga: false,
      mangaImagesCount: 0,
      mangaTitle: "",
      mangaChapter: ""
    };
  }
}

// ------------------------------------
// Manga Translation Helpers
// ------------------------------------

// Map of image indices to their DOM elements for replacing after translation
const mangaImageElementMap: Map<number, HTMLImageElement> = new Map();
let mangaStartIndex = 0;

function getFirstVisibleImageIndex(imgElements: NodeListOf<Element>): number {
  const viewportHeight = window.innerHeight;
  for (let i = 0; i < imgElements.length; i++) {
    const rect = imgElements[i].getBoundingClientRect();
    // Image is visible if any part is within the viewport
    if (rect.bottom > 0 && rect.top < viewportHeight) {
      return i;
    }
  }
  return 0; // fallback to first image
}

async function loadMangaFonts(): Promise<void> {
  const isKoulenLoaded = Array.from(document.fonts).some(f => f.family === 'Koulen');
  const isKdamLoaded = Array.from(document.fonts).some(f => f.family === 'Kdam Thmor Pro');
  if (isKoulenLoaded && isKdamLoaded) return;

  try {
    const koulenUrl = chrome.runtime.getURL('fonts/koulen-khmer.woff2');
    const kdamThmorUrl = chrome.runtime.getURL('fonts/kdamthmorpro-khmer.woff2');
    const koulen = new FontFace('Koulen', `url("${koulenUrl}")`);
    const kdamThmor = new FontFace('Kdam Thmor Pro', `url("${kdamThmorUrl}")`);
    const [f1, f2] = await Promise.all([koulen.load(), kdamThmor.load()]);
    document.fonts.add(f1);
    document.fonts.add(f2);
    await document.fonts.ready;
    console.log("[Manga] Registered Koulen & Kdam Thmor Pro fonts in document.fonts");
  } catch (e) {
    console.warn("[Manga] Local font load warning:", e);
  }
}

function buildFontString(fontSize: number, fontFamily: string, isBold: boolean, isItalic: boolean): string {
  const style = isItalic ? 'italic' : 'normal';
  const weight = isBold ? 'bold' : 'normal';
  return `${style} ${weight} ${fontSize}px "${fontFamily}", sans-serif`;
}

function getWrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  let units: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      const segmenter = new (Intl as any).Segmenter('km', { granularity: 'word' });
      units = Array.from(segmenter.segment(text), (s: any) => s.segment);
    }
  } catch (e) {
    // Fallback if Segmenter unavailable
  }

  if (units.length === 0) {
    units = text.split(/(\s+)/);
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const unit of units) {
    const testLine = currentLine + unit;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = unit.trimStart();
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.trim());
  }

  // Secondary Grapheme-cluster fallback for any individual line that exceeds maxWidth
  const finalLines: string[] = [];
  for (const line of lines) {
    if (ctx.measureText(line).width > maxWidth && line.length > 1) {
      let graphemes: string[] = Array.from(line);
      try {
        if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
          const gSegmenter = new (Intl as any).Segmenter('km', { granularity: 'grapheme' });
          graphemes = Array.from(gSegmenter.segment(line), (s: any) => s.segment);
        }
      } catch (e) {}

      let subLine = '';
      for (const g of graphemes) {
        if (ctx.measureText(subLine + g).width > maxWidth && subLine.length > 0) {
          finalLines.push(subLine);
          subLine = g;
        } else {
          subLine += g;
        }
      }
      if (subLine.length > 0) finalLines.push(subLine);
    } else {
      finalLines.push(line);
    }
  }

  return finalLines.length > 0 ? finalLines : [text];
}

function renderTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number, maxHeight: number,
  fontFamily: string, startSize: number, minSize: number,
  isBold: boolean = false, isItalic: boolean = false
) {
  let fontSize = startSize;
  let lines: string[] = [];
  let lineHeight = fontSize * 1.35 + 2;

  while (fontSize >= minSize) {
    ctx.font = buildFontString(fontSize, fontFamily, isBold, isItalic);
    lineHeight = fontSize * 1.35 + 2;
    lines = getWrappedLines(ctx, text, Math.max(10, maxWidth - 4));
    const totalHeight = lines.length * lineHeight;

    if (totalHeight <= maxHeight) break;
    fontSize--;
  }

  ctx.font = buildFontString(fontSize, fontFamily, isBold, isItalic);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'black';

  const totalHeight = lines.length * lineHeight;
  const startY = y + (maxHeight - totalHeight) / 2 + lineHeight / 2;

  lines.forEach((line, index) => {
    ctx.fillText(line, x + maxWidth / 2, startY + index * lineHeight);
  });
}

async function renderMangaFastMode(
  imgEl: HTMLImageElement,
  textBlocks: Array<{ coords: number[]; text: string; font_size?: string }>,
  url?: string
): Promise<void> {
  await loadMangaFonts();

  let sourceImage: HTMLImageElement = imgEl;
  if (url) {
    try {
      const base64 = await grabDecryptedImageBytes(url);
      if (base64) {
        const dataImg = new Image();
        dataImg.src = `data:image/jpeg;base64,${base64}`;
        await new Promise<void>((resolve) => {
          dataImg.onload = () => resolve();
          dataImg.onerror = () => resolve();
        });
        if (dataImg.naturalWidth > 0) {
          sourceImage = dataImg;
        }
      }
    } catch (e) {
      console.warn("[Manga] Fast mode grabDecryptedImageBytes fallback warning:", e);
    }
  }

  // Wait for image to be fully loaded
  if (!sourceImage.complete) {
    await new Promise<void>((resolve) => {
      sourceImage.onload = () => resolve();
      sourceImage.onerror = () => resolve();
    });
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Failed to create canvas context");

  canvas.width = sourceImage.naturalWidth || imgEl.naturalWidth;
  canvas.height = sourceImage.naturalHeight || imgEl.naturalHeight;

  // Draw the non-tainted original image
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

  for (const block of textBlocks) {
    // coords are normalized 0-1000
    const [x1Norm, y1Norm, x2Norm, y2Norm] = block.coords;
    const px1 = (x1Norm / 1000) * canvas.width;
    const py1 = (y1Norm / 1000) * canvas.height;
    const px2 = (x2Norm / 1000) * canvas.width;
    const py2 = (y2Norm / 1000) * canvas.height;
    const boxW = px2 - px1;
    const boxH = py2 - py1;

    // Fill white rounded rectangle over the text area
    const radius = Math.min(6, boxW * 0.05, boxH * 0.05);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(px1 + radius, py1);
    ctx.lineTo(px2 - radius, py1);
    ctx.quadraticCurveTo(px2, py1, px2, py1 + radius);
    ctx.lineTo(px2, py2 - radius);
    ctx.quadraticCurveTo(px2, py2, px2 - radius, py2);
    ctx.lineTo(px1 + radius, py2);
    ctx.quadraticCurveTo(px1, py2, px1, py2 - radius);
    ctx.lineTo(px1, py1 + radius);
    ctx.quadraticCurveTo(px1, py1, px1 + radius, py1);
    ctx.closePath();
    ctx.fill();

    // Determine font size category and font family
    const sizeCategory = block.font_size || 'medium';
    let startSize: number;
    let minSize: number;
    let fontFamily: string;

    if (sizeCategory === 'large') {
      startSize = 28;
      fontFamily = 'Koulen';
    } else if (sizeCategory === 'medium') {
      startSize = 22;
      fontFamily = 'Kdam Thmor Pro';
    } else {
      startSize = 17;
      fontFamily = 'Kdam Thmor Pro';
    }

    // Min size: 12px for short text (<=10 chars), 10px otherwise
    minSize = block.text.length <= 10 ? 12 : 10;

    const isBold = (block as any).isBold || false;
    const isItalic = (block as any).isItalic || false;

    renderTextOnCanvas(ctx, block.text, px1, py1, boxW, boxH, fontFamily, startSize, minSize, isBold, isItalic);
  }

  // Replace the image source with the canvas content directly using CSS content property
  // This preserves 100% of the image element's original position, margins, and alignment
  const dataUrl = canvas.toDataURL('image/png');
  imgEl.style.content = `url("${dataUrl}")`;

  // Add visual indicator for translated image
  imgEl.style.outline = '3px solid #30A46C';
  imgEl.style.outlineOffset = '-3px';
  imgEl.style.transition = 'outline-color 0.5s ease';
  setTimeout(() => {
    imgEl.style.outline = '2px solid rgba(48, 164, 108, 0.4)';
  }, 2000);
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
  activeConfig.mangaConcurrency = user?.mangaConcurrency ?? activeConfig.mangaConcurrency;
  activeConfig.mangaTranslationMode = user?.mangaTranslationMode || activeConfig.mangaTranslationMode;
  activeConfig.mangaLimit = user?.mangaLimit ?? activeConfig.mangaLimit;

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

    const playerContainer = (document.querySelector('.jwplayer') || document.querySelector('#player') || video?.parentElement) as HTMLElement;
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

function findImageElementByUrl(url: string): HTMLImageElement | null {
  // 1. Try finding by exact match on src or data-src
  let img = document.querySelector(`img[src="${url}"], img[data-src="${url}"]`) as HTMLImageElement | null;
  if (img) return img;

  // 2. Fall back to matching by pathname (ignoring query parameters / domains)
  try {
    const urlObj = new URL(url, window.location.href);
    const pathname = urlObj.pathname;
    if (pathname && pathname !== "/") {
      const allImgs = Array.from(document.querySelectorAll("img"));
      for (const i of allImgs) {
        const src = i.src || "";
        const dataSrc = i.getAttribute("data-src") || "";
        if (src.includes(pathname) || dataSrc.includes(pathname)) {
          return i;
        }
      }
    }
  } catch (e) {
    // Ignore URL parse error
  }
  return null;
}

let messageIdCounter = 0;
const pendingMessages = new Map<number, { resolve: (val: string) => void, reject: (err: Error) => void }>();

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "FROM_MAIN_WORLD") return;
  
  const { id, success, base64, error } = event.data;
  const pending = pendingMessages.get(id);
  if (pending) {
    pendingMessages.delete(id);
    if (success && base64) {
      pending.resolve(base64);
    } else {
      pending.reject(new Error(error || "Main world fetch failed"));
    }
  }
});

function fetchDecryptedImageViaMainWorld(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++messageIdCounter;
    pendingMessages.set(id, { resolve, reject });
    
    // Set a timeout of 15 seconds
    setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error("Fetch timeout (15s) in main world"));
      }
    }, 15000);
    
    window.postMessage({
      type: "FROM_CONTENT_SCRIPT",
      action: "fetchDecryptedImage",
      url,
      id
    }, "*");
  });
}

async function grabDecryptedImageBytes(url: string): Promise<string> {
  const imgEl = findImageElementByUrl(url);

  // Method 1: Grab from HTML5 Canvas (highly efficient, captures the already-decrypted GPU texture!)
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Draw the current state of the img tag (which the Service Worker has decrypted)
        ctx.drawImage(imgEl, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          console.log("[Manga] Successfully extracted decrypted image bytes from canvas!");
          return base64;
        }
      }
    } catch (canvasErr: any) {
      console.warn("[Manga] Canvas extraction fallback (CORS tainted canvas):", canvasErr?.message || String(canvasErr));
    }
  }

  // Method 2: Fetch via the webpage context (main world) to trigger Service Worker decryption
  try {
    return await fetchDecryptedImageViaMainWorld(url);
  } catch (mainWorldErr: any) {
    console.warn("[Manga] Main world fetch failed, falling back to background fetch:", mainWorldErr?.message || String(mainWorldErr));
  }

  // Method 3: Request background script to fetch the image bytes (bypassing CORS)
  try {
    const res = await chrome.runtime.sendMessage({ action: "fetchImageAsBase64", url });
    if (res && res.success && res.base64) {
      console.log("[Manga] Successfully fetched image bytes via background script!");
      return res.base64;
    } else {
      throw new Error(res?.error || "Empty base64 from background");
    }
  } catch (bgErr: any) {
    console.error("[Manga] Background image fetch failed:", bgErr);
    throw new Error(`Failed to grab image bytes: ${bgErr.message}`);
  }
}

