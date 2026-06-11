(function() {
  const scriptTag = document.currentScript;
  if (!scriptTag) return;
  
  const blobUrl = scriptTag.getAttribute("data-blob-url");
  const fileName = scriptTag.getAttribute("data-file-name") || "Injected Subtitles";
  const eventId = scriptTag.getAttribute("data-event-id");
  
  if (!eventId) return;

  let success = false;
  let error = "";
  
  try {
    const w = window as any;

    // Try multiple ways to find the JW Player instance
    let player: any = null;

    // Method 1: jwplayer() function (most common)
    if (typeof w.jwplayer === "function") {
      const p = w.jwplayer();
      if (p && typeof p.getState === "function") {
        player = p;
      }
    }

    // Method 2: window.player global
    if (!player && w.player && typeof w.player.getState === "function") {
      player = w.player;
    }

    // Method 3: Find by DOM element ID
    if (!player && typeof w.jwplayer === "function") {
      const candidates = document.querySelectorAll(".jwplayer, [id*='player']");
      for (const el of candidates) {
        try {
          const p = w.jwplayer(el.id);
          if (p && typeof p.getState === "function") {
            player = p;
            break;
          }
        } catch (_) {}
      }
    }

    const playlist = w.playlist;

    if (player && playlist && playlist[0]) {
      console.log("[JW Subtitle Tester] Player and playlist found. Injecting track...");
      
      // Safely get current position
      let currentPos = 0;
      try {
        if (typeof player.getPosition === "function") {
          currentPos = player.getPosition() || 0;
        }
      } catch (_) {}
      
      const newTrack = {
        kind: "captions",
        file: blobUrl,
        label: fileName,
        default: true
      };
      
      if (!playlist[0].tracks) {
        playlist[0].tracks = [];
      }
      
      // Append track to playlist
      playlist[0].tracks.push(newTrack);
      
      // Reload player
      player.load(playlist);
      
      // Resume playback at exact time
      if (typeof player.once === "function") {
        player.once('play', () => {
          if (currentPos > 0 && typeof player.seek === "function") {
            player.seek(currentPos);
          }
        });
      }
      if (typeof player.play === "function") {
        player.play();
      }
      
      success = true;
      console.log("[JW Subtitle Tester] Captions track injected successfully.");
    } else if (player) {
      // Player found but no playlist — try addButton/setCaptions approach
      try {
        if (typeof player.addCues === "function" || typeof player.setCaptions === "function") {
          // Fallback: add as a track directly via JW Player 8 API
          player.addButton && player.addButton("", fileName, () => {}, "cc");
        }
      } catch (_) {}
      error = "JW Player found but no 'playlist' global variable was detected. Subtitles may not be injected.";
      console.warn("[JW Subtitle Tester] " + error);
    } else {
      error = "JW Player instance was not found in this window context.";
      console.error("[JW Subtitle Tester] Injection failed: " + error);
    }
  } catch (err) {
    error = (err as Error).message || "An error occurred during injection.";
    console.error("[JW Subtitle Tester] Exception during injection:", err);
  }
  
  // Send status back to content script
  document.dispatchEvent(new CustomEvent(eventId, {
    detail: { success, error }
  }));
})();

