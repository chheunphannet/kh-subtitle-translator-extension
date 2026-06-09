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
    // Access window-level player and playlist variables
    const w = window as any;
    const player = w.player || (typeof w.jwplayer === "function" ? w.jwplayer() : null);
    const playlist = w.playlist;

    if (player && playlist && playlist[0]) {
      console.log("[JW Subtitle Tester] Player and playlist found. Injecting track...");
      
      const currentPos = player.getPosition();
      
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
      player.once('play', () => player.seek(currentPos));
      player.play();
      
      success = true;
      console.log("[JW Subtitle Tester] Captions track injected successfully.");
    } else {
      error = "JW Player global references ('player' or 'playlist') were not found in this window context.";
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
