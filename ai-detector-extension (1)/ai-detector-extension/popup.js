(function () {
  'use strict';

  const enabledToggle   = document.getElementById('enabledToggle');
  const statusDot       = document.getElementById('statusDot');
  const statusText      = document.getElementById('statusText');
  const pingBtn         = document.getElementById('pingBtn');

  const statDetected    = document.getElementById('statDetected');
  const statQueued      = document.getElementById('statQueued');
  const statScanned     = document.getElementById('statScanned');
  const statBlocked     = document.getElementById('statBlocked');
  const statErrors      = document.getElementById('statErrors');

  const backendUrlInput = document.getElementById('backendUrl');
  const saveUrlBtn      = document.getElementById('saveUrlBtn');
  const thresholdSlider = document.getElementById('thresholdSlider');
  const thresholdValue  = document.getElementById('thresholdValue');
  const resetStatsBtn   = document.getElementById('resetStatsBtn');
  const toast           = document.getElementById('toast');

  function init() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setStatus('offline', 'Background unavailable');
        return;
      }

      const { settings, stats, backendStatus } = response;

      enabledToggle.checked      = settings.enabled ?? true;
      backendUrlInput.value      = settings.backendUrl ?? 'http://localhost:3000';
      thresholdSlider.value      = settings.threshold ?? 60;
      thresholdValue.textContent = settings.threshold ?? 60;

      updateStats(stats);
      applyBackendStatus(backendStatus, settings.enabled);
    });
  }

  enabledToggle.addEventListener('change', () => {
    const enabled = enabledToggle.checked;
    saveSettings({ enabled });
    applyBackendStatus(null, enabled);
    showToast(enabled ? 'Scanning enabled' : 'Scanning paused', 'info');
  });

  thresholdSlider.addEventListener('input', () => {
    thresholdValue.textContent = thresholdSlider.value;
  });

  thresholdSlider.addEventListener('change', () => {
    saveSettings({ threshold: parseInt(thresholdSlider.value, 10) });
    showToast(`Threshold set to ${thresholdSlider.value}%`, 'info');
  });

  saveUrlBtn.addEventListener('click', () => {
    const url = backendUrlInput.value.trim();
    if (!url) {
      showToast('Please enter a valid URL', 'error');
      return;
    }
    saveSettings({ backendUrl: url });
    showToast('Backend URL saved', 'success');
    pingBackend(url);
  });

  backendUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveUrlBtn.click();
  });

  pingBtn.addEventListener('click', () => {
    const url = backendUrlInput.value.trim() || 'http://localhost:3000';
    pingBackend(url);
  });

  resetStatsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESET_STATS' }, () => {
      updateStats({
        detected: 0,
        queued: 0,
        scanned: 0,
        blocked: 0,
        errors: 0,
      });
      showToast('Stats reset', 'info');
    });
  });

  function pingBackend(backendUrl) {
    setStatus('checking', 'Checking backend…');
    pingBtn.classList.add('spinning');

    chrome.runtime.sendMessage(
      { type: 'PING_BACKEND', backendUrl },
      (response) => {
        pingBtn.classList.remove('spinning');

        if (chrome.runtime.lastError || !response) {
          setStatus('offline', 'Backend unreachable');
          showToast('Backend unreachable', 'error');
          return;
        }

        if (response.ok) {
          setStatus('online', 'Backend connected');
          showToast('Backend connected ✓', 'success');
        } else {
          setStatus('offline', 'Backend offline');
          showToast('Backend not responding', 'error');
        }
      }
    );
  }

  function setStatus(state, text) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = text;
  }

  function applyBackendStatus(backendStatus, enabled) {
    if (!enabled) {
      setStatus('paused', 'Scanning paused');
      return;
    }

    switch (backendStatus) {
      case 'online':
        setStatus('online', 'Active — backend connected');
        break;
      case 'offline':
        setStatus('offline', 'Backend unreachable');
        break;
      default:
        setStatus('checking', 'Checking backend…');
        pingBackend(backendUrlInput.value || 'http://localhost:3000');
        break;
    }
  }

  function updateStats(stats) {
    if (!stats) return;

    statDetected.textContent = formatCount(stats.detected ?? 0);
    statQueued.textContent   = formatCount(stats.queued ?? 0);
    statScanned.textContent  = formatCount(stats.scanned ?? 0);
    statBlocked.textContent  = formatCount(stats.blocked ?? 0);
    statErrors.textContent   = formatCount(stats.errors ?? 0);
  }

  function formatCount(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function saveSettings(delta) {
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: delta });
  }

  let toastTimer = null;

  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  const statsInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        updateStats(response.stats);
      }
    });
  }, 3000);

  window.addEventListener('pagehide', () => clearInterval(statsInterval));

  init();
})();