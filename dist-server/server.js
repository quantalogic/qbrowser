import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
dotenv.config();
const wss = new WebSocketServer({ port: 8765 });
const API_KEY = process.env.API_KEY || 'DEFAULT_SECRET';
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`New connection from ${clientIp}`);
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.apiKey !== API_KEY) {
                ws.send(JSON.stringify({ error: 'Unauthorized' }));
                ws.close();
                return;
            }
            console.log('Received valid command:', message);
            // Add additional command processing or routing logic here as needed
        }
        catch (error) {
            console.error('Invalid message format:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
    ws.on('close', () => {
        console.log(`Connection closed from ${clientIp}`);
    });
});
