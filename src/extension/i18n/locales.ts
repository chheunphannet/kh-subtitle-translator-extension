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
  statusSelected: string;
  statusTranslating: string;
  statusInjected: string;
  statusError: string;
  statusEmpty: string;

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

  systemPromptLabel: string;
  userPromptLabel: string;

  cacheToggle: string;
  btnClearCache: string;
  cacheCleared: string;
  formatPrefLabel: string;
}

export const locales: Record<string, LocaleStrings> = {
  km: {
    tabInject: "បញ្ចូល Subtitle",
    tabSettings: "ការកំណត់ AI",
    tabPrompts: "LLM Prompts",
    tabAdvanced: "កម្រិតខ្ពស់",
    
    dragDropText: "អូស & ទម្លាក់ file Subtitle ទីនេះ",
    orSelectText: "ឬ ចុចដើម្បីជ្រើសរើស file",
    sourceLang: "ភាសាដើម៖",
    targetLang: "ភាសាបកប្រែ៖",
    btnInject: "បកប្រែ & បញ្ចូល",
    btnSave: "ទាញយក Subtitle បកប្រែរួច",
    statusSelected: "បានជ្រើសរើស៖",
    statusTranslating: "កំពុងបកប្រែ... ",
    statusInjected: "បានបញ្ចូល Subtitle ដោយជោគជ័យ!",
    statusError: "មានកំហុស៖ ",
    statusEmpty: "សូមជ្រើសរើស file ជាមុនសិន។",

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

    systemPromptLabel: "Global System Prompt",
    userPromptLabel: "User Prompt",

    cacheToggle: "ប្រើប្រាស់ការចងចាំ (Enable Cache)",
    btnClearCache: "សម្អាត Cache",
    cacheCleared: "បានសម្អាត Cache រួចរាល់!",
    formatPrefLabel: "ទម្រង់ Subtitle",
  },
  en: {
    tabInject: "Inject Subtitles",
    tabSettings: "AI Settings",
    tabPrompts: "LLM Prompts",
    tabAdvanced: "Advanced",
    
    dragDropText: "Drag & drop subtitle file here",
    orSelectText: "or click to select file",
    sourceLang: "Source Lang:",
    targetLang: "Target Lang:",
    btnInject: "Translate & Inject",
    btnSave: "Download Translated",
    statusSelected: "Selected:",
    statusTranslating: "Translating... ",
    statusInjected: "Subtitles injected successfully!",
    statusError: "Error: ",
    statusEmpty: "Please select a file first.",

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

    systemPromptLabel: "Global System Prompt",
    userPromptLabel: "User Prompt",

    cacheToggle: "Enable Caching",
    btnClearCache: "Clear Cache",
    cacheCleared: "Cache cleared successfully!",
    formatPrefLabel: "Subtitle Format",
  },
  zh: {
    tabInject: "字幕注入",
    tabSettings: "AI 设置",
    tabPrompts: "LLM 提示词",
    tabAdvanced: "高级设置",
    
    dragDropText: "拖拽字幕文件到此处",
    orSelectText: "或 点击选择文件",
    sourceLang: "源语言：",
    targetLang: "目标语言：",
    btnInject: "翻译并注入",
    btnSave: "下载已翻译字幕",
    statusSelected: "已选择：",
    statusTranslating: "正在翻译... ",
    statusInjected: "字幕注入成功！",
    statusError: "错误：",
    statusEmpty: "请先选择一个文件。",

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

    systemPromptLabel: "全局系统提示词 (System Prompt)",
    userPromptLabel: "用户提示词 (User Prompt)",

    cacheToggle: "启用本地缓存",
    btnClearCache: "清除缓存",
    cacheCleared: "缓存已清除！",
    formatPrefLabel: "字幕格式",
  }
};
