const DEFAULT_SETTINGS = {
  enabled: true,
  backendUrl: 'http://localhost:3000',
  threshold: 60,
  maxConcurrent: 3,
};

let settings = { ...DEFAULT_SETTINGS };
let queue = [];
let activeJobs = 0;
let backendStatus = 'unknown';

let globalStats = {
  detected: 0,
  queued: 0,
  scanned: 0,
  blocked: 0,
  errors: 0,
};

chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  console.log('[BG] Settings loaded:', settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
  }
  console.log('[BG] Settings updated:', settings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ANALYZE_POST': {
      if (!settings.enabled) {
        sendResponse({ status: 'disabled' });
        return false;
      }

      if (!sender.tab?.id) {
        sendResponse({ status: 'error', reason: 'no tab id' });
        return false;
      }

      enqueueJob(message.data, sender.tab.id);
      sendResponse({ status: 'queued' });
      return false;
    }

    case 'GET_STATUS': {
      sendResponse({ settings, stats: globalStats, backendStatus });
      return false;
    }

    case 'UPDATE_SETTINGS': {
      const delta = message.settings || {};
      Object.assign(settings, delta);
      chrome.storage.sync.set(delta);
      sendResponse({ ok: true });
      return false;
    }

    case 'PING_BACKEND': {
      const urlToTest = message.backendUrl || settings.backendUrl;
      pingBackend(urlToTest).then((ok) => sendResponse({ ok, status: backendStatus }));
      return true;
    }

    case 'GET_STATS': {
      sendResponse({ stats: globalStats, backendStatus });
      return false;
    }

    case 'RESET_STATS': {
      globalStats = { scanned: 0, blocked: 0, errors: 0 };
      updateBadgeForAllTabs();
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

function enqueueJob(postData, tabId) {
  console.log(`[BG] Enqueuing post ${postData.postId}. Queue depth: ${queue.length + 1}`);
  globalStats.detected++;
  globalStats.queued++;
  queue.push({ postData, tabId });
  drainQueue();
}

function drainQueue() {
  while (activeJobs < settings.maxConcurrent && queue.length > 0) {
    const job = queue.shift();
    activeJobs++;
    if (globalStats.queued > 0) globalStats.queued--;

    runJob(job)
      .catch((err) => {
        console.error('[BG] Unhandled runJob error:', err);
      })
      .finally(() => {
        activeJobs--;
        drainQueue();
      });
  }
}

async function runJob({ postData, tabId }) {
  const { postId, base64DataUri, platform } = postData;
  console.log(`[BG] Running job for post ${postId} (${platform})`);

  try {
    const result = await callBackend(base64DataUri, settings.backendUrl);

    globalStats.scanned++;

    const trustScore = Number(result?.trustScore ?? 0);
    const verdict = result?.verdict ?? 'Unknown';

    const shouldBlock =
      verdict === 'Suspicious' ||
      trustScore < settings.threshold;

    if (shouldBlock) {
      globalStats.blocked++;
      console.log(
        `[BG] Post ${postId} BLOCKED — verdict=${verdict}, trustScore=${trustScore}`
      );
    } else {
      console.log(
        `[BG] Post ${postId} CLEAR — verdict=${verdict}, trustScore=${trustScore}`
      );
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'ANALYSIS_RESULT',
        postId,
        result: {
          verdict,
          trustScore,
          confidence: Number(result?.confidence ?? 0),
          explanation: result?.explanation || '',
          blocked: shouldBlock,
          status: result?.status || 'analyzed',
        },
      });
    } catch (err) {
      console.warn('[BG] Could not send ANALYSIS_RESULT to tab:', err?.message || err);
    }

    updateBadge(tabId);
  } catch (err) {
    globalStats.errors++;
    console.error(`[BG] Job failed for post ${postId}:`, err.message);

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'ANALYSIS_ERROR',
        postId,
        error: err.message,
      });
    } catch (sendErr) {
      console.warn('[BG] Could not send ANALYSIS_ERROR to tab:', sendErr?.message || sendErr);
    }

    updateBadge(tabId);
  }
}

async function callBackend(base64DataUri, backendUrl) {
  const endpoint = `${backendUrl}/api/analyze-screenshot`;
  console.log(`[BG] POST ${endpoint}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s hard timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64DataUri }),
      signal: controller.signal,
    });

    if (!response.ok) {
      backendStatus = 'offline';
      const errText = await response.text().catch(() => '');
      throw new Error(`Backend HTTP ${response.status}: ${errText.slice(0, 160)}`);
    }

    backendStatus = 'online';
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      backendStatus = 'offline';
      throw new Error('Backend timeout after 20s');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function pingBackend(backendUrl) {
  console.log('[BG] Pinging backend at', backendUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${backendUrl}/api/analyze-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: '' }),
      signal: controller.signal,
    });

    if (response.status === 200 || response.status === 400 || response.status === 500) {
      backendStatus = 'online';
      console.log('[BG] Ping succeeded, HTTP', response.status);
      return true;
    }

    backendStatus = 'offline';
    return false;
  } catch (err) {
    backendStatus = 'offline';
    console.warn('[BG] Ping failed:', err.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function updateBadge(tabId) {
  const text = globalStats.blocked > 0 ? String(globalStats.blocked) : '';
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
}

function updateBadgeForAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) updateBadge(tab.id);
    }
  });
}