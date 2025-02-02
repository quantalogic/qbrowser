#!/bin/bash


# Send a message to automate typing text into an input field
MESSAGE='{
  "apiKey": "DEFAULT_SECRET",
  "action": "type",
  "xpath": "//input[@id='username']",
  "text": "testuser",
  "requestId": "12345"
}'

echo "$MESSAGE" | websocat ws://localhost:8765
