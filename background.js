// background.js
"use strict";

const API_URL = "ws://localhost:8765";
const MAX_RECONNECT_INTERVAL = 10000;
const THROTTLE_DELAY = 100; // ms between commands
const WS_TIMEOUT = 5000; // WebSocket connection timeout
let lastCommandTime = 0;
let ws;
let reconnectInterval = 1000;

// Logging functions using basic log levels
function logInfo(message) {
  console.info(`[INFO] ${message}`);
  try {
    chrome.runtime.sendMessage({ type: "LOG", payload: message }).catch(() => {
      // Ignore errors when popup is not open
      console.debug("Popup not available for logging");
    });
  } catch (error) {
    console.debug("Failed to send log message", error);
  }
}

function logError(message) {
  console.error(`[ERROR] ${message}`);
  try {
    chrome.runtime.sendMessage({ type: "LOG", payload: message }).catch(() => {
      // Ignore errors when popup is not open
      console.debug("Popup not available for logging");
    });
  } catch (error) {
    console.debug("Failed to send error message", error);
  }
}

function showNotification(title, message) {
  chrome.notifications.create("", {
    type: "basic",
    iconUrl: "images/q-logo-square.png", // Updated icon path
    title,
    message,
  });
}

function updateConnectionStatus(status) {
  try {
    chrome.runtime.sendMessage({ type: "CONNECTION_STATUS", payload: status }).catch(() => {
      // Ignore errors when popup is not open
      console.debug("Popup not available for status update");
    });
  } catch (error) {
    console.debug("Failed to update connection status", error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Promise wrappers for Chrome API callbacks
function queryTabs(queryOpts) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryOpts, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs);
      }
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tab);
      }
    });
  });
}

async function captureVisibleTab() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }
    const tab = tabs[0];

    // Ensure the tab is fully loaded
    if (tab.status !== 'complete') {
      await new Promise(resolve => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    // Ensure tab is focused
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });

    // Wait a brief moment for the tab to be fully focused
    await new Promise(resolve => setTimeout(resolve, 250));

    // Attempt to capture screenshot
    return await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        tab.windowId,
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
          } else if (!dataUrl) {
            reject(new Error('Screenshot capture returned empty result'));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });
  } catch (error) {
    logError(`Screenshot capture failed: ${error.message}`);
    throw error;
  }
}

// Establish WebSocket connection with improved error handling and reconnection logic
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logInfo("WebSocket already connected");
    return;
  }

  ws = new WebSocket(API_URL);
  
  // Add connection timeout
  const connectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      ws.close();
      updateConnectionStatus("Timeout");
      scheduleReconnect();
    }
  }, WS_TIMEOUT);

  ws.addEventListener("open", () => {
    clearTimeout(connectionTimeout);
    logInfo("Connected to WebSocket server.");
    updateConnectionStatus("Connected");
    reconnectInterval = 1000;

    // Register the extension with the server
    const registerMessage = {
      type: "REGISTER_EXTENSION",
      apiKey: "your_secure_key_here",
    };
    ws.send(JSON.stringify(registerMessage));
  });

  ws.addEventListener("error", (error) => {
    logError("WebSocket error: " + JSON.stringify(error));
    updateConnectionStatus("Error");
    scheduleReconnect();
  });

  ws.addEventListener("close", (event) => {
    logInfo(`WebSocket closed: ${event.code} ${event.reason}`);
    updateConnectionStatus("Disconnected");
    scheduleReconnect();
  });

  ws.addEventListener("message", async (event) => {
    logInfo("Received message from server: " + event.data);
    try {
      const command = JSON.parse(event.data);
      await processCommand(command);
    } catch (error) {
      logError("Failed to process command: " + error.message);
      showNotification("Error", "Failed to process command");
    }
  });
}

function scheduleReconnect() {
  setTimeout(() => {
    logInfo(`Attempting reconnect in ${reconnectInterval}ms`);
    connectWebSocket();
    reconnectInterval = Math.min(reconnectInterval * 2, MAX_RECONNECT_INTERVAL);
  }, reconnectInterval);
}

// Forward commands (type, click, etc.) to content scripts
async function injectContentScriptIfNeeded(tabId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error("No active tab found");
    }

    // Check if content script is already injected
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PING" });
      logInfo("Content script already exists");
      return;
    } catch (error) {
      // Content script not found, inject it
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      logInfo(`Content script injected into tab ${tabId}`);
    }
  } catch (error) {
    logError(`Failed to inject content script: ${error.message}`);
    throw error;
  }
}

async function sendMessageToContentScript(command, retries = 2) {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  if (!tabs[0]?.id) {
    throw new Error("No active tab found");
  }
  
  const sendWithRetry = async (attempt) => {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "automation-command", payload: command },
          async (response) => {
            if (chrome.runtime.lastError) {
              if (attempt < retries && chrome.runtime.lastError.message.includes("no listener")) {
                logInfo(`Retrying content script communication, attempt ${attempt + 1}`);
                await injectContentScriptIfNeeded(tabs[0].id);
                await delay(100); // Wait for script injection
                const result = await sendWithRetry(attempt + 1);
                resolve(result);
              } else {
                reject(new Error(`Content script communication failed: ${chrome.runtime.lastError.message}`));
              }
              return;
            }
            resolve(response);
          }
        );
      });
    } catch (error) {
      if (attempt < retries) {
        logInfo(`Retrying after error: ${error.message}`);
        await delay(100 * Math.pow(2, attempt));
        return sendWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  return sendWithRetry(0);
}

function sendResponse(response) {
  if (!ws) {
    logError("WebSocket instance is null");
    return;
  }

  if (ws.readyState !== WebSocket.OPEN) {
    logError(`WebSocket is not open (state: ${ws.readyState})`);
    return;
  }

  try {
    const messageStr = JSON.stringify({
      type: "automation-response",
      payload: response,
    });
    logInfo(`Sending response (${messageStr.length} bytes)`);
    ws.send(messageStr);
    logInfo("Response sent successfully");
  } catch (error) {
    logError(`Failed to send response: ${error.message}`);
  }
}

function logCommand(command) {
  const message = `Command received: ${command.action} ${JSON.stringify(command)}`;
  console.info(`[COMMAND] ${message}`);
  chrome.runtime.sendMessage({ 
    type: "LOG", 
    payload: message,
    level: "command"
  });
}

// Process automation commands from the WebSocket
async function processCommand(command) {
  // Implement request throttling
  const now = Date.now();
  const timeSinceLastCommand = now - lastCommandTime;
  if (timeSinceLastCommand < THROTTLE_DELAY) {
    await delay(THROTTLE_DELAY - timeSinceLastCommand);
  }
  lastCommandTime = Date.now();

  // Add command timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Command execution timed out")), 30000);
  });

  try {
    const result = await Promise.race([
      executeCommand(command),
      timeoutPromise
    ]);
    return result;
  } catch (error) {
    logError(`Command execution failed: ${error.message}`);
    throw error;
  }
}

// New helper function to execute commands
async function executeCommand(command) {
  if (!command.action) {
    throw new Error("Command missing action");
  }

  logCommand(command);

  switch (command.action) {
    case "navigate": {
      if (!command.url) {
        throw new Error("URL is required for navigation");
      }

      try {
        // Get active tab
        const tabs = await queryTabs({ active: true, currentWindow: true });
        const activeTabId = tabs[0]?.id;
        if (!activeTabId) {
          throw new Error("No active tab found");
        }

        // Create a promise that resolves when navigation is complete
        const navigationPromise = new Promise((resolve, reject) => {
          const listener = (tabId, info) => {
            if (tabId === activeTabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          // Set a timeout for navigation
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Navigation timeout'));
          }, 30000);
        });

        // Start navigation
        await updateTab(activeTabId, { url: command.url });
        
        // Wait for navigation to complete
        await navigationPromise;

        // Send success response
        const response = {
          success: true,
          requestId: command.requestId,
          action: "navigate",
          message: `Successfully navigated to ${command.url}`,
          timestamp: new Date().toISOString()
        };
        
        sendResponse(response);
        logInfo(`Navigation completed: ${command.url}`);
      } catch (error) {
        logError(`Navigation failed: ${error.message}`);
        throw error;
      }
      break;
    }
    case "screenshot": {
      logInfo("Processing screenshot command...");
      try {
        // Wait briefly to ensure the tab is ready
        await delay(100);
        // Validate that the active tab is using HTTP/HTTPS to prevent capturing non-web pages
        const tabs = await queryTabs({ active: true, currentWindow: true });
        if (!tabs[0] || !tabs[0].url || !/^https?:\/\//.test(tabs[0].url)) {
          throw new Error("Screenshot capture is only allowed on HTTP/HTTPS pages");
        }

        const dataUrl = await captureVisibleTab();
        const response = {
          success: true,
          requestId: command.requestId,
          action: "screenshot",
          screenshot: dataUrl,
          timestamp: new Date().toISOString(),
        };
        logInfo("Screenshot captured successfully");
        sendResponse(response);
      } catch (error) {
        const errorResponse = {
          success: false,
          requestId: command.requestId,
          action: "screenshot",
          error: error.message,
          timestamp: new Date().toISOString(),
        };
        sendResponse(errorResponse);
        throw error;
      }
      break;
    }
    case "type":
    case "click":
    case "clickAtCoordinates":
    case "getHtml":
    case "executeScript": {
      // Forward these command types to content script and await its response
      const result = await sendMessageToContentScript(command);
      sendResponse({
        success: true,
        requestId: command.requestId,
        action: command.action,
        result,
        message: `Successfully executed ${command.action} command`,
      });
      break;
    }
    case "getHtml": {
      // Forward these command types to content script and await its response
      const result = await sendMessageToContentScript(command);
      sendResponse({
        success: true,
        requestId: command.requestId,
        action: command.action,
        html: result.html, // Include the HTML content in the response
        timestamp: new Date().toISOString(),
        message: `Successfully retrieved HTML content`
      });
      break;
    }
    default:
      throw new Error(`Unknown command action: ${command.action}`);
  }
  logInfo(`Processed command: ${command.action}`);
}

// Cleanup function for extension unload
function cleanup() {
  if (ws) {
    ws.close();
  }
}

// Add cleanup listener
chrome.runtime.onSuspend.addListener(cleanup);

// Listen to messages from popup UI; for example, handling QUERY_TABS requests.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "QUERY_TABS") {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({ tabs });
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  logInfo("QBrowser extension installed");
});

// Initialize the WebSocket connection.
connectWebSocket();