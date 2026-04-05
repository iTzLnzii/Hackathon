document.addEventListener('DOMContentLoaded', async () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const analysisModeSelect = document.getElementById('analysisMode');
  const includeReasoningCheckbox = document.getElementById('includeReasoning');
  const autoAnalyzeCheckbox = document.getElementById('autoAnalyze');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load current settings
  const settings = await chrome.storage.local.get({
    apiUrl: 'http://localhost:3000',
    analysisMode: 'strict',
    includeReasoning: true,
    autoAnalyze: false
  });

  apiUrlInput.value = settings.apiUrl;
  analysisModeSelect.value = settings.analysisMode;
  includeReasoningCheckbox.checked = settings.includeReasoning;
  autoAnalyzeCheckbox.checked = settings.autoAnalyze;

  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      apiUrl: apiUrlInput.value.replace(/\/$/, ''), // Remove trailing slash
      analysisMode: analysisModeSelect.value,
      includeReasoning: includeReasoningCheckbox.checked,
      autoAnalyze: autoAnalyzeCheckbox.checked
    };

    await chrome.storage.local.set(newSettings);

    statusEl.textContent = 'Settings saved!';
    statusEl.classList.add('show');
    
    setTimeout(() => {
      statusEl.classList.remove('show');
    }, 2000);
  });
});
