// Content script to handle screenshot capture triggers from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture_page") {
    // Simple placeholder for screenshot logic
    // In a real implementation, we'd use a library or canvas to capture specific elements
    console.log("Detector: Capturing page content...");
    sendResponse({ status: "ready" });
  }
});
