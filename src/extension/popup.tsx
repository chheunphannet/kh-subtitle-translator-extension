import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme, Tabs, Select, Button, Upload, message, Progress, Switch, Input, InputNumber, Divider, Card, Typography, Space, AutoComplete, Segmented, Tooltip } from 'antd';
import { InboxOutlined, GlobalOutlined, SettingOutlined, FileTextOutlined, ControlOutlined, ApiOutlined, CheckCircleOutlined, InfoCircleOutlined, SendOutlined, QuestionCircleOutlined, GithubOutlined } from '@ant-design/icons';
import { locales } from "./i18n/locales";
import { languagesList, parseSrt, parseVtt, parseAss, parseLrc, buildSrt, buildVtt, buildAss, buildLrc, SubtitleCue, formatSubtitleText, generateSubtitleExport } from "./parsers";
import { GeminiConfig, DEFAULT_GEMINI_CONFIG } from "./services/gemini";

const { Dragger } = Upload;
const { Title, Text } = Typography;
const { TextArea } = Input;

const normalizeServerUrl = (url: string): string => {
  let u = (url || '').trim();
  if (!u) return '';
  u = u.replace(/\/+$/, ''); // Remove trailing slashes
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`; // Default to https://
  }
  return u;
};

const App = () => {
  const [uiLanguage, setUiLanguage] = useState('km');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('km');
  const [config, setConfig] = useState<GeminiConfig>(DEFAULT_GEMINI_CONFIG);
  
  const [detectedSubUrl, setDetectedSubUrl] = useState<string | null>(null);
  const [detectedTitle, setDetectedTitle] = useState<string>('');
  const [detectedManga, setDetectedManga] = useState<{
    hasManga: boolean;
    mangaTitle: string;
    mangaChapter: string;
    mangaImagesCount: number;
    mangaPagesRange?: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translatedFileName, setTranslatedFileName] = useState<string | null>(null);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testingServer, setTestingServer] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [formatPref, setFormatPref] = useState('vtt');
  const [exportMode, setExportMode] = useState<'translatedOnly' | 'bilingual'>('translatedOnly');
  const [bilingualOrder, setBilingualOrder] = useState<'translationFirst' | 'originalFirst'>('translationFirst');

  const [activeTranslationType, setActiveTranslationType] = useState<'subtitle' | 'manga' | null>(null);
  const [mangaServerUrl, setMangaServerUrl] = useState('https://khdownloader.xyz');

  const configLoaded = useRef(false);
  const hasPlayerRef = useRef(false);

  const loc = locales[uiLanguage as keyof typeof locales] || locales['en'];

  const restoreCompletedTranslation = useCallback((status: any) => {
    if (!status || !status.cues || !status.translatedTexts) return;

    const translatedCues = status.cues.map((cue: any, idx: number) => {
      let finalFormat = 'translated';
      if (status.exportMode === 'bilingual') {
        finalFormat = status.bilingualOrder === 'translationFirst' ? 'translation_above' : 'translation_below';
      }
      return {
        ...cue,
        text: formatSubtitleText(cue.originalText || cue.text, status.translatedTexts[idx], finalFormat)
      };
    });

    // Rebuild export using the stored formatPref (or current popup formatPref as fallback)
    const exportData = generateSubtitleExport(translatedCues, status.formatPref || formatPref || 'vtt');

    const baseName = status.fileName ? status.fileName.substring(0, status.fileName.lastIndexOf('.')) : 'subtitles';
    setTranslatedFileName(`${baseName}_${status.targetLang}.${exportData.ext}`);
    setTranslatedContent(exportData.text);
    setProgress(100);
    setProgressStatus(loc.statusInjected);

    // Clear background state so it won't be restored again on next popup open
    chrome.runtime.sendMessage({ action: "clearTranslationState" }).catch(() => {});
  }, [loc.statusInjected, formatPref]);

  const handleCancel = () => {
    const action = activeTranslationType === 'manga' ? "cancelMangaTranslation" : "cancelTranslation";
    chrome.runtime.sendMessage({ action }).then(() => {
      setTranslating(false);
      setProgress(0);
      setProgressStatus('');
      setActiveTranslationType(null);
      message.info(activeTranslationType === 'manga' ? loc.mangaCancelledStatus || "Manga translation cancelled." : "Translation cancelled.");
    }).catch(() => {});
  };

  useEffect(() => {
    chrome.storage.local.get(["userConfig", "uiLanguage", "exportMode", "bilingualOrder", "formatPref", "targetLang", "sourceLang", "mangaServerUrl"]).then((storage: any) => {
      if (storage.uiLanguage) setUiLanguage(storage.uiLanguage);
      if (storage.exportMode) setExportMode(storage.exportMode);
      if (storage.bilingualOrder) setBilingualOrder(storage.bilingualOrder);
      if (storage.formatPref) setFormatPref(storage.formatPref);
      if (storage.targetLang) setTargetLang(storage.targetLang);
      if (storage.sourceLang) setSourceLang(storage.sourceLang);
      if (storage.mangaServerUrl) setMangaServerUrl(storage.mangaServerUrl);
      
      const userConfig = storage.userConfig || {};

      setConfig({
        ...DEFAULT_GEMINI_CONFIG,
        apiKey: userConfig.apiKey || "",
        model: userConfig.model || "gemini-3.1-flash-lite",
        temperature: userConfig.temperature ?? DEFAULT_GEMINI_CONFIG.temperature,
        systemPrompt: userConfig.systemPrompt || DEFAULT_GEMINI_CONFIG.systemPrompt,
        userPrompt: userConfig.userPrompt || DEFAULT_GEMINI_CONFIG.userPrompt,
        useCache: userConfig.useCache ?? DEFAULT_GEMINI_CONFIG.useCache,
        contextWindow: userConfig.contextWindow ?? DEFAULT_GEMINI_CONFIG.contextWindow,
        contextBatchSize: userConfig.contextBatchSize ?? DEFAULT_GEMINI_CONFIG.contextBatchSize,
        delayTime: userConfig.delayTime ?? DEFAULT_GEMINI_CONFIG.delayTime,
        isMature: userConfig.isMature ?? DEFAULT_GEMINI_CONFIG.isMature,
        mangaConcurrency: userConfig.mangaConcurrency ?? userConfig.mangaImagesPerRequest ?? DEFAULT_GEMINI_CONFIG.mangaConcurrency,
        mangaTranslationMode: userConfig.mangaTranslationMode || DEFAULT_GEMINI_CONFIG.mangaTranslationMode,
        mangaLimit: userConfig.mangaLimit ?? DEFAULT_GEMINI_CONFIG.mangaLimit,
        mangaTranslateModel: userConfig.mangaTranslateModel || DEFAULT_GEMINI_CONFIG.mangaTranslateModel,
      });
      configLoaded.current = true;

      // Query active translation status once local configurations are parsed
      chrome.runtime.sendMessage({ action: "getTranslationStatus" }).then((status: any) => {
        if (status) {
          if (status.translating) {
            setTranslating(true);
            if (status.isManga) {
              setActiveTranslationType('manga');
              setProgress(status.percent || 0);
              const sIndex = typeof status.startIndex === 'number' ? status.startIndex + 1 : 1;
              const eIndex = typeof status.totalImages === 'number' ? sIndex + status.totalImages - 1 : 1;
              setProgressStatus(`${loc.mangaTranslatingStatus} [Page ${sIndex}-${eIndex}] (${status.completedCount || 0}/${status.totalImages || 0})`);
            } else {
              setActiveTranslationType('subtitle');
              setProgress(status.percent);
              setProgressStatus(loc.statusTranslating);
            }
          } else if (status.status === "Completed" && !status.isManga && status.translatedTexts && status.cues) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const activeTab = tabs[0];
              if (activeTab?.id) {
                chrome.tabs.sendMessage(activeTab.id, { action: "getDetectedSubtitles" }, (resp) => {
                  if (!chrome.runtime.lastError && resp?.hasManga) {
                    // Do not restore subtitle completion state on a manga page
                    return;
                  }
                  restoreCompletedTranslation(status);
                });
              } else {
                restoreCompletedTranslation(status);
              }
            });
          }
        }
      }).catch(() => {});
    });
  }, []); // Run ONLY once on mount to avoid infinite loop when changing formatPref

  useEffect(() => {
    checkActivePagePlayer();

    // Poll for the player/manga status while popup is open
    const pollInterval = setInterval(() => {
      if (!translating) {
        checkActivePagePlayer();
      }
    }, 1000);

    const messageListener = (msg: any) => {
      if (msg.action === "playerDetected") {
        if (msg.info) {
          if (msg.info.hasPlayer) {
            hasPlayerRef.current = true;
            if (msg.info.englishSubUrl) {
              setDetectedSubUrl(msg.info.englishSubUrl);
              setDetectedTitle(msg.info.videoTitle);
            } else {
              setDetectedSubUrl(null);
            }
            setDetectedManga(null);
          } else if (msg.info.hasManga) {
            hasPlayerRef.current = true;
            setDetectedManga((prev: any) => {
              if (prev && prev.hasManga && prev.mangaTitle === msg.info.mangaTitle && prev.mangaChapter === msg.info.mangaChapter && prev.mangaImagesCount === msg.info.mangaImagesCount && prev.mangaPagesRange === msg.info.mangaPagesRange) {
                return prev;
              }
              return {
                hasManga: true,
                mangaTitle: msg.info.mangaTitle,
                mangaChapter: msg.info.mangaChapter,
                mangaImagesCount: msg.info.mangaImagesCount,
                mangaPagesRange: msg.info.mangaPagesRange
              };
            });
            setDetectedSubUrl(null);
            if (!translating && activeTranslationType !== 'manga') {
              setTranslatedContent(null);
              setTranslatedFileName(null);
              setProgress(0);
              setProgressStatus('');
            }
          }
        }
      }
      if (msg.action === "translationProgress") {
        // Only update progress if we are currently doing a subtitle translation
        // (ignore stale 100% broadcasts from a previous completed translation)
        if (activeTranslationType === 'subtitle' || (!activeTranslationType && msg.percent < 100)) {
          setActiveTranslationType('subtitle');
          setTranslating(true);
          setProgress(msg.percent);
          if (msg.percent === 100) {
            setProgressStatus(loc.statusInjected);
            // The handleAutoTranslate/handleManualInject callbacks handle the final state,
            // so just mark as done here.
            setTimeout(() => {
              setTranslating(false);
              setActiveTranslationType(null);
            }, 500);
          } else {
            setProgressStatus(loc.statusTranslating);
          }
        }
      }
      if (msg.action === "mangaTranslationProgress") {
        setActiveTranslationType('manga');
        setTranslating(true);
        setProgress(msg.percent || 0);
        if (msg.status === "Completed") {
          setProgressStatus(loc.statusCompleted);
          setTimeout(() => {
            setTranslating(false);
            setActiveTranslationType(null);
          }, 2000);
        } else if (msg.status === "Cancelled") {
          setProgressStatus("Cancelled");
          setTimeout(() => {
            setTranslating(false);
            setActiveTranslationType(null);
          }, 2000);
        } else if (msg.status === "Failed") {
          setProgressStatus(msg.error || "Translation Failed");
          message.error(msg.error || "Manga translation failed.");
          setTimeout(() => {
            setTranslating(false);
            setActiveTranslationType(null);
          }, 4000);
        } else {
          const sIndex = typeof msg.startIndex === 'number' ? msg.startIndex + 1 : 1;
          const eIndex = typeof msg.total === 'number' ? sIndex + msg.total - 1 : 1;
          setProgressStatus(`${loc.mangaTranslatingStatus} [Page ${sIndex}-${eIndex}] (${msg.completed || 0}/${msg.total || 0})`);
        }
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    
    return () => {
      clearInterval(pollInterval);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [restoreCompletedTranslation, translating, activeTranslationType, loc]);

  useEffect(() => {
    // Only save after initial load completes to avoid overwriting stored config with defaults
    if (!configLoaded.current) return;
    const trimmedUrl = normalizeServerUrl(mangaServerUrl);
    chrome.storage.local.set({ userConfig: config, exportMode, bilingualOrder, formatPref, targetLang, sourceLang, mangaServerUrl: trimmedUrl });
  }, [config, exportMode, bilingualOrder, formatPref, targetLang, sourceLang, mangaServerUrl]);

  const checkActivePagePlayer = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      if (!activeTab.id) return;

      chrome.tabs.sendMessage(activeTab.id, { action: "getDetectedSubtitles" }, (response) => {
        if (chrome.runtime.lastError) return; // ignore
        if (response) {
          if (response.hasPlayer) {
            hasPlayerRef.current = true;
            if (response.englishSubUrl) {
              setDetectedSubUrl(response.englishSubUrl);
              setDetectedTitle(response.videoTitle);
            } else {
              setDetectedSubUrl(null);
            }
            setDetectedManga(null);
          } else if (response.hasManga) {
            hasPlayerRef.current = true;
            setDetectedManga((prev: any) => {
              if (prev && prev.hasManga && prev.mangaTitle === response.mangaTitle && prev.mangaChapter === response.mangaChapter && prev.mangaImagesCount === response.mangaImagesCount && prev.mangaPagesRange === response.mangaPagesRange) {
                return prev;
              }
              return {
                hasManga: true,
                mangaTitle: response.mangaTitle,
                mangaChapter: response.mangaChapter,
                mangaImagesCount: response.mangaImagesCount,
                mangaPagesRange: response.mangaPagesRange
              };
            });
            setDetectedSubUrl(null);
            if (!translating && activeTranslationType !== 'manga') {
              setTranslatedContent(null);
              setTranslatedFileName(null);
              setProgress(0);
              setProgressStatus('');
            }
          } else {
            setDetectedSubUrl(null);
            setDetectedManga(null);
          }
        }
      });
    });
  };

  const handleManualInject = async () => {
    if (!selectedFile) return;
    setTranslating(true);
    setProgress(0);
    setProgressStatus(loc.statusTranslating);
    setTranslatedContent(null);
    setTranslatedFileName(null);

    try {
      const text = await selectedFile.text();
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'srt';
      let cues: SubtitleCue[] = [];
      let assFile: any = null;

      if (ext === 'vtt' || text.trim().startsWith('WEBVTT')) cues = parseVtt(text);
      else if (ext === 'ass') {
        assFile = parseAss(text);
        cues = assFile.cues;
      }
      else if (ext === 'lrc') cues = parseLrc(text);
      else cues = parseSrt(text);

      if (cues.length === 0) throw new Error("No subtitle cues detected.");

      chrome.runtime.sendMessage({
        action: "translateSubtitles",
        cues,
        targetLanguage: targetLang,
        sourceLanguage: sourceLang,
        config,
        fileName: selectedFile.name,
        exportMode,
        bilingualOrder,
        formatPref
      }, (res) => {
        if (res && res.success) {
          setProgress(100);
          setProgressStatus(loc.statusInjected);
          message.success(loc.statusInjected);

          const translatedCues = cues.map((cue, idx) => {
            let finalFormat = 'translated';
            if (exportMode === 'bilingual') {
              finalFormat = bilingualOrder === 'translationFirst' ? 'translation_above' : 'translation_below';
            }
            return {
              ...cue,
              text: formatSubtitleText(cue.originalText || cue.text, res.translatedTexts[idx], finalFormat)
            };
          });

          const exportData = generateSubtitleExport(translatedCues, formatPref, ext === 'ass' ? assFile : undefined);
          
          const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
          setTranslatedFileName(`${baseName}_${targetLang}.${exportData.ext}`);
          setTranslatedContent(exportData.text);

          // Inject as VTT
          const vttText = buildVtt(translatedCues);
          injectIntoPlayer(vttText, `${baseName}_${targetLang}.vtt`);

          // Clear background state so it won't flash 100% on next popup open
          chrome.runtime.sendMessage({ action: "clearTranslationState" }).catch(() => {});
        } else {
          showError(res?.error || "Unknown");
        }
        setTranslating(false);
        setActiveTranslationType(null);
      });
    } catch (err: any) {
      message.error(err.message);
      setTranslating(false);
    }
  };

  const handleInjectOnly = async () => {
    if (!selectedFile) return;
    try {
      const text = await selectedFile.text();
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'srt';
      let cues: SubtitleCue[] = [];

      if (ext === 'vtt' || text.trim().startsWith('WEBVTT')) cues = parseVtt(text);
      else if (ext === 'ass') cues = parseAss(text).cues;
      else if (ext === 'lrc') cues = parseLrc(text);
      else cues = parseSrt(text);

      if (cues.length === 0) throw new Error("No subtitle cues detected.");

      const vttText = buildVtt(cues);
      const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
      injectIntoPlayer(vttText, `${baseName}.vtt`);
      message.success(loc.statusInjectedOnly);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const showError = (err: string) => {
    // Extract just the main message from verbose Gemini API errors
    try {
      const jsonMatch = err.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const msg = parsed.error?.message?.split('\n')[0] || err;
        message.error(msg, 6);
        return;
      }
    } catch (_) {}
    message.error(err.length > 120 ? err.substring(0, 120) + '...' : err, 6);
  };

  const handleAutoTranslate = () => {
    if (!detectedSubUrl) return;
    setTranslating(true);
    setProgress(0);
    setProgressStatus(loc.statusTranslating);
    setTranslatedContent(null);
    setTranslatedFileName(null);

    // Save config to storage first, then trigger auto-translate
    chrome.storage.local.set({ userConfig: config }).then(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) return;

        let finalFormat = 'translated';
        if (exportMode === 'bilingual') {
          finalFormat = bilingualOrder === 'translationFirst' ? 'translation_above' : 'translation_below';
        }
        
        chrome.tabs.sendMessage(activeTab.id, {
          action: "autoTranslateAndInject",
          targetLanguage: targetLang,
          sourceLanguage: sourceLang,
          displayFormat: finalFormat,
          exportFormat: formatPref
        }, (res) => {
          if (res && res.success) {
            setProgress(100);
            setProgressStatus(loc.statusInjected);
            setTranslatedContent(res.text);
            setTranslatedFileName(res.fileName);
            message.success(loc.statusInjected);
            // Clear background state so it won't flash 100% on next popup open
            chrome.runtime.sendMessage({ action: "clearTranslationState" }).catch(() => {});
          } else {
            showError(res?.error || "Unknown error");
          }
          setTranslating(false);
          setActiveTranslationType(null);
        });
      });
    });
  };

  const handleAutoTranslateManga = () => {
    if (!detectedManga) return;
    setActiveTranslationType('manga');
    setTranslating(true);
    setProgress(0);
    setProgressStatus(loc.mangaTranslatingStatus);
    setTranslatedContent(null);
    setTranslatedFileName(null);

    const trimmedUrl = normalizeServerUrl(mangaServerUrl);

    chrome.storage.local.set({ userConfig: config, mangaServerUrl: trimmedUrl }).then(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) return;

        chrome.tabs.sendMessage(activeTab.id, {
          action: "translateManga",
          config,
          mangaServerUrl: trimmedUrl,
          targetLanguage: targetLang,
        }, (res) => {
          if (chrome.runtime.lastError || !res?.success) {
            message.error(res?.error || "Failed to start manga translation.");
            setTranslating(false);
            setActiveTranslationType(null);
            return;
          }
          const sIndex = res.startIndex !== undefined ? res.startIndex + 1 : 1;
          const eIndex = res.totalImages !== undefined ? sIndex + res.totalImages - 1 : 1;
          setProgressStatus(`${loc.mangaTranslatingStatus} [Page ${sIndex}-${eIndex}] (0/${res.totalImages})`);
        });
      });
    });
  };

  const injectIntoPlayer = (vttText: string, fileName: string) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;
      chrome.tabs.sendMessage(activeTab.id, {
        action: "injectSubtitles",
        content: vttText,
        fileName,
        targetLanguage: targetLang
      });
    });
  };

  const downloadTranslated = () => {
    if (!translatedContent || !translatedFileName) return;
    const blob = new Blob([translatedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = translatedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTestConnection = () => {
    if (!config.apiKey) {
      message.error("Please enter your API Key first.");
      return;
    }
    setTestingConnection(true);
    chrome.runtime.sendMessage({
      action: "translateSubtitles",
      cues: [{ id: "1", startTime: "00:00:01.000", endTime: "00:00:03.000", text: "Hello", originalText: "Hello" }],
      targetLanguage: "km",
      sourceLanguage: "en",
      config: { ...config, useCache: false },
      isTestConnection: true
    }, (res) => {
      setTestingConnection(false);
      if (res?.success && res.translatedTexts?.[0]) message.success(loc.statusTestSuccess);
      else message.error(loc.statusTestFail + " " + (res?.error || ""));
    });
  };

  const handleTestServer = async () => {
    const trimmedUrl = normalizeServerUrl(mangaServerUrl);
    if (!trimmedUrl) {
      message.error("Please enter your Server URL first.");
      return;
    }
    setTestingServer(true);
    try {
      const res = await fetch(`${trimmedUrl}/health`);
      if (res.ok) {
        message.success(loc.statusTestSuccess);
      } else {
        message.error(`${loc.statusTestFail} Status: ${res.status}`);
      }
    } catch (e: any) {
      message.error(`${loc.statusTestFail} ${e.message || "Cannot connect to server."}`);
    } finally {
      setTestingServer(false);
    }
  };

  const handleClearCache = () => {
    setClearingCache(true);
    chrome.runtime.sendMessage({ action: "clearCache" }, (res) => {
      setClearingCache(false);
      if (res?.success) message.success(loc.cacheCleared);
      else message.error(loc.statusError + res?.error);
    });
  };

  const handleResetConfig = () => {
    setConfig(prev => ({
      ...DEFAULT_GEMINI_CONFIG,
      apiKey: prev.apiKey
    }));
    setExportMode('translatedOnly');
    setBilingualOrder('translationFirst');
    setFormatPref('vtt');
    message.success(loc.settingsReset);
  };

  const updateConfig = (key: keyof GeminiConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const appTheme = {
    algorithm: theme.darkAlgorithm,
    token: {
      fontFamily: "'Kantumruy Pro', sans-serif",
      colorPrimary: '#E54D2E',
      colorBgBase: '#0E0F12',
      colorBgContainer: '#16181D',
      colorBgElevated: '#1B1E24',
      colorTextBase: '#F2EEE6',
      colorBorder: 'rgba(245, 240, 230, 0.10)'
    },
    components: {
      Segmented: {
        itemSelectedBg: 'rgba(229, 77, 46, 0.10)',
        itemSelectedColor: '#E54D2E',
        trackBg: 'transparent',
        itemHoverBg: 'transparent'
      }
    }
  };

  return (
    <ConfigProvider theme={appTheme}>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0E0F12' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <img src="icons/icon32.png" alt="khtranslator Logo" style={{ width: 20, height: 20, marginRight: 6, borderRadius: 4 }} />
            khtranslator
          </Title>
          <Select value={uiLanguage} onChange={(val) => {
            setUiLanguage(val);
            chrome.storage.local.set({ uiLanguage: val });
          }} style={{ width: 110 }}>
            <Select.Option value="km">ភាសាខ្មែរ</Select.Option>
            <Select.Option value="en">English</Select.Option>
            <Select.Option value="zh">简体中文</Select.Option>
          </Select>
        </div>

        <Tabs defaultActiveKey="1" style={{ flex: 1, overflow: 'hidden' }}>
          
          {/* Inject Tab */}
          <Tabs.TabPane tab={loc.tabInject} key="1" style={{ overflowY: 'auto', maxHeight: 415, paddingRight: 8 }}>
            <div style={{ paddingBottom: 32 }}>
              {detectedManga ? (
                <Card size="small" style={{ marginBottom: 16, backgroundColor: 'rgba(107, 142, 90, 0.1)', borderColor: '#6B8E5A' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircleOutlined style={{ color: '#6B8E5A' }} />
                    <Text strong style={{ color: '#6B8E5A' }}>{loc.detectedMangaSuccess}</Text>
                  </div>
                  <div style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Text type="secondary" style={{ display: 'block' }}><strong>{loc.mangaTitleLabel}</strong> {detectedManga.mangaTitle}</Text>
                    <Text type="secondary" style={{ display: 'block' }}><strong>{loc.mangaChapterLabel}</strong> {detectedManga.mangaChapter}</Text>
                    <Text type="secondary" style={{ display: 'block' }}><strong>{loc.mangaPagesLabel}</strong> {detectedManga.mangaImagesCount} {detectedManga.mangaPagesRange && `[Page ${detectedManga.mangaPagesRange}]`}</Text>
                  </div>
                  <Button 
                    type="primary" 
                    block 
                    onClick={handleAutoTranslateManga} 
                    disabled={!config.apiKey || translating}
                  >
                    {translating && activeTranslationType === 'manga' ? "Translating..." : loc.btnAutoTranslateManga}
                  </Button>
                </Card>
              ) : (
                <Card size="small" style={{ marginBottom: 16, backgroundColor: detectedSubUrl ? 'rgba(107, 142, 90, 0.1)' : undefined, borderColor: detectedSubUrl ? '#6B8E5A' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {detectedSubUrl ? <CheckCircleOutlined style={{ color: '#6B8E5A' }} /> : <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#faad14' }} />}
                    <Text strong style={{ color: detectedSubUrl ? '#6B8E5A' : undefined }}>{detectedSubUrl ? loc.detectedSuccess : loc.detecting}</Text>
                  </div>
                  <Text type="secondary" style={{ display: 'block', margin: '8px 0' }}>{detectedSubUrl ? detectedTitle : loc.detectDesc}</Text>
                  <Button type="primary" block disabled={!detectedSubUrl || translating} onClick={handleAutoTranslate}>
                    {loc.btnAutoTranslate}
                  </Button>
                </Card>
              )}

            <Divider plain>{loc.orManualUpload}</Divider>

            <Tooltip title={detectedManga ? loc.mangaUploadDisabledTooltip : ""}>
              <div style={{ opacity: detectedManga ? 0.35 : 1, pointerEvents: detectedManga ? 'none' : 'auto' }}>
                <Dragger 
                  accept=".srt,.vtt,.ass,.lrc"
                  showUploadList={false}
                  disabled={!!detectedManga}
                  beforeUpload={(file) => {
                    if (detectedManga) return false;
                    setSelectedFile(file);
                    return false;
                  }}
                  style={{ marginBottom: 12, cursor: detectedManga ? 'not-allowed' : 'pointer' }}
                  height={64}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <InboxOutlined style={{ fontSize: '20px', color: '#E54D2E' }} />
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px', display: 'inline-block' }}>
                      {selectedFile ? selectedFile.name : (detectedManga ? loc.mangaUploadDisabled : loc.dragDropText)}
                    </span>
                  </div>
                </Dragger>
              </div>
            </Tooltip>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <Text>{loc.sourceLang}:</Text>
                <Select value={sourceLang} onChange={setSourceLang} style={{ width: '100%' }}>
                  {languagesList.map(l => (
                    <Select.Option key={l.value} value={l.value}>
                      {loc.languages[l.value] ? `${loc.languages[l.value]} (${l.nativelabel})` : l.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              <div style={{ flex: 1 }}>
                <Text>{loc.targetLang}:</Text>
                <Select value={targetLang} onChange={setTargetLang} style={{ width: '100%' }}>
                  {languagesList.filter(l => l.value !== 'auto').map(l => (
                    <Select.Option key={l.value} value={l.value}>
                      {loc.languages[l.value] ? `${loc.languages[l.value]} (${l.nativelabel})` : l.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, opacity: detectedManga ? 0.35 : 1, pointerEvents: detectedManga ? 'none' : 'auto' }}>
              <Button type="primary" style={{ flex: 1 }} disabled={!selectedFile || translating || !!detectedManga} onClick={handleManualInject}>
                {loc.btnTranslateInject}
              </Button>
              <Button style={{ flex: 1 }} disabled={!selectedFile || translating || !!detectedManga} onClick={handleInjectOnly}>
                {loc.btnInjectOnly}
              </Button>
            </div>

            {translating && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Progress percent={progress} status={progress === 100 ? "success" : "active"} strokeColor="#E54D2E" />
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Text>{progressStatus}</Text>
                  {progress < 100 && (
                    <Button size="small" danger onClick={handleCancel}>
                      {loc.btnCancel}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {translatedContent && (
              <Button type="primary" block onClick={downloadTranslated}>
                {loc.btnSave}
              </Button>
            )}
            </div>
          </Tabs.TabPane>

          {/* Settings Tab */}
          <Tabs.TabPane tab={loc.tabSettings} key="2" style={{ overflowY: 'auto', maxHeight: 415, paddingRight: 8 }}>
            <Space direction="vertical" style={{ width: '100%', paddingBottom: 32 }} size="middle">
              <div>
                <Text><SettingOutlined /> Translation API</Text>
              </div>
              <div>
                <Text>{loc.apiKeyLabel}</Text>
                <Input.Password value={config.apiKey} onChange={e => updateConfig('apiKey', e.target.value)} placeholder={loc.apiKeyPlaceholder} />
              </div>
              <div>
                <Text>{loc.modelLabel}</Text>
                <AutoComplete
                  value={config.model}
                  onChange={val => updateConfig('model', val)}
                  style={{ width: '100%' }}
                  options={[
                    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
                    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
                    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
                  ]}
                  placeholder="Enter model name or select"
                />
              </div>
              
              <Button onClick={handleTestConnection} loading={testingConnection} icon={<ApiOutlined />} block style={{ marginTop: 6 }}>{loc.btnTestConnection}</Button>
              <div>
                <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  {loc.delayLabel}
                  <Tooltip title={loc.delayTooltip}>
                    <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                  </Tooltip>
                </Text>
                <InputNumber value={config.delayTime} onChange={val => updateConfig('delayTime', val)} style={{ width: '100%' }} />
              </div>

              <Divider plain style={{ margin: '12px 0' }}>{loc.animeSettingsLabel}</Divider>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    {loc.concurrencyLabel}
                    <Tooltip title={loc.concurrencyTooltip}>
                      <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                    </Tooltip>
                  </Text>
                  <InputNumber value={config.contextBatchSize} onChange={val => updateConfig('contextBatchSize', val)} style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    {loc.contextWindowLabel}
                    <Tooltip title={loc.contextTooltip}>
                      <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                    </Tooltip>
                  </Text>
                  <InputNumber value={config.contextWindow} onChange={val => updateConfig('contextWindow', val)} style={{ width: '100%' }} />
                </div>
              </div>

              <Divider plain style={{ margin: '12px 0' }}>{loc.mangaSettingsLabel}</Divider>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    {loc.mangaConcurrencyLabel}
                    <Tooltip title={loc.mangaConcurrencyTooltip}>
                      <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                    </Tooltip>
                  </Text>
                  <InputNumber value={config.mangaConcurrency} onChange={val => updateConfig('mangaConcurrency', val || 3)} style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    {loc.mangaLimitLabel}
                    <Tooltip title={loc.mangaLimitTooltip}>
                      <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                    </Tooltip>
                  </Text>
                  <InputNumber min={0} value={config.mangaLimit} onChange={val => updateConfig('mangaLimit', val ?? 0)} placeholder="0 (unlimited)" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  {loc.mangaTranslateModelLabel}
                  <Tooltip title={loc.mangaTranslateModelTooltip}>
                    <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                  </Tooltip>
                </Text>
                <AutoComplete
                  value={config.mangaTranslateModel || "gemini-3.5-flash"}
                  onChange={val => updateConfig('mangaTranslateModel', val)}
                  style={{ width: '100%' }}
                  options={[
                    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (Recommended)" },
                    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
                    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
                  ]}
                  placeholder="Enter model name or select"
                />
              </div>

              {config.mangaTranslationMode === 'normal' && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4, flexShrink: 0 }}>
                      {loc.mangaServerUrlLabel}
                      <Tooltip title={loc.mangaServerUrlTooltip}>
                        <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                      </Tooltip>
                    </Text>
                    <Input value={mangaServerUrl} onChange={e => setMangaServerUrl(e.target.value)} onBlur={() => setMangaServerUrl(mangaServerUrl.trim())} style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 0 110px' }}>
                    <Button onClick={handleTestServer} loading={testingServer} icon={<ApiOutlined />} block>
                      {loc.btnTestServer}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <Text>{loc.mangaTranslationModeLabel}</Text>
                <div style={{ padding: 8, marginTop: 8, border: '1px solid rgba(245, 240, 230, 0.10)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Segmented
                    block
                    size="small"
                    value={config.mangaTranslationMode || 'normal'}
                    onChange={(val) => updateConfig('mangaTranslationMode', val as 'normal' | 'fast')}
                    options={[
                      { label: loc.mangaModeNormal, value: 'normal' },
                      { label: loc.mangaModeFast, value: 'fast' }
                    ]}
                  />
                  <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)', padding: '0 4px' }}>
                    {config.mangaTranslationMode === 'fast' ? loc.mangaModeFastDesc : loc.mangaModeNormalDesc}
                  </div>
                </div>
              </div>
            </Space>
          </Tabs.TabPane>

          {/* Prompts Tab */}
          <Tabs.TabPane tab={loc.tabPrompts} key="3" style={{ overflowY: 'auto', maxHeight: 415, paddingRight: 8 }}>
            <Space direction="vertical" style={{ width: '100%', paddingBottom: 32 }} size="middle">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <Switch checked={config.isMature} onChange={val => updateConfig('isMature', val)} />
                <Text strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {loc.isMatureLabel}
                  <Tooltip title={loc.matureTooltip}>
                    <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)', cursor: 'help', fontSize: 12 }} />
                  </Tooltip>
                </Text>
              </div>
              <div>
                <Text>{loc.systemPromptLabel}</Text>
                <TextArea rows={5} value={config.systemPrompt} onChange={e => updateConfig('systemPrompt', e.target.value)} />
              </div>
              <div>
                <Text>{loc.userPromptLabel}</Text>
                <TextArea rows={5} value={config.userPrompt} onChange={e => updateConfig('userPrompt', e.target.value)} />
              </div>
            </Space>
          </Tabs.TabPane>

          {/* Advanced Tab */}
          <Tabs.TabPane tab={loc.tabAdvanced} key="4" style={{ overflowY: 'auto', maxHeight: 415, paddingRight: 8 }}>
            <Space direction="vertical" style={{ width: '100%', paddingBottom: 32 }} size="middle">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch checked={config.useCache} onChange={val => updateConfig('useCache', val)} />
                <Text>{loc.cacheToggle}</Text>
              </div>
              
                <Text><FileTextOutlined /> {loc.formatPrefLabel}</Text>
                
                <div style={{ padding: 8, marginTop: 8, border: '1px solid rgba(245, 240, 230, 0.10)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Segmented
                    block
                    size="small"
                    value={formatPref}
                    onChange={setFormatPref}
                    options={[
                      { label: 'VTT', value: 'vtt' },
                      { label: 'SRT', value: 'srt' },
                      { label: 'LRC', value: 'lrc' },
                      { label: 'ASS', value: 'ass' }
                    ]}
                  />

                  <Segmented
                    block
                    size="small"
                    value={exportMode}
                    onChange={(val) => setExportMode(val as 'translatedOnly' | 'bilingual')}
                    options={[
                      { label: loc.translatedOnly, value: 'translatedOnly' },
                      { label: loc.bilingual, value: 'bilingual' }
                    ]}
                  />

                  {exportMode === 'bilingual' && (
                    <Segmented
                      block
                      size="small"
                      value={bilingualOrder}
                      onChange={(val) => setBilingualOrder(val as 'translationFirst' | 'originalFirst')}
                      options={[
                        { label: loc.translationAbove, value: 'translationFirst' },
                        { label: loc.translationBelow, value: 'originalFirst' }
                      ]}
                    />
                  )}
                </div>

              <Button danger block onClick={handleClearCache} loading={clearingCache} style={{ marginTop: 24 }}>
                {loc.btnClearCache}
              </Button>
              <Button block onClick={handleResetConfig} style={{ marginTop: 12 }}>
                {loc.btnReset}
              </Button>
            </Space>
          </Tabs.TabPane>

        </Tabs>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(245, 240, 230, 0.10)' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>v{chrome.runtime.getManifest().version}</Text>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Space size="small" style={{ fontSize: 10 }}>
              <a href="https://anistream.one" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>Anistream</a>
              <Text type="secondary" style={{ fontSize: 9, opacity: 0.3 }}>|</Text>
              <a href="https://khanime.co" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>Khanime</a>
              <Text type="secondary" style={{ fontSize: 9, opacity: 0.3 }}>|</Text>
              <a href="https://khfullhd.co" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>KHFullHD</a>
            </Space>
            <Space size="small" style={{ fontSize: 10 }}>
              <a href="https://mangakatana.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>MangaKatana</a>
              <Text type="secondary" style={{ fontSize: 9, opacity: 0.3 }}>|</Text>
              <a href="https://comix.to/" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>Comix.to</a>
              <Text type="secondary" style={{ fontSize: 9, opacity: 0.3 }}>|</Text>
              <a href="https://mangaplus.shueisha.co.jp/" target="_blank" rel="noopener noreferrer" style={{ color: '#E54D2E' }}>MangaPlus</a>
            </Space>
          </div>

          <Space size="middle">
            <span onClick={() => chrome.tabs.create({ url: 'guide.html' })} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <QuestionCircleOutlined style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }} />
            </span>
            <a href="https://khdownloader.xyz" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center' }}>
              <GlobalOutlined style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }} />
            </a>
            <a href="https://github.com/chheunphannet/kh-subtitle-translator" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center' }}>
              <GithubOutlined style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }} />
            </a>
            <a href="https://t.me/ifitworkitwork" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center' }}>
              <SendOutlined style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }} />
            </a>
          </Space>
        </div>
      </div>
    </ConfigProvider>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
