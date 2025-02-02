# QBrowser Extension

Modern browser extension with integrated server capabilities

## Features
- 🚀 Chrome extension core functionality
- 🔌 Separate server component for backend operations
- 📦 Clean architecture separation

## Project Structure
```
qbrowser/
├── src/
│   ├── server/       # Server-side code (Express.js/Typescript)
│   ├── plugin/       # Browser extension code (Manifest v3)
│   ├── shared/       # Shared types and utilities
│   ├── content/      # Content scripts
│   └── background/   # Background service workers
├── package.json
└── manifest.json
```

## Setup
```bash
npm install

# Develop both components
npm run dev

# Build for production
npm run build
```

## Configuration
- `package.json`: Contains combined dependencies
- `manifest.json`: Browser extension configuration



## 9. Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked" and select the `dist` directory

## 10. Test the Plugin
Use a WebSocket client to send commands:
```bash
npx wscat -c ws://localhost:8765 -n '{"apiKey": "SECRET_123", "action": "click", "xpath": "//button"}'
```
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
