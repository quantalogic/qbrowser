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
  flushCommandQueue(); // Immediately attempt to send command if extension is connected
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

// Add heartbeat helper functions
function noop() {}
function heartbeat() {
  this.isAlive = true;
}

let extensionConnection = null; // Registered extension's WebSocket

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
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
    // Handle heartbeat acknowledgment
    if (message.type === "heartbeat_ack") {
      ws.isAlive = true;
      return;
    }
    // Handle command routing
    if (message.type === "command-routing") {
      switch (message.command) {
        case 'get-html-no-scripts':
          ws.send(JSON.stringify({
            type: 'command',
            command: message.command,
            requestId: message.requestId
          }));
          break;
        default:
          console.error(`Unknown command: ${message.command}`);
      }
    }
  });
  
  ws.on("close", () => {
    if (ws === extensionConnection) {
      console.info(`[${new Date().toISOString()}][WS] Extension disconnected.`);
      extensionConnection = null;
    }
  });
});

// Add heartbeat ping interval for all connected clients
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.info(`[${new Date().toISOString()}][WS] Terminating unresponsive connection.`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.send(JSON.stringify({ type: "heartbeat" }));
  });
}, 30000);

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