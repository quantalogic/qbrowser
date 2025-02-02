let ws;
let reconnectInterval = 1000;

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8765');

    ws.addEventListener('open', () => {
        console.log('Connected to WebSocket server');
        reconnectInterval = 1000;
    });

    ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        scheduleReconnect();
    });

    ws.addEventListener('close', (event) => {
        console.log(`WebSocket closed: ${event.code} ${event.reason}`);
        scheduleReconnect();
    });

    ws.addEventListener('message', async (event) => {
        console.log('Received message from server:', event.data);
        try {
            const command = JSON.parse(event.data);
            await processCommand(command);
        } catch (error) {
            console.error('Failed to process command:', error);
            showNotification('Error', 'Failed to process command');
        }
    });
}

function scheduleReconnect() {
    setTimeout(() => {
        console.log(`Attempting reconnect in ${reconnectInterval}ms`);
        connectWebSocket();
        reconnectInterval = Math.min(reconnectInterval * 2, 10000);
    }, reconnectInterval);
}

function showNotification(title, message) {
    chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'icon.png',
        title,
        message,
    });
}

function sendResponse(response) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Sending response:', response);
        ws.send(JSON.stringify({
            type: 'automation-response',
            payload: response
        }));
    } else {
        console.error('WebSocket is not connected. Cannot send response:', response);
    }
}

async function processCommand(command) {
    if (!command.action) {
        throw new Error('Command missing action');
    }

    try {
        switch (command.action) {
            case 'navigate':
                if (!command.url) {
                    throw new Error('URL is required for navigation');
                }
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tabs[0]?.id) {
                    throw new Error('No active tab found');
                }
                
                await new Promise((resolve, reject) => {
                    chrome.tabs.update(tabs[0].id, { url: command.url }, (tab) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        showNotification('Navigation', `Navigating to ${command.url}`);
                        resolve(tab);
                    });
                });

                sendResponse({
                    success: true,
                    requestId: command.requestId,
                    action: 'navigate',
                    message: `Successfully navigated to ${command.url}`
                });
                break;

            case 'screenshot':
                const dataUrl = await new Promise((resolve, reject) => {
                    chrome.tabs.captureVisibleTab({ format: 'png' }, (result) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        resolve(result);
                    });
                });

                sendResponse({
                    success: true,
                    requestId: command.requestId,
                    screenshot: dataUrl,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'type':
            case 'click':
            case 'clickAtCoordinates':
                const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!activeTabs[0]?.id) {
                    throw new Error('No active tab found');
                }

                await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(
                        activeTabs[0].id,
                        { type: 'automation-command', payload: command },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            resolve(response);
                        }
                    );
                });

                sendResponse({
                    success: true,
                    requestId: command.requestId,
                    action: command.action,
                    message: `Successfully executed ${command.action} command`
                });
                break;

            default:
                throw new Error(`Unknown command action: ${command.action}`);
        }
    } catch (error) {
        console.error('Command execution failed:', error);
        sendResponse({
            success: false,
            requestId: command.requestId,
            error: error.message,
            action: command.action
        });
    }
}

// Initialize WebSocket connection
connectWebSocket();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('QBrowser extension installed');
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'QUERY_TABS') {
        chrome.tabs.query({}, tabs => {
            sendResponse({ tabs });
        });
        return true;
    }
});
