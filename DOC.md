Below is a complete documentation for the project:

---

# QBrowser Documentation

QBrowser is a Chrome extension and companion server component designed to automate browser interactions over a WebSocket connection. The extension can interact with the active tab by executing JavaScript, selecting elements with XPath, typing text, clicking elements, clicking at specific coordinates, and even capturing screenshots.

This documentation covers the project's objectives, setup instructions, file structure, components, commands, and guidelines for development.

---

## Table of Contents

- [Introduction](#introduction)
- [Project Overview](#project-overview)
- [Features](#features)
- [File Structure](#file-structure)
- [Components](#components)
  - [Chrome Extension](#chrome-extension)
  - [Server](#server)
- [Commands and Communication](#commands-and-communication)
- [Installation](#installation)
- [Development and Build](#development-and-build)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)
- [License](#license)

---

## Introduction

QBrowser bridges the communication between an external command provider and an active Chrome tab. Commands are sent over a WebSocket connection from an external server to the Chrome extension. Once received, the extension interprets and executes commands (e.g., locating elements via XPath, typing into fields, performing clicks, etc.) and returns results or feedback to the server.

---

## Project Overview

The project consists of two primary components:

1. **Chrome Extension**  
   - Acts as the client that executes commands on the active tab.
   - Manages background and content scripts.
   - Supports operations such as fetching HTML content, executing JavaScript, interacting with DOM elements, and capturing screenshots.

2. **Server Component**  
   - Listens for incoming WebSocket connections.
   - Validates commands based on an API key.
   - Forwards commands to the extension and handles command responses.

---

## Features

The extension currently supports the following capabilities:

- **HTML Content Extraction:** Retrieve HTML content from the active tab.
- **JavaScript Execution:** Execute arbitrary JavaScript code on the active tab.
- **XPath Selection:** Identify an element on the page using an XPath selector.
- **Text Input:** Type a specific text into a selected element.
- **Element Click:** Simulate user click on a targeted element.
- **Coordinate Click:** Click at specified screen coordinates.
- **Screenshot Capture:** Capture a screenshot of the active tab and relay it back to the server.
- **OCR Operations (Planned):** Future implementation of optical character recognition.

The server component provides rate limiting based on client IP and secure communication via an API key.

---

## File Structure

Below is a summary of the important files in the project:

```
/project-root
├── src/
│   ├── types.ts                  # Type definitions and interfaces for commands and messages
│   ├── background/
│   │   └── main.ts               # Background script establishing the WebSocket connection
│   ├── content/
│   │   └── content.ts            # Content script that listens for messages and manipulates DOM elements
│   └── server/
│       └── server.ts             # Server code that handles incoming WebSocket connections and processes commands
├── manifest.json                 # Chrome Extension manifest v3
├── package.json                  # Project dependencies and NPM scripts
├── tsconfig.json                 # TypeScript configuration for the extension
├── webpack.config.js             # Webpack configuration for building the extension scripts
```

Each file plays an important role in the overall functionality of the project:

- **src/types.ts:**  
  Contains type definitions such as `CommandAction`, `Command`, `SuccessResponse`, and generic message structures (`ChromeMessage`).

- **src/background/main.ts:**  
  Manages the WebSocket connection lifecycle, including connection establishment, error handling, and reconnect logic.

- **src/content/content.ts:**  
  Listens for messages (e.g., automation commands) on the window and executes commands like text input based on provided XPath selectors.

- **src/server/server.ts:**  
  Implements a WebSocket server listening on port 8765. Incoming messages are validated against the `API_KEY` before processing.

- **manifest.json:**  
  The extension manifest defines permissions, background service worker, content scripts, and host permissions.

- **package.json:**  
  Defines project dependencies, development tools (webpack, nodemon), and scripts for building and running the server and extension.

- **tsconfig.json:**  
  The TypeScript compile configuration ensuring compatibility with ES2020, module resolution, and strict type checking.

- **webpack.config.js:**  
  Configures the bundling process for background and content scripts, and copies the manifest file to the build output.

---

## Components

### Chrome Extension

The extension has two main parts:

1. **Background Script (src/background/main.ts):**  
   - Initializes a WebSocket connection to the server.
   - Implements automatic reconnection with exponential backoff.
   - Acts as the bridge between the WebSocket commands and the content script functionalities.

2. **Content Script (src/content/content.ts):**  
   - Listens to messages sent to the window.
   - Validates XPath expressions before selecting DOM elements.
   - Executes command instructions like filling text input fields.
   - Sends a response message back to indicate success or error status.

### Server

- **Server Script (src/server/server.ts):**  
  - Sets up a WebSocket server on port 8765.
  - Uses environment variables (e.g., `API_KEY`) for command validation.
  - Implements basic logging and error handling, including IP based rate limiting.
  - Future enhancements may include deeper command routing and advanced processing.

---

## Commands and Communication

Communication between the extension and server is handled via WebSocket messages. The following types and commands are defined in the project:

- **Command Types** (from `src/types.ts`):
  - `click`
  - `type`
  - `navigate`
  - `screenshot`
  - `ocr`

- **Message Format:**  
  Both the extension and server use structured messages that include a `type`, a `payload`, and optional `metadata`. A typical successful response message contains:
  
  ```json
  {
    "success": true,
    "timestamp": "<timestamp>",
    "requestId": "<unique-id>"
  }
  ```

- **Example Command (Type Action):**  
  The content script listens for a message like the following to type text into an input field:

  ```typescript
  {
    action: 'type',
    xpath: '//*[@id="target-input"]',
    text: 'Hello, World!',
    requestId: 'unique_request_id'
  }
  ```

Upon receiving this command:
- The content script validates the XPath.
- Finds the appropriate element.
- Sets its value to "Hello, World!".
- Posts a success response back to the window for further processing.

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/yourusername/qbrowser.git
   cd qbrowser
   ```

2. **Install Dependencies:**

   Make sure you have Node.js installed. Then install all dependencies:

   ```bash
   npm install
   ```

3. **Configure Environment Variables:**

   Create a `.env` file in the project root to set the server `API_KEY` (if desired):

   ```dotenv
   API_KEY=YOUR_SECRET_KEY
   ```

---

## Development and Build

### Building the Project

- **Build Command:**

  The build command compiles both the server and Chrome extension:

  ```bash
  npm run build
  ```

  - `npm run build:server` compiles the server code.
  - `npm run build:plugin` uses Webpack to bundle the background and content scripts into the `dist` folder.

### Running in Development

- **Start Development Mode:**

  Use concurrently to watch both server and extension changes:

  ```bash
  npm run dev
  ```

  This script runs:
  - `npm run dev:server`: Watches and reloads the server code (using nodemon and ts-node).
  - `npm run dev:plugin`: Starts Webpack in watch mode for the extension.

### Testing the Extension

1. **Load the Extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable "Developer mode."
   - Click "Load unpacked" and select the project’s `dist` folder (where `background/main.js`, `content/content.js`, and `manifest.json` reside).

2. **Interact with the Extension:**
   - With the extension loaded, trigger commands via the WebSocket server or by simulating messages in the browser (use the browser console or an automated testing tool).

---

## Usage

1. **Establishing WebSocket Connection:**
   - The background script automatically attempts to connect to the server at `ws://localhost:8765`.
   - In the event of errors or disconnections, the script employs a reconnect strategy with exponential backoff.

2. **Sending Commands:**
   - Commands must include valid properties (e.g., `action`, `xpath`, `text`, and `requestId`).
   - The server validates requests using an API key and logs actions for audit and debugging purposes.

3. **Command Example (Type a Field):**

   Here is a sample message that you might send to the extension via the server:

   ```json
   {
     "action": "type",
     "xpath": "//*[@id='username']",
     "text": "myUserName",
     "requestId": "12345",
     "apiKey": "YOUR_SECRET_KEY"
   }
   ```

4. **Response:**
   - Upon successfully executing a command, the extension sends a message back indicating success.
   - For example:

   ```json
   {
     "type": "automation-response",
     "requestId": "12345",
     "success": true,
     "timestamp": "2025-01-31T16:20:18Z"
   }
   ```

---

## Troubleshooting

- **WebSocket Connection Issues:**
  - Ensure that the server is running and accessible at the configured URL (`ws://localhost:8765`).
  - Check console logs for errors and verify that the correct API key is used.

- **XPath Errors:**
  - Confirm the provided XPath is valid and corresponds to an element in the active tab.
  - Use browser developer tools to test XPath queries.

- **Build Errors:**
  - Verify that all dependencies are installed correctly.
  - Check TypeScript and Webpack configuration for compatibility issues.

- **Permission and Manifest Problems:**
  - Ensure that the Chrome extension manifest (manifest.json) grants the necessary permissions (scripting, activeTab, storage, host permissions).

---

## Future Enhancements

- **Additional Commands:**  
  - Implement support for navigation, coordinate-based clicking, screenshot capture, and OCR action processing.
- **Enhanced Security:**  
  - Improve API key management and rate limiting for high-security environments.
- **User Interface:**  
  - Develop an options or popup interface for manual command testing and configuration.

---

## License

This project is provided under the MIT License. See the [LICENSE](LICENSE) file for details.

---

By following this documentation, developers can set up, build, and further develop QBrowser to automate browser interactions efficiently via the Chrome extension and WebSocket server. Enjoy automating your browser tasks!