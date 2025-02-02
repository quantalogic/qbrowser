import { Command } from '../types';

let ws: WebSocket;
let reconnectInterval = 1000;

const connectWebSocket = () => {
  ws = new WebSocket('ws://localhost:8765');

  ws.addEventListener('open', () => {
    console.log('Connected to WebSocket server');
    reconnectInterval = 1000;
  });

  ws.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
    scheduleReconnect();
  });

  ws.addEventListener('close', (event) => {
    console.log(`WebSocket closed: ${event.code} ${event.reason}`);
    scheduleReconnect();
  });

  ws.addEventListener('message', async (event) => {
    console.log('Received message from server:', event.data);
    try {
      const command: Command = JSON.parse(event.data.toString());
      await processCommand(command);
    } catch (error) {
      console.error('Failed to process command:', error);
    }
  });
};

const scheduleReconnect = () => {
  setTimeout(() => {
    console.log(`Attempting reconnect in ${reconnectInterval}ms`);
    connectWebSocket();
    reconnectInterval = Math.min(reconnectInterval * 2, 10000);
  }, reconnectInterval);
};

const processCommand = async (command: Command): Promise<void> => {
  if (!command.action) {
    console.error('Command missing action');
    return;
  }
  switch (command.action) {
    case 'type':
    case 'click':
    case 'clickAtCoordinates':
      // Forward to content script for DOM-related actions
      sendToActiveTab(command);
      break;
    case 'navigate':
      if (command.url) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.update(tabs[0].id, { url: command.url });
            sendResponse({ success: true, requestId: command.requestId });
          } else {
            sendResponse({ success: false, error: 'No active tab found', requestId: command.requestId });
          }
        });
      } else {
        sendResponse({ success: false, error: 'Missing URL for navigation', requestId: command.requestId });
      }
      break;
    case 'screenshot':
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Screenshot failed:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message, requestId: command.requestId });
          return;
        }
        // Return the screenshot as a base64 encoded data URL
        sendResponse({ success: true, requestId: command.requestId, screenshot: dataUrl, timestamp: new Date().toISOString() });
      });
      break;
    // Placeholder for future OCR implementation
    case 'ocr':
      sendResponse({ success: false, error: 'OCR not implemented yet', requestId: command.requestId });
      break;
    default:
      console.error('Unknown action:', command.action);
      sendResponse({ success: false, error: 'Unknown action', requestId: command.requestId });
  }
};

const sendToActiveTab = (command: Command): void => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'automation-command', payload: command }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to content script:', chrome.runtime.lastError.message);
        }
        // Optionally, you could pass the content script response back to the server
        console.log('Content script response:', response);
      });
    } else {
      console.error('No active tab found to send command');
    }
  });
};

const sendResponse = (response: { success: boolean; error?: string; requestId?: string; screenshot?: string; timestamp?: string }): void => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message = {
      type: 'automation-response',
      payload: response
    };
    ws.send(JSON.stringify(message));
  }
};

// Initialize WebSocket connection
connectWebSocket();