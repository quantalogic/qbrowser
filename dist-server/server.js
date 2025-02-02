// src/server/server.ts
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
dotenv.config();
const PORT = 8765;
const API_KEY = process.env.API_KEY || 'DEFAULT_SECRET';
const wss = new WebSocketServer({ port: PORT });
console.info(`WebSocket server is listening on port ${PORT}`);
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.info(`New connection from ${clientIp}`);
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            // Validate API Key
            if (message.apiKey !== API_KEY) {
                ws.send(JSON.stringify({ error: 'Unauthorized' }));
                ws.close();
                return;
            }
            console.info('Received valid command:', message);
            // Relay the command to Chrome extension if required.
            // Placeholder: Insert your command routing logic here.
            // The same 'message' may be forwarded to an extension endpoint.
        }
        catch (error) {
            console.error('Invalid message format:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
    ws.on('close', () => {
        console.info(`Connection closed from ${clientIp}`);
    });
});
