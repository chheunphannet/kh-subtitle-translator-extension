export interface LocaleStrings {
  tabInject: string;
  tabSettings: string;
  tabPrompts: string;
  tabAdvanced: string;
  
  dragDropText: string;
  orSelectText: string;
  sourceLang: string;
  targetLang: string;
  btnInject: string;
  btnSave: string;
  btnCancel: string;
  statusSelected: string;
  statusTranslating: string;
  statusInjected: string;
  statusInjectedOnly: string;
  statusError: string;
  statusEmpty: string;

  detectedSuccess: string;
  detecting: string;
  detectDesc: string;
  btnAutoTranslate: string;
  orManualUpload: string;
  btnTranslateInject: string;
  btnInjectOnly: string;

  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  modelLabel: string;
  btnTestConnection: string;
  statusTesting: string;
  statusTestSuccess: string;
  statusTestFail: string;

  contextToggle: string;
  contextWindowLabel: string;
  concurrencyLabel: string;
  delayLabel: string;
  isMatureLabel: string;

  systemPromptLabel: string;
  userPromptLabel: string;

  cacheToggle: string;
  btnClearCache: string;
  cacheCleared: string;
  formatPrefLabel: string;
  
  transModeLabel: string;
  translatedOnly: string;
  bilingual: string;
  bilingualOrderLabel: string;
  translationAbove: string;
  translationBelow: string;
  btnReset: string;
  settingsReset: string;
  contextTooltip: string;
  concurrencyTooltip: string;
  delayTooltip: string;
  matureTooltip: string;
  keyMissing: string;
  keyConfigured: string;
  supportedSitesLabel: string;

  languages: Record<string, string>;
}

export const locales: Record<string, LocaleStrings> = {
  km: {
    tabInject: "បញ្ចូល Subtitle",
    tabSettings: "ការកំណត់ AI",
    tabPrompts: "LLM Prompts",
    tabAdvanced: "កម្រិតខ្ពស់",
    
    dragDropText: "អូស & ទម្លាក់ file Subtitle ទីនេះ",
    orSelectText: "ឬ ចុចដើម្បីជ្រើសរើស file",
    sourceLang: "ភាសាដើម",
    targetLang: "ភាសាបកប្រែ",
    btnInject: "បកប្រែ & បញ្ចូល",
    btnSave: "ទាញយក Subtitle បកប្រែរួច",
    btnCancel: "បោះបង់",
    statusSelected: "បានជ្រើសរើស៖",
    statusTranslating: "កំពុងបកប្រែ... ",
    statusInjected: "បានបញ្ចូល Subtitle ដោយជោគជ័យ!",
    statusInjectedOnly: "បានបញ្ចូល Subtitle ជោគជ័យ!",
    statusError: "មានកំហុស៖ ",
    statusEmpty: "សូមជ្រើសរើស file ជាមុនសិន។",

    detectedSuccess: "បានរកឃើញ Subtitle ភាសាអង់គ្លេស!",
    detecting: "កំពុងស្វែងរក Player...",
    detectDesc: "មិនទាន់រកឃើញ Player វីដេអូ ឬ Subtitle ភាសាអង់គ្លេសនៅលើទំព័រនេះទេ។ អ្នកអាចបញ្ចូល file Subtitle ដោយផ្ទាល់ខាងក្រោម។",
    btnAutoTranslate: "បកប្រែ & បញ្ចូលដោយស្វ័យប្រវត្ត",
    orManualUpload: "ឬ បញ្ចូលដោយខ្លួនឯង",
    btnTranslateInject: "បកប្រែ & បញ្ចូល",
    btnInjectOnly: "បញ្ចូលតែប៉ុណ្ណោះ",

    apiKeyLabel: "Gemini API Key",
    apiKeyPlaceholder: "បញ្ចូល Gemini API Key របស់អ្នក",
    modelLabel: "ជ្រើសរើស Model",
    btnTestConnection: "តេស្តការតភ្ជាប់",
    statusTesting: "កំពុងតេស្ត...",
    statusTestSuccess: "ការតភ្ជាប់ជោគជ័យ!",
    statusTestFail: "ការតភ្ជាប់បរាជ័យ!",

    contextToggle: "បកប្រែតាមបរិបទ (Context-Aware)",
    contextWindowLabel: "ចំនួនបន្ទាត់បរិបទ (Context Lines)",
    concurrencyLabel: "ចំនួនបកប្រែទន្ទឹមគ្នា (Concurrency)",
    delayLabel: "ពន្យារពេល (Delay - ms)",
    isMatureLabel: "មាតិកា 18+ (បកប្រែពាក្យអសុរស/ហិង្សាដោយមិនបិទបាំង)",

    systemPromptLabel: "Global System Prompt",
    userPromptLabel: "User Prompt",

    cacheToggle: "ប្រើប្រាស់ការចងចាំ (Enable Cache)",
    btnClearCache: "សម្អាត Cache",
    cacheCleared: "បានសម្អាត Cache រួចរាល់!",
    formatPrefLabel: "ទម្រង់ Subtitle",
    
    transModeLabel: "របៀបបកប្រែ",
    translatedOnly: "បកប្រែតែប៉ុណ្ណោះ",
    bilingual: "ទ្វេភាសា",
    bilingualOrderLabel: "លំដាប់ទ្វេភាសា",
    translationAbove: "ការបកប្រែនៅខាងលើ",
    translationBelow: "ការបកប្រែនៅខាងក្រោម",
    btnReset: "កំណត់ឡើងវិញ",
    settingsReset: "បានកំណត់ការកំណត់ឡើងវិញជាលំនាំដើម!",
    contextTooltip: "បកប្រែដោយប្រើបរិបទនៃបន្ទាត់ជុំវិញ ដើម្បីបង្កើនភាពត្រឹមត្រូវ។",
    concurrencyTooltip: "ចំនួនសំណើដែលត្រូវផ្ញើទៅបកប្រែស្របគ្នា។ កាន់តែច្រើនកាន់តែលឿន ប៉ុន្តែអាចប៉ះពាល់ដល់ដែនកំណត់ល្បឿន API (Rate Limit)។",
    delayTooltip: "រយៈពេលពន្យារពេលរវាងសំណើនីមួយៗ (គិតជាមីលីវិនាទី)។ បង្កើនវាប្រសិនបើអ្នកជួបបញ្ហា Rate Limit (កំហុស 429)។",
    matureTooltip: "មិនបិទបាំងឬត្រងពាក្យពេចន៍ ដើម្បីបកប្រែពាក្យអសុរស ហិង្សា និងការសន្ទនាបែបមនុស្សពេញវ័យឱ្យចំន័យច្បាស់លាស់។",
    keyMissing: "គ្មាន API Key",
    keyConfigured: "មាន API Key",
    supportedSitesLabel: "គេហទំព័រដែលគាំទ្រ៖",

    languages: {
      auto: "ស្វ័យប្រវត្ត",
      km: "ខ្មែរ",
      en: "អង់គ្លេស",
      zh: "ចិនសាមញ្ញ",
      "zh-hant": "ចិនបុរាណ",
      ja: "ជប៉ុន",
      ko: "កូរ៉េ",
      th: "ថៃ",
      vi: "វៀតណាម",
      fr: "បារាំង",
      de: "អាល្លឺម៉ង់",
      es: "អេស្ប៉ាញ",
      ru: "រុស្ស៊ី"
    }
  },
  en: {
    tabInject: "Inject Subtitles",
    tabSettings: "AI Settings",
    tabPrompts: "LLM Prompts",
    tabAdvanced: "Advanced",
    
    dragDropText: "Drag & drop subtitle file here",
    orSelectText: "or click to select file",
    sourceLang: "Source Lang",
    targetLang: "Target Lang",
    btnInject: "Translate & Inject",
    btnSave: "Download Translated",
    btnCancel: "Cancel",
    statusSelected: "Selected:",
    statusTranslating: "Translating... ",
    statusInjected: "Subtitles injected successfully!",
    statusInjectedOnly: "Subtitles injected successfully!",
    statusError: "Error: ",
    statusEmpty: "Please select a file first.",

    detectedSuccess: "English Subtitles Detected!",
    detecting: "Searching for Player...",
    detectDesc: "No active video player with English subtitles detected on the current page. You can still manually upload subtitles below.",
    btnAutoTranslate: "Auto Translate & Inject",
    orManualUpload: "Or manual upload",
    btnTranslateInject: "Translate & Inject",
    btnInjectOnly: "Inject Only",

    apiKeyLabel: "Gemini API Key",
    apiKeyPlaceholder: "Enter your Gemini API key",
    modelLabel: "Select Model",
    btnTestConnection: "Test Connection",
    statusTesting: "Testing...",
    statusTestSuccess: "Connection successful!",
    statusTestFail: "Connection failed!",

    contextToggle: "Context-Aware Translation",
    contextWindowLabel: "Context Lines",
    concurrencyLabel: "Concurrency",
    delayLabel: "Delay (ms)",
    isMatureLabel: "18+ / Mature Content (translate profanity/violence uncensored)",

    systemPromptLabel: "Global System Prompt",
    userPromptLabel: "User Prompt",

    cacheToggle: "Enable Caching",
    btnClearCache: "Clear Cache",
    cacheCleared: "Cache cleared successfully!",
    formatPrefLabel: "Subtitle Format",

    transModeLabel: "Translation Mode",
    translatedOnly: "Translated",
    bilingual: "Bilingual",
    bilingualOrderLabel: "Bilingual Order",
    translationAbove: "Translation Above",
    translationBelow: "Translation Below",
    btnReset: "Reset to Defaults",
    settingsReset: "Settings reset to defaults!",
    contextTooltip: "Translate with context of surrounding lines for better accuracy.",
    concurrencyTooltip: "Number of requests sent in parallel. Higher is faster, but might trigger API rate limits.",
    delayTooltip: "Delay between requests in milliseconds. Increase this if you encounter rate limits (Error 429).",
    matureTooltip: "Bypasses AI filters to translate slang, violence, and mature dialog accurately without censoring.",
    keyMissing: "No API Key",
    keyConfigured: "API Key Configured",
    supportedSitesLabel: "Supported Streaming Sites:",

    languages: {
      auto: "Auto-Detect",
      km: "Khmer",
      en: "English",
      zh: "Simplified Chinese",
      "zh-hant": "Traditional Chinese",
      ja: "Japanese",
      ko: "Korean",
      th: "Thai",
      vi: "Vietnamese",
      fr: "French",
      de: "German",
      es: "Spanish",
      ru: "Russian"
    }
  },
  zh: {
    tabInject: "字幕注入",
    tabSettings: "AI 设置",
    tabPrompts: "LLM 提示词",
    tabAdvanced: "高级设置",
    
    dragDropText: "拖拽字幕文件到此处",
    orSelectText: "或 点击选择文件",
    sourceLang: "源语言",
    targetLang: "目标语言",
    btnInject: "翻译并注入",
    btnSave: "下载已翻译字幕",
    btnCancel: "取消",
    statusSelected: "已选择：",
    statusTranslating: "正在翻译... ",
    statusInjected: "字幕注入成功！",
    statusInjectedOnly: "字幕注入成功！",
    statusError: "错误：",
    statusEmpty: "请先选择一个文件。",

    detectedSuccess: "检测到英文字幕！",
    detecting: "正在搜索播放器...",
    detectDesc: "当前页面未检测到含有英文字幕的视频播放器。您仍可在下方手动上传字幕。",
    btnAutoTranslate: "自动翻译并注入",
    orManualUpload: "或手动上传",
    btnTranslateInject: "翻译并注入",
    btnInjectOnly: "仅注入",

    apiKeyLabel: "Gemini API Key",
    apiKeyPlaceholder: "请输入您的 Gemini API Key",
    modelLabel: "选择模型",
    btnTestConnection: "测试连接",
    statusTesting: "正在测试...",
    statusTestSuccess: "连接成功！",
    statusTestFail: "连接失败！",

    contextToggle: "上下文关联翻译",
    contextWindowLabel: "上下文行数",
    concurrencyLabel: "并发数",
    delayLabel: "延迟时间 (毫秒)",
    isMatureLabel: "18+ / 成人内容 (不加审查地翻译脏话和暴力)",

    systemPromptLabel: "全局系统提示词 (System Prompt)",
    userPromptLabel: "用户提示词 (User Prompt)",

    cacheToggle: "启用本地缓存",
    btnClearCache: "清除缓存",
    cacheCleared: "缓存已清除！",
    formatPrefLabel: "字幕格式",

    transModeLabel: "翻译模式",
    translatedOnly: "仅翻译",
    bilingual: "双语",
    bilingualOrderLabel: "双语顺序",
    translationAbove: "译文在上",
    translationBelow: "译文在下",
    btnReset: "重置为默认值",
    settingsReset: "已重置为默认设置！",
    contextTooltip: "使用周围行作为上下文进行翻译，以获得更好的连贯性和准确度。",
    concurrencyTooltip: "并行发送的请求数量。数值越高速度越快，但可能会触发 API 频率限制。",
    delayTooltip: "两次请求之间的延迟时间（毫秒）。如果遇到频率限制（429错误），请增大此数值。",
    matureTooltip: "绕过 AI 内容审查，准确翻译脏话、暴力和成人对白，不进行任何审查或过滤。",
    keyMissing: "未配置 Key",
    keyConfigured: "已配置 Key",
    supportedSitesLabel: "支持的流媒体网站：",

    languages: {
      auto: "自动检测",
      km: "高棉语",
      en: "英语",
      zh: "简体中文",
      "zh-hant": "繁体中文",
      ja: "日语",
      ko: "韩语",
      th: "泰语",
      vi: "越南语",
      fr: "法语",
      de: "德语",
      es: "西班牙语",
      ru: "俄语"
    }
  }
};
