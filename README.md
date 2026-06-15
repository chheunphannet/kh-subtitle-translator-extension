# ⚡️ KH Subtitle Translator Extension

A powerful, light-weight Chrome and Firefox extension designed to inject real-time translated subtitles directly into HTML5 video players (specifically optimized for **JW Player** instances on sites like **KHAnime, KHFullHD, and Anistream**) using Google's **Gemini AI**.

---

## 📌 Features

1. **Direct Video Player Injection**  
   Automatically translates and injects subtitle files directly into the active video player, bypassing the need for external subtitle players.

2. **Native VTTCue Injection (Lag-Free)**  
   Features a native `VTTCue` injection engine specifically optimized for Anistream. It loads subtitles instantly into the underlying HTML5 `<video>` element with zero audio sync lag, zero FPS drops, and without reloading the player.

3. **Sleek Floating Toggle Switch**  
   Injects a modern, Ant Design-style floating toggle switch overlay onto the video player.
   - **Target Language Label:** Shows only the native name of the selected language (e.g. `ភាសាខ្មែរ` for Khmer) next to the switch.
   - **Orange Color Theme:** Toggles active states using a signature orange theme color (`#E54D2E`).
   - **Inactivity Fade:** Auto-fades to `30%` opacity after 2.5 seconds of mouse inactivity so it doesn't distract you during playback.

4. **Context-Aware Translation**  
   Uses Google's Gemini models with advanced context-window batching to translate sentences based on surrounding dialogue context, ensuring natural translations and consistent character voices.

5. **Local Configurations & Auto-Save**  
   Remembers your target language configurations (e.g. defaulting to Khmer or Thai) so you don't have to reconfigure them every time the extension reopens.

---

## 🛠 Installation

### Chrome / Edge / Brave (Developer Mode)
1. Download the latest **`khtranslate-chrome.zip`** from the [Releases](https://github.com/chheunphannet/kh-subtitle-translator-extension/releases) page.
2. Extract the ZIP file into a folder on your computer.
3. Open your browser and navigate to `chrome://extensions/`.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the folder where you extracted the extension.

### Firefox (Developer Mode)
1. Download the latest **`khtranslate-firefox.zip`** from the [Releases](https://github.com/chheunphannet/kh-subtitle-translator-extension/releases) page.
2. Extract the ZIP file into a folder on your computer.
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on...** and select the `manifest.json` file inside the extracted folder.

---

## ⚙️ Development & Build Instructions

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version `>=20.9.0` recommended).

### Setup & Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/chheunphannet/kh-subtitle-translator-extension.git
   cd kh-subtitle-translator-extension
   ```
2. Install the compilation dependencies:
   ```bash
   npm install
   ```

### Compile the Extension
To bundle the TypeScript scripts and build the manifests for both Chrome and Firefox, run:
```bash
npm run build:extension
```

This compiles the source code using `esbuild` and produces two build folders:
- **`jw-subtitle-tester/`** (Chrome build output)
- **`jw-subtitle-tester-firefox/`** (Firefox build output)

To package these builds into zip archives, you can use:
```powershell
Compress-Archive -Path "jw-subtitle-tester\*" -DestinationPath "khtranslate-chrome.zip" -Force
Compress-Archive -Path "jw-subtitle-tester-firefox\*" -DestinationPath "khtranslate-firefox.zip" -Force
```

---

## 📂 Project Structure

- **`src/extension/`** - Core extension files
  - `popup.tsx` / `popup.html` - Extension configuration interface
  - `content.ts` - Webpage controller & native VTTCue injection logic
  - `background.ts` - Chrome background service worker
  - `inject.ts` - Fallback JW Player configuration loader
  - `manifest.json` - Browser extension configuration template
- **`scripts/copyExtensionAssets.js`** - Moves compilation assets and automatically syncs manifest versions with `package.json`.
