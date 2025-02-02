// background.js
"use strict";

const API_URL = "ws://localhost:8765";
const MAX_RECONNECT_INTERVAL = 10000;
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
    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }
    
    logInfo("Attempting to capture screenshot...");
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    
    logInfo("Screenshot captured successfully");
    return dataUrl;
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

  ws.addEventListener("open", () => {
    logInfo("Connected to WebSocket server.");
    updateConnectionStatus("Connected");
    reconnectInterval = 1000;
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
  if (!command.action) {
    throw new Error("Command missing action");
  }
  
  logCommand(command);
  
  try {
    switch (command.action) {
      case "navigate": {
        if (!command.url) {
          throw new Error("URL is required for navigation");
        }
        const tabsNav = await queryTabs({ active: true, currentWindow: true });
        const activeTabId = tabsNav[0]?.id;
        if (!activeTabId) {
          throw new Error("No active tab found");
        }
        await updateTab(activeTabId, { url: command.url });
        showNotification("Navigation", `Navigating to ${command.url}`);
        sendResponse({
          success: true,
          requestId: command.requestId,
          action: "navigate",
          message: `Successfully navigated to ${command.url}`,
        });
        break;
      }
      case "screenshot": {
        logInfo("Processing screenshot command...");
        try {
          const dataUrl = await captureVisibleTab();
          const response = {
            success: true,
            requestId: command.requestId,
            action: "screenshot",
            screenshot: dataUrl,
            timestamp: new Date().toISOString(),
          };
          logInfo("Sending screenshot response...");
          sendResponse(response);
        } catch (error) {
          throw new Error(`Screenshot failed: ${error.message}`);
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
      default:
        throw new Error(`Unknown command action: ${command.action}`);
    }
    logInfo(`Processed command: ${command.action}`);
  } catch (error) {
    logError(`Command execution failed: ${error.message}`);
    sendResponse({
      success: false,
      requestId: command.requestId,
      error: error.message,
      action: command.action,
    });
  }
}

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