Below are sample Bash commands that send each sample JSON command to the server over a WebSocket connection using [websocat](https://github.com/vi/websocat). If you prefer to use another client (e.g., [wscat](https://www.npmjs.com/package/wscat)), you can adjust the syntax accordingly.

> Note: Make sure to replace "YOUR_SECRET_KEY" with your actual API key.

---

## 1. Type into an Input Element

```bash
echo "{\"action\": \"type\", \"xpath\": \"//*[@id=\\\"username\\\"]\", \"text\": \"myUserName\", \"requestId\": \"req-001\", \"apiKey\": \"${API_KEY}\", \"timestamp\": \"2025-02-02T12:00:00Z\"}" | websocat ws://localhost:8765
```

---

## 2. Click an Element by XPath

```bash
echo "{\"action\": \"click\", \"xpath\": \"//*[@id=\\\"submit-button\\\"]\", \"requestId\": \"req-002\", \"apiKey\": \"${API_KEY}\", \"timestamp\": \"2025-02-02T12:05:00Z\"}" | websocat ws://localhost:8765
```

---

## 3. Navigate to a URL

```bash
echo '{"action": "navigate", "url": "https://example.com", "requestId": "req-003", "apiKey": "${API_KEY}", "timestamp": "2025-02-02T12:10:00Z"}' | websocat ws://localhost:8765
```

---

## 4. Click at Specific Coordinates

```bash
echo "{\"action\": \"clickAtCoordinates\", \"x\": 150, \"y\": 300, \"requestId\": \"req-004\", \"apiKey\": \"${API_KEY}\", \"timestamp\": \"2025-02-02T12:15:00Z\"}" | websocat ws://localhost:8765
```

---

## 5. Capture a Screenshot of the Active Tab

```bash
echo '{"action": "screenshot", "requestId": "req-005", "apiKey": "YOUR_SECRET_KEY", "timestamp": "2025-02-02T12:20:00Z"}' | websocat ws://localhost:8765
```

---

## 6. OCR Command (Planned Implementation)

```bash
echo '{"action": "ocr", "xpath": "//*[@id=\"target-element\"]", "requestId": "req-006", "apiKey": "YOUR_SECRET_KEY", "timestamp": "2025-02-02T12:25:00Z"}' | websocat ws://localhost:8765
```

---

Each of these commands sends the corresponding JSON command as a single message to the WebSocket server at ws://localhost:8765. Adjust the JSON content as needed for your testing or automation scenarios. Enjoy experimenting with QBrowser!