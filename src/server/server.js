// src/server/server.js

/*
  A stateful WebSocket server that:
    – Relays automation commands from clients to a registered browser extension.
    – Stores automation responses keyed by requestId (with a TTL) so that clients
      may later query for the result even if their connection closes.

Message types:
  • "REGISTER_EXTENSION": Used by the extension to register. (API key verified.)
  • "automation-command": Sent by a client (must include a unique requestId).
  • "automation-response": Sent by the extension in reply.
       The server forwards it to the originating client and stores it.
  • "query-response": Sent by a client to retrieve a stored result.
*/

import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 8765;
const API_KEY = process.env.API_KEY || "DEFAULT_SECRET";

// Logger utility.
const logger = {
  info: (context, message) =>
    console.info(`[${new Date().toISOString()}][${context}]`, message),
  error: (context, message) =>
    console.error(`[${new Date().toISOString()}][${context}]`, message),
};

// Connection state constants.
const ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
  ERROR: "error",
};

let extensionStatus = {
  state: ConnectionState.DISCONNECTED,
  lastUpdated: Date.now(),
};

let extensionConnection = null; // The registered extension's WebSocket.
const clientConnections = new Map(); // Maps requestId => client WebSocket.

// In-memory store for automation responses (keyed by requestId).
const storedResults = new Map();
// TTL (in milliseconds) for stored responses.
const RESULT_TTL = 5 * 60 * 1000; // 5 minutes

const HEARTBEAT_INTERVAL = 30000; // 30 seconds.
const HEARTBEAT_TIMEOUT = 35000; // 35 seconds.

// Clean up expired stored results.
setInterval(() => {
  const now = Date.now();
  for (const [requestId, { timestamp }] of storedResults.entries()) {
    if (now - timestamp > RESULT_TTL) {
      storedResults.delete(requestId);
      logger.info(
        "Cleanup",
        `Deleted stored result for requestId: ${requestId}`
      );
    }
  }
}, 60000);

// Check extension heartbeat.
setInterval(() => {
  if (extensionConnection) {
    const now = Date.now();
    if (now - extensionConnection.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      logger.error(
        "Extension",
        "Heartbeat timeout, closing extension connection."
      );
      extensionConnection.ws.close();
      extensionConnection = null;
      updateExtensionStatus(ConnectionState.DISCONNECTED);
    }
  }
}, HEARTBEAT_INTERVAL);

/**
 * Sends an error response to a client.
 */
function sendErrorResponse(ws, error, requestId) {
  const errMsg = {
    success: false,
    error,
    requestId,
    timestamp: new Date().toISOString(),
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errMsg));
  }
}

/**
 * Updates the extension status and notifies connected clients.
 */
function updateExtensionStatus(status, errorInfo) {
  extensionStatus = {
    state: status,
    lastError: errorInfo,
    lastUpdated: Date.now(),
  };
  // Optionally notify clients.
  for (const clientWs of clientConnections.values()) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: "extension_status",
          status: extensionStatus,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }
}

/**
 * Handles incoming messages from any connection.
 */
function handleMessage(ws, messageStr) {
  let message;
  try {
    message = JSON.parse(messageStr);
  } catch (err) {
    logger.error("MessageHandler", "Invalid JSON received");
    ws.send(
      JSON.stringify({
        success: false,
        error: "Invalid JSON format",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Process extension registration.
  if (message.type === "REGISTER_EXTENSION") {
    if (message.apiKey !== API_KEY) {
      updateExtensionStatus(ConnectionState.ERROR, "Invalid API key");
      ws.close();
      return;
    }
    if (extensionConnection) {
      updateExtensionStatus(ConnectionState.DISCONNECTING);
      extensionConnection.ws.close();
    }
    extensionConnection = { ws, lastHeartbeat: Date.now() };
    updateExtensionStatus(ConnectionState.CONNECTED);
    ws.send(
      JSON.stringify({
        type: "registration",
        success: true,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // For non-registration messages, verify API key.
  if (message.apiKey !== API_KEY) {
    sendErrorResponse(ws, "Unauthorized access attempt", message.requestId);
    ws.close();
    return;
  }

  // Process an automation-response from the extension.
  if (message.type === "automation-response") {
    if (message.payload && message.payload.requestId) {
      storedResults.set(message.payload.requestId, {
        result: message,
        timestamp: Date.now(),
      });
      const clientWs = clientConnections.get(message.payload.requestId);
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(message));
        clientConnections.delete(message.payload.requestId);
      }
    }
    return;
  }

  // Process a query for a stored result.
  if (message.type === "query-response") {
    const resultEntry = storedResults.get(message.requestId);
    if (resultEntry) {
      ws.send(JSON.stringify(resultEntry.result));
    } else {
      ws.send(
        JSON.stringify({
          success: false,
          error: "No stored result found for this requestId",
          requestId: message.requestId,
          timestamp: new Date().toISOString(),
        })
      );
    }
    return;
  }

  // Process an automation-command from a client.
  if (message.type === "automation-command") {
    if (message.requestId) {
      clientConnections.set(message.requestId, ws);
    }
    if (
      !extensionConnection ||
      extensionConnection.ws.readyState !== WebSocket.OPEN
    ) {
      const errMsg = `Extension not connected (status: ${extensionStatus.state})`;
      logger.error("Relay", errMsg);
      sendErrorResponse(ws, errMsg, message.requestId);
      return;
    }
    logger.info("Relay", { command: message });
    extensionConnection.ws.send(JSON.stringify(message));
    return;
  }

  // Unknown message type.
  ws.send(
    JSON.stringify({
      success: false,
      error: "Unknown message type",
      timestamp: new Date().toISOString(),
    })
  );
}

const wss = new WebSocketServer({ port: PORT });
logger.info("Server", `WebSocket server listening on port ${PORT}`);

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 7);
  const ip = req.socket.remoteAddress;
  logger.info("Connection", { clientId, ip, headers: req.headers });

  ws.on("ping", () => ws.pong());
  ws.on("pong", () => {
    if (extensionConnection && extensionConnection.ws === ws) {
      extensionConnection.lastHeartbeat = Date.now();
    }
  });

  ws.on("message", (data) => {
    const messageStr = data.toString();
    logger.info("Received", { clientId, message: messageStr });
    handleMessage(ws, messageStr);
  });

  ws.on("close", () => {
    if (extensionConnection && extensionConnection.ws === ws) {
      extensionConnection = null;
      updateExtensionStatus(ConnectionState.DISCONNECTED);
      for (const clientWs of clientConnections.values()) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "extension_status",
              status: "disconnected",
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    }
    logger.info("Disconnection", { clientId, ip });
  });

  ws.on("error", (err) => {
    logger.error("WebSocketError", { clientId, error: err.message });
    if (extensionConnection && extensionConnection.ws === ws) {
      updateExtensionStatus(ConnectionState.ERROR, err.message);
    }
  });
});

setInterval(() => {
  if (
    extensionConnection &&
    extensionConnection.ws.readyState === WebSocket.OPEN
  ) {
    try {
      extensionConnection.ws.ping();
    } catch (err) {
      updateExtensionStatus(ConnectionState.ERROR, err.message);
    }
  }
}, HEARTBEAT_INTERVAL);
