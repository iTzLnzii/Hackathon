# AI Content Detector — Chrome Extension

Automatically scans Instagram and Facebook feeds, sends post images to your backend (`/api/analyze-screenshot`), and blocks any post the backend flags as AI-generated.

---

## Quick Setup

### 1. Start Your Backend

```bash
cd Detector-main
npm install
npm run dev
# Backend will run at http://localhost:3000
```

Make sure `/api/analyze-screenshot` is reachable:
```
POST http://localhost:3000/api/analyze-screenshot
Content-Type: application/json
{ "image": "data:image/jpeg;base64,..." }
```

### 2. Load the Extension in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `ai-detector-extension/` folder
5. The extension icon will appear in your toolbar

### 3. Configure in the Popup

Click the extension icon to open the popup:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable toggle | ON | Master switch for scanning |
| Backend URL | `http://localhost:3000` | Where your backend runs |
| Block Threshold | 60% | Block posts where realism score < this value |

Click the **↻ (ping)** button to verify your backend is reachable.

---

## How It Works

```
Instagram/Facebook feed
         │
         ▼
  content.js (MutationObserver)
  ┌──────────────────────────┐
  │  Finds new posts in DOM  │
  │  Extracts image URL +    │
  │  author / caption / URL  │
  └───────────┬──────────────┘
              │  chrome.runtime.sendMessage
              ▼
  background.js (Service Worker)
  ┌──────────────────────────┐
  │  Async queue (max 3)     │
  │  fetch(imageUrl) → base64│
  │  POST /api/analyze-      │
  │       screenshot         │
  └───────────┬──────────────┘
              │  result (verdict, trustScore)
              ▼
  content.js applies overlay
  ┌──────────────────────────┐
  │  blocked → frosted glass │
  │  overlay + badge         │
  │  hover → image revealed  │
  │  safe → green badge      │
  │  (auto-hides in 4s)      │
  └──────────────────────────┘
```

---

## Backend Response Contract

The extension expects this response from `POST /api/analyze-screenshot`:

```json
{
  "verdict":     "Verified" | "Suspicious",
  "trustScore":  0–100,
  "confidence":  0–100,
  "explanation": "string",
  "status":      "heuristic_only"
}
```

**Blocking logic:**
- Block if `verdict === "Suspicious"`
- OR if `trustScore < threshold` (configurable in popup, default 60)
- Higher `trustScore` = more realistic/real content

---

## Selector Maintenance

Instagram and Facebook update their DOM frequently. If the extension stops detecting posts, check these selectors in `content.js` → `SELECTORS` object:

### Instagram

| What | Current Selector | Where to find correct selector |
|------|-----------------|-------------------------------|
| Post container | `article` | Inspect a feed post → look for `<article>` ancestor |
| Feed image | `img[srcset], img[src*="cdninstagram.com"]` | The main post photo `<img>` |
| Post link | `a[href*="/p/"], a[href*="/reel/"]` | The anchor linking to post detail |
| Author | `header a` | First link inside the post `<header>` |
| Caption | `._a9zs span, h1` | The text block below the image |

### Facebook

| What | Current Selector | Where to find correct selector |
|------|-----------------|-------------------------------|
| Post container | `div[data-pagelet^="FeedUnit"], div[role="article"]` | Inspect a feed post |
| Feed image | `img[src*="fbcdn.net"]` | CDN URL pattern (rarely changes) |
| Post link | `a[href*="/posts/"], a[href*="story_fbid"]` | Timestamp/permalink anchor |
| Author | `strong a, h2 a` | Name in post header |
| Caption | `div[data-ad-comet-preview="message"], div[dir="auto"]` | Post text body |

---

## File Structure

```
ai-detector-extension/
├── manifest.json        ← MV3 extension manifest
├── background.js        ← Service worker: queue, fetch, backend calls
├── content.js           ← DOM scanner, overlays, badges
├── content.css          ← Overlay and badge styles
├── popup.html           ← Extension popup UI
├── popup.css            ← Popup styles
├── popup.js             ← Popup logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Troubleshooting

**No posts are being scanned**
- Open DevTools on the Instagram/Facebook tab → Console
- Look for `[AID]` logs — the content script should log on init
- Make sure the extension is enabled in `chrome://extensions`
- Make sure the popup toggle is ON

**Backend connection fails**
- Verify your backend is running: `curl -X POST http://localhost:3000/api/analyze-screenshot -H "Content-Type: application/json" -d '{"image":""}'`
- If running on a different port/URL, update it in the popup
- Check that `http://localhost:3000/*` is in `host_permissions` in manifest.json

**Images are not being fetched**
- Open the background service worker DevTools: `chrome://extensions` → "Service Worker" link
- Look for `[BG] Image fetch failed` errors
- Instagram/Facebook CDN images require the `host_permissions` in manifest.json to include their CDN domains

**Selectors not finding posts**
- Instagram/Facebook update their DOM regularly
- Use Chrome DevTools to inspect a post and update the `SELECTORS` object in `content.js`
