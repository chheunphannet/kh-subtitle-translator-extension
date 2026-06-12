# KH-Subtitle-Translator Extension User Guide
## សៀវភៅណែនាំការប្រើប្រាស់ Extension / 插件使用指南

English | [ភាសាខ្មែរ](#ភាសាខ្មែរ) | [中文](#中文)

---

## English

### 1. How to Use the Extension
* **Auto Translate & Inject**:
  1. Open a supported streaming website and start playing a video.
  2. If the extension detects a video player and English subtitles, the green success status will show up.
  3. Click **Auto Translate & Inject**. The extension will translate the active subtitles on the page and inject them directly into the player.
* **Manual Upload**:
  1. Drag and drop your local subtitle file (`.srt`, `.vtt`, `.ass`, or `.lrc`) into the upload box.
  2. Select the **Source Lang** (e.g., English) and **Target Lang** (e.g., Khmer).
  3. Click **Translate & Inject** to translate the uploaded file and inject it into the page player, or click **Inject Only** to inject it without translating.
  4. Once translated, you can click **Download Translated** to save the translated file locally.

### 2. Supported Streaming Sites
The extension auto-detects video players on these sites:
* **Anistream** (`anistream.one`)
* **Khanime** (`khanime.co` / `stream.khanime.co`)
* **KHFullHD** (`khfullhd.com` / `stream.khfullhd.co`)

### 3. AI Settings Explained
* **Gemini API Key**: Your personal API key for Google Gemini. The translation is private and sent directly from your browser.
* **Select Model**: Choose between different Gemini models. `gemini-3.5-flash` is recommended for fast and affordable translations.
* **Context-Aware Translation**: When enabled, the extension sends surrounding subtitle lines to the AI model. This improves context, dialogue flow, and translation consistency.
* **Concurrency**: The number of parallel translation requests sent to the AI. A higher number translates faster but is more likely to hit Gemini API rate limits.
* **Delay (ms)**: Time to wait between requests. Increase this if you experience translation rate limit errors (Error 429).
* **18+ / Mature Content**: Bypasses AI safety filters to accurately translate swearing, adult dialogue, or violence without censoring.
* **Enable Caching**: Stores translated subtitle lines locally. If you re-translate the same file or play it again, it retrieves the translation instantly from the cache without calling the Gemini API again.
* **Reset to Defaults**: Reverts settings back to defaults while preserving your API Key.

---

## ភាសាខ្មែរ

### ១. របៀបប្រើប្រាស់ Extension
* **បកប្រែ & បញ្ចូលដោយស្វ័យប្រវត្ត (Auto Translate & Inject)**:
  1. បើកគេហទំព័រវីដេអូដែលគាំទ្រ រួចចាក់វីដេអូនោះ។
  2. ប្រសិនបើ Extension រកឃើញ Player វីដេអូ និង Subtitle ភាសាអង់គ្លេស វានឹងបង្ហាញពណ៌បៃតងបញ្ជាក់ការរកឃើញ។
  3. ចុចប៊ូតុង **បកប្រែ & បញ្ចូលដោយស្វ័យប្រវត្ត**។ Extension នឹងបកប្រែ Subtitle ហើយបញ្ចូលទៅក្នុង Player ភ្លាមៗ។
* **បញ្ចូលដោយខ្លួនឯង (Manual Upload)**:
  1. អូសនិងទម្លាក់ file Subtitle របស់អ្នក (`.srt`, `.vtt`, `.ass` ឬ `.lrc`) ចូលក្នុងប្រអប់ផ្ទុក file។
  2. ជ្រើសរើស **ភាសាដើម** (ឧទាហរណ៍៖ អង់គ្លេស) និង **ភាសាបកប្រែ** (ឧទាហរណ៍៖ ខ្មែរ)។
  3. ចុច **បកប្រែ & បញ្ចូល** ដើម្បីបកប្រែរួចបញ្ចូល ឬ ចុច **បញ្ចូលតែប៉ុណ្ណោះ** ដើម្បីបញ្ចូលភ្លាមៗដោយមិនបាច់បកប្រែ។
  4. ក្រោយពេលបកប្រែរួច អ្នកអាចចុច **ទាញយក Subtitle បកប្រែរួច** ដើម្បីរក្សាទុកក្នុងកុំព្យូទ័ររបស់អ្នក។

### ២. គេហទំព័រគាំទ្រការបញ្ចូល Subtitle
Extension នេះអាចស្វែងរក Player វីដេអូដោយស្វ័យប្រវត្តនៅលើគេហទំព័រទាំងនេះ៖
* **Anistream** (`anistream.one`)
* **Khanime** (`khanime.co` / `stream.khanime.co`)
* **KHFullHD** (`khfullhd.com` / `stream.khfullhd.co`)

### ៣. ការពន្យល់អំពីការកំណត់ AI Settings
* **Gemini API Key**: API Key ផ្ទាល់ខ្លួនរបស់អ្នកសម្រាប់ប្រើប្រាស់ Google Gemini។ ទិន្នន័យបកប្រែមានសុវត្ថិភាពខ្ពស់ និងផ្ញើចេញពីកម្មវិធីរុករករបស់អ្នកផ្ទាល់។
* **ជ្រើសរើស Model**: ជ្រើសរើសម៉ូដែល AI ផ្សេងៗ។ ម៉ូដែល `gemini-3.5-flash` ត្រូវបានណែនាំសម្រាប់ការបកប្រែរហ័ស និងសន្សំសំចៃ។
* **បកប្រែតាមបរិបទ (Context-Aware)**: បើកមុខងារនេះដើម្បីផ្ញើបន្ទាត់ Subtitle ជុំវិញទៅកាន់ AI។ វានឹងជួយបង្កើនភាពត្រឹមត្រូវ សាច់រឿងបន្តគ្នាបានល្អ និងសមស្របតាមការសន្ទនា។
* **ចំនួនបកប្រែទន្ទឹមគ្នា (Concurrency)**: ចំនួនសំណើបកប្រែដែលផ្ញើស្របគ្នា។ កាន់តែច្រើនបកប្រែកាន់តែលឿន ប៉ុន្តែអាចប៉ះពាល់ដល់ដែនកំណត់ល្បឿន API (Rate Limit)។
* **ពន្យារពេល (Delay)**: រយៈពេលរង់ចាំរវាងសំណើនីមួយៗ។ បង្កើនវាប្រសិនបើអ្នកជួបបញ្ហាកំហុស Rate Limit (Error 429)។
* **មាតិកា 18+ (Mature Content)**: រំលងការត្រងសុវត្ថិភាពរបស់ AI ដើម្បីបកប្រែពាក្យអសុរស ហិង្សា និងការសន្ទនាបែបមនុស្សពេញវ័យឱ្យចំអត្ថន័យពិតប្រាកដ។
* **ប្រើប្រាស់ការចងចាំ (Enable Cache)**: រក្សាទុកពាក្យបកប្រែក្នុងកម្មវិធីរុករក។ ប្រសិនបើអ្នកបកប្រែ file ដដែលឡើងវិញ វានឹងទាញទិន្នន័យពី Cache ភ្លាមៗដោយមិនចាំបាច់ហៅទៅ API Key ម្តងទៀតឡើយ។
* **កំណត់ឡើងវិញ (Reset to Defaults)**: កំណត់រាល់ការកំណត់ AI មកជាលំនាំដើមវិញ ដោយរក្សាទុក Gemini API Key របស់អ្នកដដែល។

---

## 中文

### 1. 插件使用说明
* **自动翻译并注入 (Auto Translate & Inject)**:
  1. 打开支持的视频播放网页并播放视频。
  2. 如果插件成功检测到视频播放器和英文字幕，顶部将显示绿色成功状态。
  3. 点击 **自动翻译并注入**，插件将自动抓取当前字幕并翻译注入到播放器中。
* **手动上传字幕**:
  1. 将您的本地字幕文件（支持 `.srt`, `.vtt`, `.ass`, `.lrc`）拖拽到上传区域。
  2. 选择 **源语言**（如英语）和 **目标语言**（如高棉语/中文）。
  3. 点击 **翻译并注入** 启动翻译并插入播放器，或点击 **仅注入** 直接在网页播放。
  4. 翻译完成后，点击 **下载已翻译字幕** 即可保存翻译后的文件。

### 2. 支持的视频流媒体网站
本插件能够自动检测并支持在以下网站注入字幕：
* **Anistream** (`anistream.one`)
* **Khanime** (`khanime.co` / `stream.khanime.co`)
* **KHFullHD** (`khfullhd.com` / `stream.khfullhd.co`)

### 3. AI 设置说明
* **Gemini API Key**: 您的谷歌 Gemini 密钥。翻译请求将安全地从您本地浏览器直接发起，绝不泄露。
* **选择模型**: 推荐选择 `gemini-3.5-flash`，以获得快速且高性价比的翻译。
* **上下文关联翻译 (Context-Aware)**: 开启后，插件会将前后多行字幕一并作为上下文发送给 AI，从而让对白更加连贯自然，翻译质量更高。
* **并发数 (Concurrency)**: 并行发送翻译请求的数量。数值越高速度越快，但可能更容易触发 API 频率限制。
* **延迟时间 (Delay)**: 请求之间的延迟等待时间（毫秒）。如果遇到 429 报错（频率超限），请增加此数值。
* **18+ / 成人内容 (Mature Content)**: 绕过 AI 的内容审查过滤器，无损翻译脏话、暴力和成人对白，使剧情更加饱满真实。
* **启用本地缓存 (Enable Cache)**: 开启本地缓存后，相同的字幕内容将不会重复请求 API 密钥，再次打开或重新翻译时将直接获取，为您节省 API 额度。
* **重置为默认值 (Reset to Defaults)**: 将所有 AI 参数恢复为默认值，同时会保留您的 API Key 配置。
