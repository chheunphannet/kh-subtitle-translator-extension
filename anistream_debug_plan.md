# Debugging Analysis & Implementation Plan: Anistream Issues

## Root Cause Analysis

I have thoroughly analyzed `content.ts` and identified the root causes for the 3 issues you experienced on Anistream:

### 1. Synchronization Issue (Original vs. Translated Text Desync)
**Why it happens:** Currently, the extension extracts the subtitle timing from the native `<video>` element as floating-point numbers, converts them into text strings (e.g., `00:01:23.450`), builds a massive `.vtt` text file, and forces the browser to re-parse it from a Blob URL. 
When dealing with streaming video (HLS/DASH), the browser's Media Source Extensions (MSE) timeline often has tiny offsets. Rounding the timestamps to strings and relying on the browser's VTT parser causes tiny micro-desyncs and timeline mismatches.

### 2. Site Crash (Tab Freezing/Infinite Loop)
**Why it happens:** To add the "Khmer" button to Anistream's subtitle menu, the extension uses a `MutationObserver`. It directly modifies the player's internal Shadow DOM (`offBtn.after(khmerBtn)`). 
Anistream uses a modern UI framework (like React or Vue) to render its player controls. When we manually insert a foreign HTML element into its menu list, the framework gets confused during its next update. It wipes the menu to fix the mismatch, which triggers our `MutationObserver` again to re-add the button, causing a massive "tug-of-war" infinite loop that eventually crashes the page memory.

### 3. FPS Drop / 2-3s Lag after Auto Translate
**Why it happens:** We are injecting a massive Blob URL containing the entire `.vtt` text (thousands of lines) into the `<video>` element all at once. The browser's native engine blocks the main thread (freezing the video for 2-3 seconds) to synchronously parse this giant text file and construct internal `VTTCue` objects.

---

## The Solution & Implementation Plan

We can solve all three issues with a cleaner, native JavaScript approach:

### Step 1: Fix Sync & Lag by bypassing the VTT Blob (Issues 1 & 3)
Instead of generating a massive VTT string and forcing the browser to parse it, we will programmatically add cues using the native HTML5 API.
1. Modify the cue extraction to preserve the exact raw numerical `startTime` and `endTime` floats.
2. In `setupKhmerSubtitle`, use `video.addTextTrack("captions", "Khmer", "km")`.
3. Loop through the translated cues and instantly add them to the track using `track.addCue(new VTTCue(start, end, text))`.
*Result:* Zero parsing overhead (fixes the 2-3s lag) and perfect sub-millisecond precision (fixes the sync drift).

### Step 2: Fix Site Crash by using a non-destructive UI override (Issue 2)
Instead of fighting the player's UI rendering engine by inserting foreign DOM nodes, we will use a "hijack" approach to capture user intent safely.
1. Disconnect the aggressive `MutationObserver`.
2. Instead of creating a new "Khmer" button, we will simply intercept the existing UI. Since the "Khmer" track will be a native TextTrack (from Step 1), the browser's native caption engine will handle it. We will gently monitor `video.textTracks` for changes or safely add a floating, independent toggle button outside of the React-managed Shadow DOM so it doesn't cause framework crashes.

I am ready to implement this code. Let me know if you approve this plan!
