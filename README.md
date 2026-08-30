# KH Subtitle & Manga Translator (`khtranslator`)

<p align="center">
  <img src="./jw-subtitle-tester/icons/icon128.png" alt="khtranslator Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>High-performance browser extension for real-time video subtitle injection and AI manga translation powered by Google Gemini and Khmer localization.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Browser-Chrome%20%7C%20Firefox%20%7C%20Edge%20%7C%20Brave-orange.svg" alt="Browsers" />
  <img src="https://img.shields.io/badge/AI%20Engine-Google%20Gemini-4285F4.svg" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Localization-Khmer%20%7C%20English%20%7C%20Chinese-success.svg" alt="Localization" />
</p>

---

## 🌟 Overview

**`khtranslator`** is a Manifest V3 browser extension built with React 19, TypeScript, and Ant Design 6. It bridges online video streaming and web manga readers with Google Gemini AI to deliver instant, contextual subtitle injection and seamless manga inpainting translation into Khmer (`km`) and other languages.

### Core Features

- **⚡ Real-Time Video Subtitle Injection**: Automatically detects active video players (JW Player, HTML5 video) on supported streaming sites, extracts active subtitle tracks, translates them with AI in real time, and injects the translated cues directly into the player timeline.
- **📖 Two-Step Manga Translation Pipeline**:
  - **Vision Detection (Step 1)**: Identifies dialogue bubbles, bounding boxes (`box_2d`), and reading order (RTL / TTB).
  - **Text Translation & Lore Preservation (Step 2)**: Translates comic dialogue while preserving character names (*Luffy*, *Goku*, *Zoro*) and special technique terms verbatim.
  - **Inpainting & Smart Rendering**: Erases original text and overlays crisp Khmer typography (`Koulen`, `Kdam Thmor Pro`, `Kantumruy Pro`).
- **📁 Local Subtitle Processing**: Drag-and-drop support for `.srt`, `.vtt`, `.ass`, and `.lrc` files. Translate and inject into active web players, or download translated files in single-language or bilingual layouts.
- **🧠 Context-Aware AI Translation**: Sends surrounding lines as context to maintain character personality, emotional tone, and conversational continuity across scenes.
- **🔒 Private & Client-Side**: All subtitle parsing, translation calls, and caching happen directly inside your browser. Your Gemini API key and data are never stored on third-party servers.
- **⚡ IndexedDB Smart Caching**: Caches translated cues locally to prevent redundant API token consumption when replaying or re-translating episodes.

---

## 🖥 Supported Platforms & Formats

### Supported Streaming Sites
- **Anistream** (`anistream.one`)
- **Khanime** (`khanime.co` / `stream.khanime.co`)
- **KHFullHD** (`khfullhd.com` / `stream.khfullhd.co`)
- **Generic Video Players**: JW Player instances, HTML5 `<video>` tags with WebVTT/SRT text tracks.

### Supported Subtitle Formats
| Format | Parse & Detect | Inject into Player | Export / Download | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **.vtt** (WebVTT) | ✅ | ✅ | ✅ | Native HTML5 and JW Player standard |
| **.srt** (SubRip) | ✅ | ✅ | ✅ | Auto-converted to VTT for browser playback |
| **.ass** / **.ssa** | ✅ | ✅ | ✅ | Position tags (`\an8`) preserved; exportable with bilingual styling |
| **.lrc** (Lyrics) | ✅ | ✅ | ✅ | Multi-timestamp karaoke cue handling |

---

## 🚀 Building & Packaging

### Prerequisites
- **Node.js**: `v20.9.0` or higher
- **Package Manager**: `yarn` (recommended), `npm`, or `pnpm`

### 1. Install Dependencies
```bash
yarn install
```

### 2. Build the Extension
Builds both Chrome (Manifest V3 service worker) and Firefox (Manifest V3 background scripts) builds:
```bash
yarn build:extension
```

Output build artifacts:
- `jw-subtitle-tester/` — Production build for Chromium browsers (Chrome, Edge, Brave, Opera).
- `jw-subtitle-tester-firefox/` — Production build for Mozilla Firefox.

---

## 📦 How to Install & Run in Browsers

### Google Chrome / Microsoft Edge / Brave / Opera

1. Open your browser and navigate to the Extensions management page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the build directory: `jw-subtitle-tester` (located in the project root).
5. Pin **`khtranslator`** to your browser toolbar for quick access.

### Mozilla Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Open the `jw-subtitle-tester-firefox` folder and select `manifest.json`.
4. The extension will be loaded and ready for use.

---

## 🎯 How to Use

```
┌─────────────────────────────────────────────────────────────┐
│                      khtranslator                           │
├─────────────────────────────────────────────────────────────┤
│  [ Inject ]       [ Settings ]    [ Prompts ]   [ Advanced ]│
├─────────────────────────────────────────────────────────────┤
│  🟢 Player Detected: Episode 12                             │
│  [ Auto Translate & Inject (Khmer) ]                        │
│                                                             │
│  ─────────────── OR MANUAL UPLOAD ──────────────────────    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Drag & drop subtitle file (.srt, .vtt, .ass, .lrc)  │  │
│  └───────────────────────────────────────────────────────┘  │
│  Source: [ English ▼ ]          Target: [ Khmer (km) ▼ ]    │
│  [ Translate & Inject ]            [ Inject Only ]          │
└─────────────────────────────────────────────────────────────┘
```

### Step 1: Configure Gemini API Key
1. Click the **khtranslator** icon in your browser toolbar.
2. Switch to the **Settings** (ការកំណត់) tab.
3. Paste your **Google Gemini API Key** into the API Key field.
   > [!TIP]
   > You can get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).
4. Click **Test Connection** (តេស្តការតភ្ជាប់) to confirm your key is valid.

### Step 2: Auto-Translate Video Subtitles
1. Navigate to a supported streaming site (e.g., Anistream, Khanime, KHFullHD) and start playing an episode.
2. Open the **khtranslator** popup.
3. When the extension detects the video player, a green indicator will appear showing the detected video title and English subtitle track.
4. Select your **Target Language** (default: `Khmer`).
5. Click **Auto Translate & Inject** (បកប្រែ & បញ្ចូលដោយស្វ័យប្រវត្ត).
6. The extension will translate the cues via the background worker and inject them straight into the video player.

### Step 3: Auto-Translate Manga / Webtoons
1. Open a supported online manga chapter page.
2. Open the **khtranslator** popup. The extension will display detected manga info (Chapter title and image count).
3. Choose the translation mode in **Settings**:
   - **Fast Mode**: Direct text translation overlay on detected bubbles.
   - **Normal Mode**: Complete AI erase + inpainting + Khmer typography styling via the Inpainting Server.
4. Click **Auto Translate Manga** (បកប្រែតុក្កតា/Manga ដោយស្វ័យប្រវត្ត).

### Step 4: Manual Subtitle File Upload
1. Open any webpage with a video player (or a test player page).
2. Drag and drop your `.srt`, `.vtt`, `.ass`, or `.lrc` file into the upload dropzone.
3. Choose your **Source Language** and **Target Language**.
4. Click:
   - **Translate & Inject**: Translates the file with Gemini and injects it into the page player.
   - **Inject Only**: Injects your local subtitle without calling AI translation.
5. Click **Download Translated** (ទាញយក Subtitle បកប្រែរួច) to save the translated file to your computer.

---

## ⚙️ AI Settings & Fine-Tuning

| Setting | Recommended | Description |
| :--- | :---: | :--- |
| **Model** | `gemini-3.5-flash` | Gemini model for subtitle translation (`gemini-3.5-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`). |
| **Manga Model** | `gemini-3.5-flash` | Dedicated model for manga text extraction and translation. |
| **Context Window** | `20` lines | Number of surrounding lines sent to AI for dialogue continuity. |
| **Concurrency** | `5` batches | Number of parallel translation batches. Lower if encountering Rate Limit (HTTP 429). |
| **Delay Time** | `100` ms | Delay between consecutive API requests to prevent rate limiting. |
| **Mature Content (18+)** | `Enabled` | Disables safety filters to preserve uncensored translation of intense or adult dialogue. |
| **IndexedDB Cache** | `Enabled` | Locally caches translated lines so replaying episodes costs 0 API tokens. |
| **Export Mode** | `Translated` or `Bilingual` | Choose single-language output or bilingual display (Translation First / Original First). |

---

## 🖥 Inpainting / Erase Server (Optional for Manga Normal Mode)

For full balloon inpainting and font replacement in Manga Normal Mode, launch the local FastAPI service:

```bash
cd server
python -m venv venv
venv\Scripts\activate      # On Windows
pip install -r requirements.txt
playwright install chromium
python main.py
```

Then in the extension popup **Settings**, verify the server URL is set to `http://localhost:8000` (or your remote VPS endpoint) and click **Test Server**.

> [!TIP]
> **Hosting on Linux VPS / Cloud VM (Google Cloud, AWS, DigitalOcean)?**
> See the [🐧 Linux VM / VPS Command Cheat Sheet](./VM-COMMANDS.md) for top daily commands, `systemd` service management, live log tracing, Redis cache clearing, and one-liner updates.

---

## 📁 Project Structure

```
├── src/extension/             # Extension Source Code (TypeScript + React)
│   ├── background.ts          # Background service worker (API dispatch, queue, caching)
│   ├── content.ts             # Content script (DOM extraction, canvas capture, injection)
│   ├── inject.ts              # Main-world script injected into JW Player / DOM
│   ├── mainWorldFetcher.ts    # Bypasses canvas CORS for manga decryption
│   ├── popup.tsx              # React 19 + Ant Design popup interface
│   ├── popup.css              # Dark theme styling & Kantumruy Pro font config
│   ├── manifest.json          # Manifest V3 template
│   ├── i18n/                  # Multi-locale dictionary (KM, EN, ZH)
│   ├── parsers/               # SRT, VTT, ASS, LRC bidirectional parsers
│   └── services/              # Gemini AI client, prompt templates, DB cache
├── scripts/
│   └── copyExtensionAssets.js # Asset sync and browser manifest build script
├── jw-subtitle-tester/        # Built Chromium extension
├── jw-subtitle-tester-firefox/# Built Firefox extension
└── server/                    # FastAPI + EasyOCR + Playwright inpainting server
```

---

## 🛠 Troubleshooting

- **Error 429 (Rate Limit Exceeded)**:
  - Increase **Delay Time (ms)** in Settings (e.g. from `100` to `500`).
  - Decrease **Concurrency / Batch Size** (e.g. from `5` to `2`).
  - Switch to `gemini-3.1-flash-lite` or check your Google AI Studio quota.
- **Player Not Detected**:
  - Start playing the video first so the player initializes its text tracks.
  - Refresh the page and reopen the extension popup.
- **Khmer Fonts Rendering as Squares**:
  - The extension automatically bundles and injects the Google **Kantumruy Pro** font into the target web player. Ensure hardware acceleration is enabled in your browser.

---

## 📄 License

This extension is licensed under the [MIT License](./LICENSE).
