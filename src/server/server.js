// src/server/server.js

import { WebSocketServer, WebSocket } from "ws";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

config();

// Convert __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 8765;
const API_KEY = process.env.API_KEY || "DEFAULT_SECRET";

// Logging utility
const logger = {
  info: (context, message) => {
    console.info(`[${new Date().toISOString()}][${context}]`, message);
  },
  error: (context, message) => {
    console.error(`[${new Date().toISOString()}][${context}]`, message);
  },
};

// Connection state constants (added DISCONNECTING)
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

let extensionConnection = null; // Object containing ws, lastHeartbeat, status
const clientConnections = new Map();

// Heartbeat interval settings (in milliseconds)
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 35000;

// Periodically check extension connection's heartbeat
setInterval(() => {
  if (extensionConnection) {
    const now = Date.now();
    if (now - extensionConnection.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      logger.error("Extension", "Extension heartbeat timeout - closing connection");
      extensionConnection.ws.close();
      extensionConnection = null;
      updateExtensionStatus(ConnectionState.DISCONNECTED);
    }
  }
}, HEARTBEAT_INTERVAL);

// Helper to send error responses
function sendErrorResponse(ws, error, requestId) {
  const errorResponse = {
    success: false,
    error,
    requestId,
    timestamp: new Date().toISOString(),
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorResponse));
  }
}

// Update extension status and notify all clients about the change
function updateExtensionStatus(status, error) {
  extensionStatus = {
    state: status,
    lastError: error,
    lastUpdated: Date.now(),
  };

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

// Create the WebSocket server
const wss = new WebSocketServer({ port: PORT });
logger.info("Server", `WebSocket server is listening on port ${PORT}`);

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).substring(7);
  const clientIp = req.socket.remoteAddress;
  logger.info("Connection", {
    clientId,
    ip: clientIp,
    headers: req.headers,
    timestamp: new Date().toISOString(),
  });

  // Setup ping/pong handling
  ws.on("ping", () => ws.pong());
  ws.on("pong", () => {
    if (extensionConnection && extensionConnection.ws === ws) {
      extensionConnection.lastHeartbeat = Date.now();
    }
  });

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.info("Received", {
        clientId,
        message,
        timestamp: new Date().toISOString(),
      });

      // Handle extension registration message
      if (message.type === "REGISTER_EXTENSION") {
        if (message.apiKey !== API_KEY) {
          updateExtensionStatus(ConnectionState.ERROR, "Invalid API key");
          ws.close();
          return;
        }

        // If an extension connection already exists, close it properly
        if (extensionConnection) {
          updateExtensionStatus(ConnectionState.DISCONNECTING);
          extensionConnection.ws.close();
        }

        extensionConnection = {
          ws,
          lastHeartbeat: Date.now(),
          status: {
            state: ConnectionState.CONNECTED,
            lastUpdated: Date.now(),
          },
        };

        updateExtensionStatus(ConnectionState.CONNECTED);

        // Start a heartbeat interval for this connection
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            clearInterval(heartbeat);
          }
        }, HEARTBEAT_INTERVAL);

        return;
      }

      // Validate API Key for client messages
      if (message.apiKey !== API_KEY) {
        sendErrorResponse(ws, "Unauthorized access attempt");
        ws.close();
        return;
      }

      // Ensure the extension connection is active and open
      if (
        !extensionConnection ||
        extensionConnection.ws.readyState !== WebSocket.OPEN
      ) {
        const errorMsg = `Chrome extension not connected (Status: ${extensionStatus.state})`;
        logger.error("Relay", { clientId, error: errorMsg, extensionStatus });
        sendErrorResponse(ws, errorMsg, message.requestId);
        return;
      }

      // Map client connection by requestId for later response routing
      clientConnections.set(message.requestId, ws);

      // Relay the command message to the extension
      logger.info("Relay", {
        clientId,
        status: "SENDING_TO_EXTENSION",
        command: message,
      });
      extensionConnection.ws.send(JSON.stringify(message));
    } catch (err) {
      logger.error("MessageError", {
        clientId,
        error: err && err.message ? err.message : "Unknown error",
        data: data.toString(),
        stack: err && err.stack ? err.stack : "No stack trace",
      });
      ws.send(
        JSON.stringify({
          success: false,
          error: "Invalid message format",
          timestamp: new Date().toISOString(),
        })
      );
    }
  });

  // If this connection is the extension, handle its responses
  if (extensionConnection && ws === extensionConnection.ws) {
    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        const clientWs = clientConnections.get(response.requestId);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
          clientConnections.delete(response.requestId);
        }
      } catch (err) {
        logger.error("ResponseError", {
          error: err && err.message ? err.message : "Unknown error",
          data: data.toString(),
        });
      }
    });
  }

  ws.on("close", () => {
    if (extensionConnection && extensionConnection.ws === ws) {
      extensionConnection = null;
      updateExtensionStatus(ConnectionState.DISCONNECTED);

      // Notify all connected clients about the extension disconnecting
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
    logger.info("Disconnection", {
      clientId,
      ip: clientIp,
      timestamp: new Date().toISOString(),
    });
  });

  ws.on("error", (err) => {
    if (extensionConnection && extensionConnection.ws === ws) {
      updateExtensionStatus(ConnectionState.ERROR, err.message);
    }
    logger.error("WebSocketError", {
      clientId,
      error: err.message || "Unknown error",
      stack: err.stack || "No stack trace",
    });
  });
});

// Health check: periodically send a ping to the extension connection if active
setInterval(() => {
  if (extensionConnection && extensionConnection.ws.readyState === WebSocket.OPEN) {
    try {
      extensionConnection.ws.ping();
    } catch (err) {
      updateExtensionStatus(ConnectionState.ERROR, err.message);
    }
  }
}, HEARTBEAT_INTERVAL);