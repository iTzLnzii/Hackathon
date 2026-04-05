document.addEventListener('DOMContentLoaded', async () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const resetBtn = document.getElementById('resetBtn');
  const retryBtn = document.getElementById('retryBtn');

  const initialView = document.getElementById('initialView');
  const loadingView = document.getElementById('loadingView');
  const resultView = document.getElementById('resultView');
  const errorView = document.getElementById('errorView');

  const trustScoreEl = document.getElementById('trustScore');
  const confidenceEl = document.getElementById('confidence');
  const explanationEl = document.getElementById('explanationText');
  const signalsListEl = document.getElementById('signalsList');
  const verdictBadge = document.getElementById('verdictBadge');
  const errorTextEl = document.getElementById('errorText');

  // Load settings
  const settings = await chrome.storage.local.get({
    apiUrl: 'http://localhost:3000',
    analysisMode: 'strict',
    includeReasoning: true,
    autoAnalyze: false
  });

  if (settings.autoAnalyze) {
    startAnalysis();
  }

  analyzeBtn.addEventListener('click', startAnalysis);
  resetBtn.addEventListener('click', () => showView('initial'));
  retryBtn.addEventListener('click', startAnalysis);
  settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  async function startAnalysis() {
    showView('loading');

    try {
      // Capture screenshot via background script
      const screenshot = await chrome.runtime.sendMessage({ action: 'capture_tab' });
      
      if (!screenshot) {
        throw new Error('Failed to capture screenshot.');
      }

      // Send to API
      const response = await fetch(`${settings.apiUrl}/api/analyze-screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: screenshot,
          analysisMode: settings.analysisMode,
          includeReasoning: settings.includeReasoning
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const result = await response.json();
      displayResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      errorTextEl.textContent = error.message || 'Failed to connect to Detector API.';
      showView('error');
    }
  }

  function displayResult(result) {
    trustScoreEl.textContent = `${result.trustScore ?? '--'}%`;
    confidenceEl.textContent = `${result.confidence ?? '--'}%`;
    explanationEl.textContent = result.explanation || 'No explanation provided.';
    
    // Verdict Badge
    verdictBadge.textContent = result.verdict || 'Unknown';
    verdictBadge.className = 'badge ' + (result.verdict || 'unknown').toLowerCase().replace(' ', '-');

    // Signals (may not be present in heuristic-only results)
    signalsListEl.innerHTML = '';
    if (Array.isArray(result.signals) && result.signals.length > 0) {
      result.signals.forEach(signal => {
        const li = document.createElement('li');
        li.textContent = signal;
        signalsListEl.appendChild(li);
      });
    } else if (result.explanation) {
      // Fallback: show explanation as a single signal item
      const li = document.createElement('li');
      li.textContent = result.explanation;
      signalsListEl.appendChild(li);
    }

    showView('result');
  }

  function showView(viewName) {
    initialView.classList.add('hidden');
    loadingView.classList.add('hidden');
    resultView.classList.add('hidden');
    errorView.classList.add('hidden');

    if (viewName === 'initial') initialView.classList.remove('hidden');
    if (viewName === 'loading') loadingView.classList.remove('hidden');
    if (viewName === 'result') resultView.classList.remove('hidden');
    if (viewName === 'error') errorView.classList.remove('hidden');
  }
});
