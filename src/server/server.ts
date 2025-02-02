import { WebSocketServer } from 'ws';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Add error interface
interface ExtendedError extends Error {
  stack?: string;
}

// Convert __filename and __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const PORT = 8765;
const API_KEY = process.env.API_KEY || 'DEFAULT_SECRET';

// Add logging utility
const logger = {
  info: (context: string, message: any) => {
    console.info(`[${new Date().toISOString()}][${context}]`, message);
  },
  error: (context: string, message: any) => {
    console.error(`[${new Date().toISOString()}][${context}]`, message);
  }
};

const wss = new WebSocketServer({ port: PORT });
logger.info('Server', `WebSocket server is listening on port ${PORT}`);

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(7);
  const clientIp = req.socket.remoteAddress;
  logger.info('Connection', {
    clientId,
    ip: clientIp,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.info('Received', {
        clientId,
        message,
        timestamp: new Date().toISOString()
      });

      // Validate API Key
      if (message.apiKey !== API_KEY) {
        const error = 'Unauthorized access attempt';
        logger.error('Auth', {
          clientId,
          error,
          providedKey: message.apiKey
        });
        ws.send(JSON.stringify({ 
          error,
          timestamp: new Date().toISOString()
        }));
        ws.close();
        return;
      }

      // Log command details
      logger.info('Command', {
        clientId,
        action: message.action,
        requestId: message.requestId,
        timestamp: new Date().toISOString(),
        details: {
          url: message.url,
          selector: message.selector,
          xpath: message.xpath,
          coordinates: message.x && message.y ? `(${message.x},${message.y})` : undefined
        }
      });

      // Simulate Chrome extension relay and response
      // In reality, this would interact with your Chrome extension
      try {
        logger.info('Relay', {
          clientId,
          status: 'SENDING_TO_EXTENSION',
          command: message
        });

        // Simulate extension processing time
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simulate extension response
        const extensionResponse = {
          success: true,
          requestId: message.requestId,
          timestamp: new Date().toISOString(),
          action: message.action,
          result: `Simulated success for ${message.action}`,
          message: `Command ${message.action} executed successfully`
        };

        logger.info('ExtensionResponse', {
          clientId,
          response: extensionResponse
        });

        ws.send(JSON.stringify(extensionResponse));
      } catch (err) {
        const extensionError = err as ExtendedError;
        logger.error('ExtensionError', {
          clientId,
          error: extensionError.message || 'Unknown error',
          command: message,
          stack: extensionError.stack || 'No stack trace'
        });

        ws.send(JSON.stringify({
          success: false,
          error: extensionError.message || 'Unknown error',
          requestId: message.requestId,
          timestamp: new Date().toISOString()
        }));
      }
      
    } catch (err) {
      const error = err as ExtendedError;
      logger.error('MessageError', {
        clientId,
        error: error.message || 'Unknown error',
        data: data.toString(),
        stack: error.stack || 'No stack trace'
      });
      
      ws.send(JSON.stringify({
        success: false,
        error: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    logger.info('Disconnection', {
      clientId,
      ip: clientIp,
      timestamp: new Date().toISOString()
    });
  });

  ws.on('error', (err: Error) => {
    const error = err as ExtendedError;
    logger.error('WebSocketError', {
      clientId,
      error: error.message || 'Unknown error',
      stack: error.stack || 'No stack trace'
    });
  });
});