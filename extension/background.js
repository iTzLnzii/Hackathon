chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze_screenshot") {
    // Calls the active /api/analyze-screenshot endpoint
    const APP_URL = "http://localhost:3000"; // Update to your deployed URL if needed
    
    fetch(`${APP_URL}/api/analyze-screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: request.image })
    })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep channel open for async response
  }
});
