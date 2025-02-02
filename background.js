let ws;
let reconnectInterval = 1000;

function sendLog(message) {
  console.log(message);
  chrome.runtime.sendMessage({ type: 'LOG', payload: message });
}

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8765');

  ws.addEventListener('open', () => {
    sendLog('Connected to WebSocket server');
    reconnectInterval = 1000;
    chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', payload: 'Connected' });
  });

  ws.addEventListener('error', (error) => {
    sendLog('WebSocket error: ' + JSON.stringify(error));
    chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', payload: 'Error' });
    scheduleReconnect();
  });

  ws.addEventListener('close', (event) => {
    sendLog(`WebSocket closed: ${event.code} ${event.reason}`);
    chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', payload: 'Disconnected' });
    scheduleReconnect();
  });

  ws.addEventListener('message', async (event) => {
    sendLog('Received message from server: ' + event.data);
    try {
      const command = JSON.parse(event.data);
      await processCommand(command);
    } catch (error) {
      sendLog('Failed to process command: ' + error.message);
      showNotification('Error', 'Failed to process command');
    }
  });
}

function scheduleReconnect() {
  setTimeout(() => {
    sendLog(`Attempting reconnect in ${reconnectInterval}ms`);
    connectWebSocket();
    reconnectInterval = Math.min(reconnectInterval * 2, 10000);
  }, reconnectInterval);
}

function showNotification(title, message) {
  chrome.notifications.create('', {
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message,
  });
}

function sendResponse(response) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendLog('Sending response: ' + JSON.stringify(response));
    ws.send(JSON.stringify({
      type: 'automation-response',
      payload: response
    }));
  } else {
    sendLog('WebSocket is not connected. Cannot send response: ' + JSON.stringify(response));
  }
}

async function processCommand(command) {
  if (!command.action) {
    throw new Error('Command missing action');
  }

  try {
    switch (command.action) {
      case 'navigate':
        if (!command.url) {
          throw new Error('URL is required for navigation');
        }
        const tabsNav = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabsNav[0]?.id) {
          throw new Error('No active tab found');
        }
        
        await new Promise((resolve, reject) => {
          chrome.tabs.update(tabsNav[0].id, { url: command.url }, (tab) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            showNotification('Navigation', `Navigating to ${command.url}`);
            resolve(tab);
          });
        });
  
        sendResponse({
          success: true,
          requestId: command.requestId,
          action: 'navigate',
          message: `Successfully navigated to ${command.url}`
        });
        break;

      case 'screenshot':
        const dataUrl = await new Promise((resolve, reject) => {
          chrome.tabs.captureVisibleTab({ format: 'png' }, (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(result);
          });
        });
  
        sendResponse({
          success: true,
          requestId: command.requestId,
          screenshot: dataUrl,
          timestamp: new Date().toISOString()
        });
        break;
  
      // For type, click, clickAtCoordinates, getHtml, and executeScript, send to content script
      case 'type':
      case 'click':
      case 'clickAtCoordinates':
      case 'getHtml':
      case 'executeScript':
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]?.id) {
          throw new Error('No active tab found');
        }
  
        const result = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { type: 'automation-command', payload: command },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(response);
            }
          );
        });
  
        sendResponse({
          success: true,
          requestId: command.requestId,
          action: command.action,
          result,
          message: `Successfully executed ${command.action} command`
        });
        break;

      default:
        throw new Error(`Unknown command action: ${command.action}`);
    }
    sendLog(`Processed command: ${command.action}`);
  } catch (error) {
    sendLog(`Command execution failed: ${error.message}`);
    sendResponse({
      success: false,
      requestId: command.requestId,
      error: error.message,
      action: command.action
    });
  }
}

// Initialize WebSocket connection
connectWebSocket();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  sendLog('QBrowser extension installed');
});

// Handle messages from popup (example: query tabs)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'QUERY_TABS') {
    chrome.tabs.query({}, tabs => {
      sendResponse({ tabs });
    });
    return true;
  }
});