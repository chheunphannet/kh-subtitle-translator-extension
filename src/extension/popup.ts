import { locales } from "./i18n/locales";
import { languagesList, parseSrt, parseVtt, parseAss, parseLrc, buildSrt, buildVtt, buildAss, buildLrc, SubtitleCue } from "./parsers";
import { GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";

// State
let selectedFile: File | null = null;
let currentLocale = "km";
let detectedSubUrl: string | null = null;
let detectedTitle = "";
let translatedFileContent = ""; // Stores text content for download
let translatedFileName = "";    // Stores filename for download

// DOM Elements
const uiLangSelect = document.getElementById("ui-lang-select") as HTMLSelectElement;

// Tab buttons
const tabs = document.querySelectorAll(".nav-tab");
const panels = document.querySelectorAll(".tab-panel");

// Inject Tab Elements
const autoDetectTitle = document.getElementById("auto-detect-title") as HTMLSpanElement;
const autoDetectDesc = document.getElementById("auto-detect-desc") as HTMLParagraphElement;
const btnAutoTranslate = document.getElementById("btn-auto-translate") as HTMLButtonElement;
const dropzone = document.getElementById("dropzone") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileInfo = document.getElementById("file-info") as HTMLDivElement;
const fileName = document.getElementById("file-name") as HTMLSpanElement;
const fileSize = document.getElementById("file-size") as HTMLSpanElement;
const sourceLangSelect = document.getElementById("source-lang-select") as HTMLSelectElement;
const targetLangSelect = document.getElementById("target-lang-select") as HTMLSelectElement;
const btnManualInject = document.getElementById("btn-manual-inject") as HTMLButtonElement;
const progressContainer = document.getElementById("progress-container") as HTMLDivElement;
const progressStatus = document.getElementById("progress-status") as HTMLSpanElement;
const progressPercent = document.getElementById("progress-percent") as HTMLSpanElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
const btnDownloadTranslated = document.getElementById("btn-download-translated") as HTMLButtonElement;

// Settings Tab Elements
const inputApiKey = document.getElementById("input-api-key") as HTMLInputElement;
const selectModel = document.getElementById("select-model") as HTMLSelectElement;
const btnTestConnection = document.getElementById("btn-test-connection") as HTMLButtonElement;
const checkContextAware = document.getElementById("check-context-aware") as HTMLInputElement;
const contextSettingsPanel = document.getElementById("context-settings-panel") as HTMLDivElement;
const inputContextWindow = document.getElementById("input-context-window") as HTMLInputElement;
const inputConcurrency = document.getElementById("input-concurrency") as HTMLInputElement;
const inputDelay = document.getElementById("input-delay") as HTMLInputElement;

// Prompts Tab Elements
const inputSystemPrompt = document.getElementById("input-system-prompt") as HTMLTextAreaElement;
const inputUserPrompt = document.getElementById("input-user-prompt") as HTMLTextAreaElement;

// Advanced Tab Elements
const checkUseCache = document.getElementById("check-use-cache") as HTMLInputElement;
const selectFormatPref = document.getElementById("select-format-pref") as HTMLSelectElement;
const btnClearCache = document.getElementById("btn-clear-cache") as HTMLButtonElement;

// Status Alert Area
const globalStatus = document.getElementById("global-status") as HTMLDivElement;

// ------------------------------------
// Initialization
// ------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Populate source & target languages
  populateLanguages();

  // Load Saved Configs
  const storage = await chrome.storage.local.get(["userConfig", "uiLanguage", "syncedConfig"]);
  
  // Set UI language
  if (storage.uiLanguage) {
    currentLocale = storage.uiLanguage;
    uiLangSelect.value = currentLocale;
  }
  updateUiLanguage();

  // Set initial settings values
  const userConfig = storage.userConfig as GeminiConfig || {};
  const syncedConfig = storage.syncedConfig;

  // Render settings based on saved configs, prioritize synced settings from web app
  const webConfigs = syncedConfig?.configs || userConfig.configs;
  const geminiWeb = webConfigs?.gemini || {};

  inputApiKey.value = geminiWeb.apiKey || userConfig.apiKey || "";
  selectModel.value = geminiWeb.model || userConfig.model || "gemini-3.5-flash";
  checkContextAware.checked = userConfig.contextWindow !== undefined ? true : (geminiWeb.contextWindow !== undefined);
  
  inputContextWindow.value = String(userConfig.contextWindow || geminiWeb.contextWindow || DEFAULT_GEMINI_CONFIG.contextWindow);
  inputConcurrency.value = String(userConfig.contextBatchSize || geminiWeb.contextBatchSize || DEFAULT_GEMINI_CONFIG.contextBatchSize);
  inputDelay.value = String(userConfig.delayTime !== undefined ? userConfig.delayTime : (geminiWeb.delayTime !== undefined ? geminiWeb.delayTime : DEFAULT_GEMINI_CONFIG.delayTime));
  
  inputSystemPrompt.value = syncedConfig?.systemPrompt || userConfig.systemPrompt || DEFAULT_GEMINI_CONFIG.systemPrompt;
  inputUserPrompt.value = syncedConfig?.userPrompt || userConfig.userPrompt || DEFAULT_GEMINI_CONFIG.userPrompt;
  checkUseCache.checked = userConfig.useCache !== undefined ? userConfig.useCache : DEFAULT_GEMINI_CONFIG.useCache;

  toggleContextPanel();
  checkActivePagePlayer();

  // Setup Event Listeners
  setupEventListeners();
});

// Populate Language Dropdowns
function populateLanguages() {
  languagesList.forEach((lang) => {
    // Add to source select
    const srcOpt = document.createElement("option");
    srcOpt.value = lang.value;
    srcOpt.textContent = lang.name;
    sourceLangSelect.appendChild(srcOpt);

    // Add to target select (exclude 'auto')
    if (lang.value !== "auto") {
      const tgtOpt = document.createElement("option");
      tgtOpt.value = lang.value;
      tgtOpt.textContent = lang.name;
      targetLangSelect.appendChild(tgtOpt);
    }
  });

  // Default targets
  sourceLangSelect.value = "auto";
  targetLangSelect.value = "km";
}

// Setup listeners
function setupEventListeners() {
  // UI Language Switcher
  uiLangSelect.addEventListener("change", () => {
    currentLocale = uiLangSelect.value;
    chrome.storage.local.set({ uiLanguage: currentLocale });
    updateUiLanguage();
  });

  // Navigation Tab Switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      
      tab.classList.add("active");
      const targetPanelId = `tab-${tab.getAttribute("data-tab")}`;
      document.getElementById(targetPanelId)?.classList.add("active");
    });
  });

  // File Upload Drag and Drop
  dropzone.addEventListener("click", () => fileInput.click());
  
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });
  
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer?.files.length) {
      handleManualFile(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      handleManualFile(fileInput.files[0]);
    }
  });

  // Context checkbox toggle
  checkContextAware.addEventListener("change", toggleContextPanel);

  // Settings Save Triggers (Save automatically on input change)
  const inputsToSave = [
    inputApiKey, selectModel, checkContextAware,
    inputContextWindow, inputConcurrency, inputDelay,
    inputSystemPrompt, inputUserPrompt, checkUseCache
  ];
  inputsToSave.forEach(input => {
    input.addEventListener("change", saveSettingsToStorage);
  });

  // Clear Cache Button
  btnClearCache.addEventListener("click", async () => {
    btnClearCache.setAttribute("disabled", "true");
    const res = await chrome.runtime.sendMessage({ action: "clearCache" });
    btnClearCache.removeAttribute("disabled");
    if (res.success) {
      showAlert(locales[currentLocale].cacheCleared, "success");
    } else {
      showAlert(locales[currentLocale].statusError + res.error, "error");
    }
  });

  // Connection Test Button
  btnTestConnection.addEventListener("click", runConnectionTest);

  // Auto Translate Inject Button
  btnAutoTranslate.addEventListener("click", runAutoTranslateInject);

  // Manual Translate Inject Button
  btnManualInject.addEventListener("click", runManualTranslateInject);

  // Subtitle Download Trigger
  btnDownloadTranslated.addEventListener("click", downloadTranslatedSub);
}

// ------------------------------------
// UI Logic & Helpers
// ------------------------------------
function updateUiLanguage() {
  const strings = locales[currentLocale];
  if (!strings) return;

  // Navigation tab labels
  document.getElementById("tab-btn-inject")!.textContent = strings.tabInject;
  document.getElementById("tab-btn-settings")!.textContent = strings.tabSettings;
  document.getElementById("tab-btn-prompts")!.textContent = strings.tabPrompts;
  document.getElementById("tab-btn-advanced")!.textContent = strings.tabAdvanced;

  // Inject panel labels
  document.getElementById("drag-drop-text")!.textContent = strings.dragDropText;
  document.getElementById("or-select-text")!.textContent = strings.orSelectText;
  document.getElementById("source-lang-label")!.textContent = strings.sourceLang;
  document.getElementById("target-lang-label")!.textContent = strings.targetLang;
  document.getElementById("divider-text")!.textContent = currentLocale === "km" ? "ឬ បញ្ចូលដោយខ្លួនឯង (Manual)" : (currentLocale === "zh" ? "或 手动上传文件注入" : "Or manual upload subtitle file");
  
  // Buttons
  btnAutoTranslate.textContent = currentLocale === "km" ? "បកប្រែ & បញ្ចូលដោយស្វ័យប្រវត្ត" : (currentLocale === "zh" ? "自动下载并翻译注入" : "Auto Translate & Inject");
  btnManualInject.textContent = strings.btnInject;
  btnDownloadTranslated.textContent = strings.btnSave;
  btnTestConnection.textContent = strings.btnTestConnection;
  btnClearCache.textContent = strings.btnClearCache;

  // Settings Panel labels
  document.getElementById("api-key-label")!.textContent = strings.apiKeyLabel;
  inputApiKey.placeholder = strings.apiKeyPlaceholder;
  document.getElementById("model-label")!.textContent = strings.modelLabel;
  document.getElementById("context-toggle-label")!.textContent = strings.contextToggle;
  document.getElementById("context-window-label")!.textContent = strings.contextWindowLabel;
  document.getElementById("concurrency-label")!.textContent = strings.concurrencyLabel;
  document.getElementById("delay-label")!.textContent = strings.delayLabel;

  // Prompts labels
  document.getElementById("system-prompt-label")!.textContent = strings.systemPromptLabel;
  document.getElementById("user-prompt-label")!.textContent = strings.userPromptLabel;

  // Advanced labels
  document.getElementById("cache-toggle-label")!.textContent = strings.cacheToggle;
  document.getElementById("format-pref-label")!.textContent = strings.formatPrefLabel;

  // Auto-detect status update
  if (!detectedSubUrl) {
    autoDetectTitle.textContent = currentLocale === "km" ? "កំពុងស្វែងរក Player..." : (currentLocale === "zh" ? "正在检测播放器..." : "Scanning for JW Player...");
    autoDetectDesc.textContent = strings.detectDesc;
  }
}

function toggleContextPanel() {
  if (checkContextAware.checked) {
    contextSettingsPanel.style.display = "block";
  } else {
    contextSettingsPanel.style.display = "none";
  }
}

function showAlert(message: string, type: "success" | "error" | "info") {
  globalStatus.textContent = message;
  globalStatus.style.display = "block";
  globalStatus.className = `alert-box alert-${type}`;
  
  // Autoclose after 4 seconds
  setTimeout(() => {
    globalStatus.style.display = "none";
  }, 4000);
}

// ------------------------------------
// AI Connection Testing
// ------------------------------------
async function runConnectionTest() {
  btnTestConnection.setAttribute("disabled", "true");
  btnTestConnection.textContent = locales[currentLocale].statusTesting;

  const config = await getActiveConfig();
  if (!config.apiKey) {
    showAlert("Please enter your Gemini API Key first.", "error");
    btnTestConnection.removeAttribute("disabled");
    btnTestConnection.textContent = locales[currentLocale].btnTestConnection;
    return;
  }

  // Translate a tiny dummy word to check connection
  chrome.runtime.sendMessage({
    action: "translateSubtitles",
    cues: [{ id: "1", startTime: "00:00:01.000", endTime: "00:00:03.000", text: "Hello", originalText: "Hello" }],
    targetLanguage: "km",
    sourceLanguage: "en",
    config: { ...config, useCache: false } // Avoid cache hit during test
  }, (res) => {
    btnTestConnection.removeAttribute("disabled");
    btnTestConnection.textContent = locales[currentLocale].btnTestConnection;

    if (res && res.success && res.translatedTexts?.[0]) {
      showAlert(locales[currentLocale].statusTestSuccess, "success");
    } else {
      showAlert(locales[currentLocale].statusTestFail + " " + (res?.error || "Unknown response"), "error");
    }
  });
}

// ------------------------------------
// Active Web Page Sniffing
// ------------------------------------
function checkActivePagePlayer() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    if (!activeTab.id) return;

    // Send a message to content script in the active tab to scan the page
    chrome.tabs.sendMessage(activeTab.id, { action: "getDetectedSubtitles" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded (e.g. settings page)
        return;
      }

      if (response && response.hasPlayer) {
        // Player found!
        document.getElementById("auto-detect-box")!.classList.add("card");
        const pulse = document.querySelector(".pulse-dot") as HTMLSpanElement;
        pulse.classList.remove("inactive");

        if (response.englishSubUrl) {
          detectedSubUrl = response.englishSubUrl;
          detectedTitle = response.videoTitle;
          autoDetectTitle.textContent = currentLocale === "km" ? "បានរកឃើញ Subtitle ភាសាអង់គ្លេស!" : (currentLocale === "zh" ? "已检测到英文外挂字幕！" : "English Subtitles Detected!");
          autoDetectDesc.textContent = response.videoTitle;
          btnAutoTranslate.removeAttribute("disabled");
          btnAutoTranslate.classList.remove("disabled");
        } else {
          autoDetectTitle.textContent = currentLocale === "km" ? "រកឃើញ Video Player" : (currentLocale === "zh" ? "已检测到播放器" : "Video Player Detected");
          autoDetectDesc.textContent = currentLocale === "km" ? "ប៉ុន្តែរកមិនឃើញ Subtitle ភាសាអង់គ្លេសស្វ័យប្រវត្តទេ។" : (currentLocale === "zh" ? "但未检测到英文外挂字幕。" : "But no English subtitle track was detected.");
          btnAutoTranslate.setAttribute("disabled", "true");
          btnAutoTranslate.classList.add("disabled");
        }
      }
    });
  });
}

// ------------------------------------
// File Handling
// ------------------------------------
function handleManualFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'srt' && ext !== 'vtt' && ext !== 'ass' && ext !== 'lrc') {
    showAlert("Please select a valid subtitle file (.srt, .vtt, .ass, .lrc).", "error");
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = `${(file.size / 1024).toFixed(2)} KB`;
  fileInfo.style.display = "flex";
  
  btnManualInject.removeAttribute("disabled");
  btnManualInject.classList.remove("disabled");
}

// ------------------------------------
// Configuration Storage Syncing
// ------------------------------------
async function getActiveConfig(): Promise<GeminiConfig> {
  const storage = await chrome.storage.local.get(["syncedConfig", "userConfig"]);
  const active = { ...DEFAULT_GEMINI_CONFIG };

  // Prioritize configuration synced from webapp localStorage, fallback to popup settings
  const webConfigs = storage.syncedConfig?.configs || storage.userConfig?.configs;
  const geminiWeb = webConfigs?.gemini || {};

  active.apiKey = inputApiKey.value.trim() || geminiWeb.apiKey || storage.userConfig?.apiKey || active.apiKey;
  active.model = selectModel.value || geminiWeb.model || storage.userConfig?.model || active.model;
  
  // Read thinking setting / temperature
  active.temperature = geminiWeb.temperature !== undefined ? geminiWeb.temperature : (storage.userConfig?.temperature !== undefined ? storage.userConfig.temperature : active.temperature);

  active.systemPrompt = inputSystemPrompt.value.trim() || storage.syncedConfig?.systemPrompt || storage.userConfig?.systemPrompt || active.systemPrompt;
  active.userPrompt = inputUserPrompt.value.trim() || storage.syncedConfig?.userPrompt || storage.userConfig?.userPrompt || active.userPrompt;
  
  active.useCache = checkUseCache.checked;

  if (checkContextAware.checked) {
    active.contextWindow = parseInt(inputContextWindow.value, 10) || DEFAULT_GEMINI_CONFIG.contextWindow;
    active.contextBatchSize = parseInt(inputConcurrency.value, 10) || DEFAULT_GEMINI_CONFIG.contextBatchSize;
    active.delayTime = parseInt(inputDelay.value, 10) || DEFAULT_GEMINI_CONFIG.delayTime;
  } else {
    // Non-context-aware runs line-by-line (contextWindow = 1)
    active.contextWindow = 1;
    active.contextBatchSize = parseInt(inputConcurrency.value, 10) || 10; // High concurrency for line-by-line
    active.delayTime = 0;
  }

  return active;
}

async function saveSettingsToStorage() {
  const configs = {
    gemini: {
      apiKey: inputApiKey.value.trim(),
      model: selectModel.value,
      temperature: DEFAULT_GEMINI_CONFIG.temperature
    }
  };

  const userConfig = {
    configs,
    apiKey: inputApiKey.value.trim(),
    model: selectModel.value,
    systemPrompt: inputSystemPrompt.value.trim(),
    userPrompt: inputUserPrompt.value.trim(),
    useCache: checkUseCache.checked,
    contextWindow: checkContextAware.checked ? parseInt(inputContextWindow.value, 10) : undefined,
    contextBatchSize: checkContextAware.checked ? parseInt(inputConcurrency.value, 10) : undefined,
    delayTime: checkContextAware.checked ? parseInt(inputDelay.value, 10) : undefined,
  };

  await chrome.storage.local.set({ userConfig });
}

// ------------------------------------
// Translation Executions
// ------------------------------------

// Listen to progress updates sent from background script during translation
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "translationProgress") {
    const percent = message.percent;
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
  }
});

// Run Auto-Translate on Khanime
async function runAutoTranslateInject() {
  if (!detectedSubUrl) return;

  btnAutoTranslate.setAttribute("disabled", "true");
  btnAutoTranslate.classList.add("disabled");
  
  // Show progress bar
  progressContainer.style.display = "block";
  progressStatus.textContent = locales[currentLocale].statusTranslating;
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  btnDownloadTranslated.style.display = "none";

  const targetLang = targetLangSelect.value;
  const sourceLang = sourceLangSelect.value;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    if (!activeTab.id) return;

    chrome.tabs.sendMessage(activeTab.id, {
      action: "autoTranslateAndInject",
      targetLanguage: targetLang,
      sourceLanguage: sourceLang
    }, (res) => {
      btnAutoTranslate.removeAttribute("disabled");
      btnAutoTranslate.classList.remove("disabled");

      if (res && res.success) {
        progressStatus.textContent = locales[currentLocale].statusInjected;
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        
        // Cache content for download
        translatedFileContent = res.text;
        translatedFileName = res.fileName;
        btnDownloadTranslated.style.display = "block";
        showAlert(locales[currentLocale].statusInjected, "success");
      } else {
        progressContainer.style.display = "none";
        showAlert(locales[currentLocale].statusError + (res?.error || "Unknown error occurred"), "error");
      }
    });
  });
}

// Run Manual-Translate & Inject
async function runManualTranslateInject() {
  if (!selectedFile) return;

  btnManualInject.setAttribute("disabled", "true");
  btnManualInject.classList.add("disabled");

  // Show progress bar
  progressContainer.style.display = "block";
  progressStatus.textContent = locales[currentLocale].statusTranslating;
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  btnDownloadTranslated.style.display = "none";

  const targetLang = targetLangSelect.value;
  const sourceLang = sourceLangSelect.value;
  const formatPref = selectFormatPref.value; // srt vs vtt

  const reader = new FileReader();
  
  reader.onload = async (e) => {
    const rawText = e.target?.result as string;
    if (!rawText) {
      showAlert("Empty subtitle file content.", "error");
      resetManualInjectBtn();
      return;
    }

    try {
      const ext = selectedFile!.name.split('.').pop()?.toLowerCase() || 'srt';
      let cues: SubtitleCue[] = [];
      let assFile: any = null;

      // Parse subtitle
      if (ext === 'vtt' || rawText.trim().startsWith('WEBVTT')) {
        cues = parseVtt(rawText);
      } else if (ext === 'ass') {
        assFile = parseAss(rawText);
        cues = assFile.cues;
      } else if (ext === 'lrc') {
        cues = parseLrc(rawText);
      } else {
        cues = parseSrt(rawText);
      }

      if (cues.length === 0) {
        throw new Error("No subtitle cues detected. File format might be invalid.");
      }

      // Get configuration
      const config = await getActiveConfig();

      // Translate cues
      chrome.runtime.sendMessage({
        action: "translateSubtitles",
        cues,
        targetLanguage: targetLang,
        sourceLanguage: sourceLang,
        config
      }, (res) => {
        resetManualInjectBtn();

        if (res && res.success) {
          progressStatus.textContent = locales[currentLocale].statusInjected;
          progressBar.style.width = "100%";
          progressPercent.textContent = "100%";

          // Re-assemble translated file in original format or preference format
          const translatedCues = cues.map((cue, idx) => ({
            ...cue,
            text: res.translatedTexts[idx] || cue.text
          }));

          let finalFileText = "";
          let finalExt = formatPref;
          
          if (ext === 'ass' && assFile) {
            assFile.cues = translatedCues;
            finalFileText = buildAss(assFile);
            finalExt = 'ass';
          } else if (ext === 'lrc') {
            finalFileText = buildLrc(translatedCues);
            finalExt = 'lrc';
          } else {
            // Rebuild into selected preference (SRT or WebVTT)
            finalFileText = formatPref === 'srt' ? buildSrt(translatedCues) : buildVtt(translatedCues);
          }

          // Generate name for download
          const baseName = selectedFile!.name.substring(0, selectedFile!.name.lastIndexOf('.'));
          translatedFileName = `${baseName}_${targetLang}.${finalExt}`;
          translatedFileContent = finalFileText;
          btnDownloadTranslated.style.display = "block";

          // Always inject as VTT standard to player compatibility
          const vttText = buildVtt(translatedCues);

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            const activeTab = tabs[0];
            if (!activeTab.id) return;

            chrome.tabs.sendMessage(activeTab.id, {
              action: "injectSubtitles",
              content: vttText,
              fileName: translatedFileName
            }, (injectRes) => {
              if (injectRes && injectRes.success) {
                showAlert(locales[currentLocale].statusInjected, "success");
              } else {
                showAlert(locales[currentLocale].statusError + (injectRes?.error || "JW Player not found"), "error");
              }
            });
          });
        } else {
          progressContainer.style.display = "none";
          showAlert(locales[currentLocale].statusError + (res?.error || "Translation failed"), "error");
        }
      });

    } catch (err) {
      resetManualInjectBtn();
      progressContainer.style.display = "none";
      showAlert((err as Error).message, "error");
    }
  };

  reader.onerror = () => {
    resetManualInjectBtn();
    showAlert("Failed to read file.", "error");
  };

  reader.readAsText(selectedFile);
}

function resetManualInjectBtn() {
  btnManualInject.removeAttribute("disabled");
  btnManualInject.classList.remove("disabled");
}

// Download/Save Translated file
function downloadTranslatedSub() {
  if (!translatedFileContent || !translatedFileName) return;

  const blob = new Blob([translatedFileContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = translatedFileName;
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
