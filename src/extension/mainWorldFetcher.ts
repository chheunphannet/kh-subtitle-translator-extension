// mainWorldFetcher.ts
// Runs in the webpage context (MAIN world) to perform fetches that trigger the page's Service Worker decryptor.
(function() {
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.type !== "FROM_CONTENT_SCRIPT") return;
    
    const { action, url, id } = event.data;
    if (action === "fetchDecryptedImage") {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.onloadend = () => {
          window.postMessage({
            type: "FROM_MAIN_WORLD",
            id,
            success: true,
            base64: (reader.result as string).split(",")[1]
          }, "*");
        };
        reader.onerror = () => {
          window.postMessage({
            type: "FROM_MAIN_WORLD",
            id,
            success: false,
            error: "FileReader failed to read image blob"
          }, "*");
        };
        reader.readAsDataURL(blob);
      } catch (err: any) {
        window.postMessage({
          type: "FROM_MAIN_WORLD",
          id,
          success: false,
          error: err.message || "Unknown error during main world fetch"
        }, "*");
      }
    }
  });
})();
