document.addEventListener('DOMContentLoaded', () => {
  const logArea = document.getElementById('logArea');
  const connectionStatus = document.getElementById('connectionStatus');
  const clearLogsBtn = document.getElementById('clearLogs');

  // Listen for log messages from background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOG') {
      appendLog(message.payload);
    } else if (message.type === 'CONNECTION_STATUS') {
      updateConnectionStatus(message.payload);
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    logArea.textContent = '';
  });

  function appendLog(text) {
    const timeStamp = new Date().toLocaleTimeString();
    logArea.textContent += `[${timeStamp}] ${text}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }

  function updateConnectionStatus(status) {
    connectionStatus.textContent = status;
  }
});