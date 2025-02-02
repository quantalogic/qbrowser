document.addEventListener('DOMContentLoaded', () => {
  const logArea = document.getElementById('logArea');
  const connectionStatus = document.getElementById('connectionStatus');
  const clearLogsButton = document.getElementById('clearLogs');

  function appendLog(message, level = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level === 'command' ? 'command-received' : ''} ${level === 'error' ? 'error-log' : ''}`;
    entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
  }

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'LOG':
        appendLog(message.payload, message.level);
        break;
      case 'CONNECTION_STATUS':
        connectionStatus.textContent = message.payload;
        break;
    }
  });

  clearLogsButton.addEventListener('click', () => {
    logArea.innerHTML = '';
  });
});