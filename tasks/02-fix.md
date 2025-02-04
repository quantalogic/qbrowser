ou are an expert software engineer.

You are tasked with following my instructions.

Use the included project instructions as a general guide.

You will respond with 2 sections: A summary section and an XLM section.

Here are some notes on how you should respond in the summary section:

- Provide a brief overall summary
- Provide a 1-sentence summary for each file changed and why.
- Provide a 1-sentence summary for each file deleted and why.
- Format this section as markdown.

Here are some notes on how you should respond in the XML section:

- Respond with the XML and nothing else
- Include all of the changed files
- Specify each file operation with CREATE, UPDATE, or DELETE
- If it is a CREATE or UPDATE include the full file code. Do not get lazy.
- Each file should include a brief change summary.
- Include the full file path
- I am going to copy/paste that entire XML section into a parser to automatically apply the changes you made, so put the XML block inside a markdown codeblock.
- Make sure to enclose the code with ![CDATA[__CODE HERE__]]

Here is how you should structure the XML:

<code_changes>
<changed_files>
<file>
<file_summary>**BRIEF CHANGE SUMMARY HERE**</file_summary>
<file_operation>**FILE OPERATION HERE**</file_operation>
<file_path>**FILE PATH HERE**</file_path>
<file_code><![CDATA[
__FULL FILE CODE HERE__
]]></file_code>
</file>
**REMAINING FILES HERE**
</changed_files>
</code_changes>

So the XML section will be:

```xml
__XML HERE__
```

---

Your Mission:


Fix screencapture command / relay:

The client:

./send_command.py --action screenshot
2025-02-04 10:54:20,115 [INFO] Sending automation command...
2025-02-04 10:54:20,126 [INFO] Command sent with Request ID: 5e5735bb-f03b-4ece-992c-307c18016d1e
2025-02-04 10:54:20,126 [INFO] Polling for answer...
2025-02-04 10:54:20,128 [INFO] Answer not ready, polling again...
2025-02-04 10:54:22,138 [INFO] Answer not ready, polling again...
2025-02-04 10:54:24,144 [INFO] Answer not ready, polling again...
2025-02-04 10:54:26,158 [INFO] Answer not ready, polling again...
2025-02-04 10:54:28,174 [INFO] Answer not ready, polling again...
2025-02-04 10:54:30,177 [INFO] Answer not ready, polling again...
2025-02-04 10:54:32,181 [INFO] Answer not ready, polling again...

The server:

1] npm run dev:plugin exited with code 0
[0] [nodemon] 3.1.9
[0] [nodemon] to restart at any time, enter `rs`
[0] [nodemon] watching path(s): src/server/**/*
[0] [nodemon] watching extensions: ts,js
[0] [nodemon] starting `node src/server/server.js`
[0] REST API and WebSocket server listening on port 8765
[0] [2025-02-04T02:57:42.037Z][Command] Queued command: {
[0]   requestId: 'e47191cd-184c-4cbf-b068-ed9eb811b53f',
[0]   action: 'screenshot',
[0]   url: undefined,
[0]   xpath: undefined,
[0]   text: undefined,
[0]   x: undefined,
[0]   y: undefined,
[0]   timestamp: '2025-02-04T02:57:42.027412Z'
[0] }

The command is received but not relayed to the chrome extension 



Programming Rules:


1. Embrace Simplicity Over Cleverness
- Write code that's immediately understandable to others
- If a solution feels complex, it probably needs simplification
- Optimize for readability first, performance second unless proven otherwise
- Avoid premature optimization

2. Focus on Core Functionality
- Start with the minimum viable solution
- Question every feature: "Is this really necessary?"
- Build incrementally based on actual needs, not hypothetical ones
- Delete unnecessary code and features

3. Leverage Existing Solutions
- Use standard libraries whenever possible
- Don't reinvent the wheel
- Choose well-maintained, popular libraries for common tasks
- Keep dependencies minimal but practical


4. Function Design
- Each function should have a single responsibility
- Keep functions short (typically under 20 lines)
- Use descriptive names that indicate purpose
- Limit number of parameters (3 or fewer is ideal)

5. Project Structure
- Keep related code together
- Use consistent file organization
- Maintain a flat structure where possible
- Group by feature rather than type

6. Code Review Guidelines
- Review for simplicity first
- Question complexity and overengineering
- Look for duplicate code and abstraction opportunities
- Ensure consistent style and naming conventions

7. Maintenance Practices
- Regularly remove unused code
- Keep dependencies updated
- Refactor when code becomes unclear
- Document only what's necessary and likely to change

Remember:
- Simple code is easier to maintain and debug
- Write code for humans first, computers second
- Add complexity only when justified by requirements
- If you can't explain your code simply, it's probably too complex


# Table of Contents
- src/extension/background.js
- src/server/server.js
- background.js
- manifest.json

## File: src/extension/background.js

- Extension: .js
- Language: javascript
- Size: 12867 bytes
- Created: 2025-02-04 10:51:18
- Modified: 2025-02-04 10:51:18

### Code

```javascript
"use strict";

const API_URL = "ws://localhost:8765/ws"; // Ensure the correct WebSocket endpoint is used
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
      console.debug("Popup not available for logging");
    });
  } catch (error) {
    console.debug("Failed to send error message", error);
  }
}

function showNotification(title, message) {
  chrome.notifications.create("", {
    type: "basic",
    iconUrl: "images/q-logo-square.png",
    title,
    message,
  });
}

function updateConnectionStatus(status) {
  try {
    chrome.runtime.sendMessage({ type: "CONNECTION_STATUS", payload: status }).catch(() => {
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
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }
    const tab = tabs[0];
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
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(resolve => setTimeout(resolve, 250));
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

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logInfo("WebSocket already connected");
    return;
  }
  ws = new WebSocket(API_URL);
  
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
    const registerMessage = {
      type: "REGISTER_EXTENSION",
      apiKey: "DEFAULT_SECRET",
    };
    try {
      ws.send(JSON.stringify(registerMessage));
    } catch (error) {
      logError("Failed to register extension: " + error.message);
    }
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

async function injectContentScriptIfNeeded(tabId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error("No active tab found");
    }
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PING" });
      logInfo("Content script already exists");
      return;
    } catch (error) {
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
                await delay(100);
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

async function processCommand(command) {
  const now = Date.now();
  const timeSinceLastCommand = now - lastCommandTime;
  if (timeSinceLastCommand < THROTTLE_DELAY) {
    await delay(THROTTLE_DELAY - timeSinceLastCommand);
  }
  lastCommandTime = Date.now();
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

async function executeCommand(command) {
  if (!command || !command.action) {
    logError("Received command with missing action. Ignoring command.");
    return;
  }
  logCommand(command);
  switch (command.action) {
    case "navigate": {
      if (!command.url) {
        throw new Error("URL is required for navigation");
      }
      try {
        const tabs = await queryTabs({ active: true, currentWindow: true });
        const activeTabId = tabs[0]?.id;
        if (!activeTabId) {
          throw new Error("No active tab found");
        }
        const navigationPromise = new Promise((resolve, reject) => {
          const listener = (tabId, info) => {
            if (tabId === activeTabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Navigation timeout'));
          }, 30000);
        });
        await updateTab(activeTabId, { url: command.url });
        await navigationPromise;
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
        await delay(100);
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
      const result = await sendMessageToContentScript(command);
      sendResponse({
        success: true,
        requestId: command.requestId,
        action: command.action,
        html: result.html,
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

function cleanup() {
  if (ws) {
    ws.close();
  }
}

chrome.runtime.onSuspend.addListener(cleanup);

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

connectWebSocket();
```

## File: src/server/server.js

- Extension: .js
- Language: javascript
- Size: 4895 bytes
- Created: 2025-02-04 10:43:25
- Modified: 2025-02-04 10:43:25

### Code

```javascript
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const API_KEY = process.env.API_KEY || "DEFAULT_SECRET";
const PORT = process.env.PORT || 8765;

// --- EXPRESS SETUP for REST API endpoints (used by the Python client)
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// In-memory storage for commands and answers
const commandQueue = []; // Queue for pending automation commands
const answers = {}; // { requestId: { result, timestamp } }
const ANSWER_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired answers every minute
setInterval(() => {
  const now = Date.now();
  for (const requestId in answers) {
    if (now - answers[requestId].timestamp > ANSWER_TTL) {
      delete answers[requestId];
      console.info(`[${new Date().toISOString()}][Cleanup] Deleted answer for requestId: ${requestId}`);
    }
  }
}, 60000);

// Endpoint for client to submit an automation command
app.post("/command", (req, res) => {
  const { apiKey, action, url, xpath, text, x, y, timestamp } = req.body;
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: "Invalid API Key" });
  }
  if (!action) {
    return res.status(400).json({ error: "Missing action" });
  }
  const requestId = uuidv4();
  const command = {
    requestId,
    action,
    url,
    xpath,
    text,
    x,
    y,
    timestamp: timestamp || new Date().toISOString()
  };
  commandQueue.push(command);
  console.info(`[${new Date().toISOString()}][Command] Queued command:`, command);
  res.json({ success: true, requestId });
});

// Endpoint for client to poll for an answer based on requestId
app.get("/command/:requestId/answer", (req, res) => {
  const { apiKey } = req.query;
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: "Invalid API Key" });
  }
  const requestId = req.params.requestId;
  if (answers[requestId]) {
    return res.json({ success: true, answer: answers[requestId].result });
  }
  res.json({ success: false, message: "Answer not ready" });
});

// Create HTTP server from Express application
const server = http.createServer(app);

// --- WEBSOCKET SETUP for the Chrome Extension
// The extension must connect to ws://localhost:8765/ws.
const wss = new WebSocketServer({ server, path: "/ws" });
let extensionConnection = null; // Registered extension's WebSocket

wss.on("connection", (ws, req) => {
  console.info(`[${new Date().toISOString()}][WS Connection] New connection from ${req.socket.remoteAddress}`);
  
  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error("Invalid JSON received via WS");
      return;
    }
    // Handle extension registration
    if (message.type === "REGISTER_EXTENSION") {
      if (message.apiKey !== API_KEY) {
        ws.send(JSON.stringify({ type: "registration", success: false, error: "Invalid API Key" }));
        ws.close();
        return;
      }
      if (extensionConnection) {
        console.info("Existing extension connection found, closing it.");
        extensionConnection.close();
      }
      extensionConnection = ws;
      ws.send(JSON.stringify({ type: "registration", success: true, timestamp: new Date().toISOString() }));
      console.info(`[${new Date().toISOString()}][WS] Extension registered.`);
      flushCommandQueue();
      return;
    }
    // Handle automation response from the extension
    if (message.type === "automation-response") {
      const payload = message.payload;
      if (payload && payload.requestId) {
        answers[payload.requestId] = { result: payload, timestamp: Date.now() };
        console.info(`[${new Date().toISOString()}][WS] Received answer for requestId: ${payload.requestId}`);
      }
      return;
    }
  });
  
  ws.on("close", () => {
    if (ws === extensionConnection) {
      console.info(`[${new Date().toISOString()}][WS] Extension disconnected.`);
      extensionConnection = null;
    }
  });
});

// Helper to flush queued commands to the extension if connected
function flushCommandQueue() {
  if (!extensionConnection || extensionConnection.readyState !== extensionConnection.OPEN) {
    console.info("Extension not connected – cannot flush queue.");
    return;
  }
  while (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    try {
      extensionConnection.send(JSON.stringify(cmd));
      console.info(`[${new Date().toISOString()}][WS Relay] Sent command:`, cmd);
    } catch (err) {
      console.error("Failed to send queued command:", err.message);
      commandQueue.unshift(cmd);
      break;
    }
  }
}

// Start the combined HTTP & WS server
server.listen(PORT, () => {
  console.log(`REST API and WebSocket server listening on port ${PORT}`);
});
```

## File: background.js

- Extension: .js
- Language: javascript
- Size: 9896 bytes
- Created: 2025-02-04 11:22:18
- Modified: 2025-02-04 11:22:18

### Code

```javascript
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
```

## File: manifest.json

- Extension: .json
- Language: json
- Size: 1331 bytes
- Created: 2025-02-04 10:14:15
- Modified: 2025-02-04 10:14:15

### Code

```json
{
  "manifest_version": 3,
  "name": "QBrowser",
  "version": "1.1.2",
  "description": "A secure browser automation extension with WebSocket support.",
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "storage",
    "notifications",
    "tabCapture"
  ],
  "host_permissions": [
    "<all_urls>",
    "ws://localhost:*/*"
  ],
  "action": {
    "default_icon": {
      "16": "images/q-logo-square.png",
      "32": "images/q-logo-square.png",
      "48": "images/q-logo-square.png",
      "128": "images/q-logo-square.png"
    },
    "default_title": "QBrowser",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "http://*/*",
        "https://*/*"
      ],
      "js": [
        "content.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "images/q-logo-square.png",
    "32": "images/q-logo-square.png",
    "48": "images/q-logo-square.png",
    "128": "images/q-logo-square.png"
  },
  "web_accessible_resources": [
    {
      "resources": [
        "images/*"
      ],
      "matches": [
        "http://*/*",
        "https://*/*"
      ]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

