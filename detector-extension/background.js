chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture_tab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Capture failed:', chrome.runtime.lastError.message);
        sendResponse(null);
      } else {
        sendResponse(dataUrl);
      }
    });
    return true; // Keep channel open for async response
  }
});
