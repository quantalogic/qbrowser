"use strict";

// Configuration
const API_URL = "ws://localhost:8765/ws"; // WebSocket server endpoint
const WS_TIMEOUT = 5000; // 5 seconds timeout

let ws = null;
let reconnectInterval = 1000; // initial reconnect interval

//////////////////////
// Logging Helpers  //
//////////////////////
function logInfo(message) {
  console.info(`[INFO] ${message}`);
  try {
    chrome.runtime.sendMessage({ type: "LOG", payload: message });
  } catch (e) { }
}

function logError(message) {
  console.error(`[ERROR] ${message}`);
  try {
    chrome.runtime.sendMessage({ type: "LOG", payload: message });
  } catch (e) { }
}

function showNotification(title, message) {
  chrome.notifications.create("", {
    type: "basic",
    iconUrl: "images/q-logo-square.png",
    title,
    message,
  });
}

//////////////////////
// Utility Functions//
//////////////////////
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function queryTabs(queryOpts) {
  return new Promise((resolve, reject) => {
    logInfo("queryTabs: " + JSON.stringify(queryOpts));
    chrome.tabs.query(queryOpts, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        logInfo("queryTabs: Found " + tabs.length + " tab(s).");
        resolve(tabs);
      }
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    logInfo(`updateTab: Updating tab ${tabId} with ${JSON.stringify(updateProperties)}`);
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        logInfo(`updateTab: Tab ${tabId} updated.`);
        resolve(tab);
      }
    });
  });
}

function getCurrentWindow() {
  return new Promise((resolve, reject) => {
    logInfo("getCurrentWindow: Getting current window");
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win) {
        reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "No active window"));
      } else {
        logInfo("getCurrentWindow: Got window id " + win.id);
        resolve(win);
      }
    });
  });
}

//////////////////////////
// Screenshot Mechanism //
//////////////////////////
async function captureVisibleTab() {
  try {
    logInfo("captureVisibleTab: Initiating screenshot capture");
    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      throw new Error("No active tab found");
    }
    const activeTab = tabs[0];
    logInfo(`captureVisibleTab: Active tab id=${activeTab.id}, url=${activeTab.url}, status=${activeTab.status}`);
    if (activeTab.status !== "complete") {
      logInfo("captureVisibleTab: Waiting for tab to finish loading...");
      await new Promise(resolve => {
        const listener = (tabId, info) => {
          if (tabId === activeTab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            logInfo("captureVisibleTab: Tab finished loading.");
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
    const win = await getCurrentWindow();
    logInfo(`captureVisibleTab: Will capture from window id ${win.id}`);
    await updateTab(activeTab.id, { active: true });
    chrome.windows.update(win.id, { focused: true });
    logInfo("captureVisibleTab: Focus set. Waiting 300ms for stabilization.");
    await delay(300);
    return await new Promise((resolve, reject) => {
      logInfo("captureVisibleTab: Invoking chrome.tabs.captureVisibleTab...");
      chrome.tabs.captureVisibleTab(win.id, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          return reject(new Error("captureVisibleTab: " + chrome.runtime.lastError.message));
        }
        if (!dataUrl) {
          return reject(new Error("captureVisibleTab: Empty screenshot result"));
        }
        logInfo("captureVisibleTab: Captured screenshot (dataUrl length: " + dataUrl.length + ")");
        resolve(dataUrl);
      });
    });
  } catch (error) {
    logError("captureVisibleTab ERROR: " + error.message);
    throw error;
  }
}

//////////////////////////////
// WebSocket Relay Mechanism//
//////////////////////////////
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logInfo("connectWebSocket: WebSocket already open");
    return;
  }
  logInfo("connectWebSocket: Connecting to " + API_URL);
  ws = new WebSocket(API_URL);
  const wsConnectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      logError("connectWebSocket: Connection timed out - closing WebSocket");
      ws.close();
      scheduleReconnect();
    }
  }, WS_TIMEOUT);
  ws.addEventListener("open", () => {
    clearTimeout(wsConnectionTimeout);
    logInfo("WebSocket CONNECTED");
    const registerMsg = {
      type: "REGISTER_EXTENSION",
      apiKey: "DEFAULT_SECRET"
    };
    try {
      ws.send(JSON.stringify(registerMsg));
      logInfo("WebSocket: Sent registration message");
    } catch (error) {
      logError("WebSocket registration error: " + error.message);
    }
    reconnectInterval = 1000;
  });
  ws.addEventListener("error", (error) => {
    logError("WebSocket error: " + JSON.stringify(error));
    scheduleReconnect();
  });
  ws.addEventListener("close", (event) => {
    logInfo("WebSocket closed: " + event.code + " " + event.reason);
    scheduleReconnect();
  });
  ws.addEventListener("message", async (event) => {
    logInfo("WebSocket MESSAGE RECEIVED: " + event.data);
    try {
      const command = JSON.parse(event.data);
      await processCommand(command);
    } catch (error) {
      logError("WebSocket processCommand error: " + error.message);
      showNotification("Extension Error", error.message);
    }
  });
}

function scheduleReconnect() {
  logInfo(`scheduleReconnect: Attempting reconnect in ${reconnectInterval}ms`);
  setTimeout(() => {
    connectWebSocket();
    reconnectInterval = Math.min(reconnectInterval * 2, 10000);
  }, reconnectInterval);
}

function sendResponse(response) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logError("sendResponse: WebSocket unavailable to send response");
    return;
  }
  try {
    const messageObj = { type: "automation-response", payload: response };
    const messageStr = JSON.stringify(messageObj);
    logInfo(`sendResponse: Sending response for action (${response.action}) - ${messageStr.length} bytes`);
    ws.send(messageStr);
    logInfo("sendResponse: Response sent");
  } catch (error) {
    logError("sendResponse error: " + error.message);
  }
}

////////////////////////////////////
// Command Processing & Routing   //
////////////////////////////////////
async function processCommand(command) {
  if (!command || !command.action) {
    logError("processCommand: Missing command or command.action");
    return;
  }
  logInfo("processCommand: Received command: " + JSON.stringify(command));
  try {
    switch (command.action) {
      case "screenshot": {
        // Process screenshot command without relying on command.url (check active tab's URL if exists)
        const tabs = await queryTabs({ active: true, currentWindow: true });
        if (!tabs[0]) {
          throw new Error("No active tab found for screenshot");
        }
        // If tab.url exists, enforce HTTP/HTTPS; otherwise, allow the screenshot to proceed.
        if (tabs[0].url && !/^https?:\/\//.test(tabs[0].url)) {
          throw new Error("Screenshots are only allowed on HTTP/HTTPS pages");
        }
        const dataUrl = await captureVisibleTab();
        sendResponse({
          success: true,
          requestId: command.requestId,
          action: "screenshot",
          screenshot: dataUrl,
          timestamp: new Date().toISOString()
        });
        break;
      }
      case "navigate": {
        if (!command.url) {
          throw new Error("navigate command is missing URL");
        }
        const tabs = await queryTabs({ active: true, currentWindow: true });
        if (!tabs[0]) throw new Error("No active tab found for navigation");
        await updateTab(tabs[0].id, { url: command.url });
        await new Promise((resolve, reject) => {
          const listener = (tabId, info) => {
            if (tabId === tabs[0].id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error("Navigation timed out"));
          }, 30000);
        });
        sendResponse({
          success: true,
          requestId: command.requestId,
          action: "navigate",
          message: "Navigation successful",
          timestamp: new Date().toISOString()
        });
        break;
      }
      default:
        throw new Error("Unknown command action: " + command.action);
    }
    logInfo("processCommand: Processed command successfully: " + command.action);
  } catch (error) {
    logError("processCommand error (" + command.action + "): " + error.message);
    sendResponse({
      success: false,
      requestId: command.requestId,
      action: command.action,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

//////////////////////
// Cleanup on suspend
//////////////////////
function cleanup() {
  if (ws) {
    ws.close();
  }
}
chrome.runtime.onSuspend.addListener(cleanup);

//////////////////////
// Initialization
//////////////////////
chrome.runtime.onInstalled.addListener(() => {
  logInfo("Extension installed and running");
});
connectWebSocket();