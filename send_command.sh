#!/bin/bash
# send_command.sh
#
# Usage:
#   ./send_command.sh --action <action> [--xpath <xpath>] [--text <text>]
#                      [--x <x>] [--y <y>] [--url <url>]
#                      [--requestId <id>] [--timestamp <timestamp>]
#
# Example:
#   ./send_command.sh --action type --xpath '//*[@id="username"]' --text "myUserName"
#
# Note: Ensure API_KEY is set in your environment:
#   export API_KEY="YOUR_SECRET_KEY"
#

usage() {
  echo "Usage: $0 --action <action> [--xpath <xpath>] [--text <text>] [--x <x>] [--y <y>] [--url <url>] [--requestId <id>] [--timestamp <timestamp>]" 1>&2
  exit 1
}

# Initialize variables
action=""
xpath=""
text=""
x=""
y=""
url=""
requestId=""
timestamp=""

# Process command-line options
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --action) action="$2"; shift ;;
    --xpath) xpath="$2"; shift ;;
    --text) text="$2"; shift ;;
    --x) x="$2"; shift ;;
    --y) y="$2"; shift ;;
    --url) url="$2"; shift ;;
    --requestId) requestId="$2"; shift ;;
    --timestamp) timestamp="$2"; shift ;;
    *)
      echo "Unknown parameter passed: $1"
      usage
      ;;
  esac
  shift
done

# Require an action parameter
if [ -z "${action}" ]; then
  echo "Error: --action is required."
  usage
fi

# Set default timestamp and requestId if not provided
if [ -z "${timestamp}" ]; then
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
fi

if [ -z "${requestId}" ]; then
    requestId="req-$(date +%s)"
fi

# Check if API_KEY is set in the environment
if [ -z "${API_KEY}" ]; then
  echo "Error: Please set the API_KEY environment variable."
  exit 1
fi

# Build the JSON payload
json="{\"action\": \"${action}\""
if [ -n "${xpath}" ]; then
  json+=", \"xpath\": \"${xpath}\""
fi
if [ -n "${text}" ]; then
  json+=", \"text\": \"${text}\""
fi
if [ -n "${x}" ]; then
  json+=", \"x\": ${x}"
fi
if [ -n "${y}" ]; then
  json+=", \"y\": ${y}"
fi
if [ -n "${url}" ]; then
  json+=", \"url\": \"${url}\""
fi
json+=", \"requestId\": \"${requestId}\""
json+=", \"apiKey\": \"${API_KEY}\""
json+=", \"timestamp\": \"${timestamp}\""
json+="}"

# Output the JSON that will be sent so you can verify it
echo "Sending command:"
echo "$json"

# Send the JSON payload to the WebSocket server using websocat
echo "$json" | websocat ws://localhost:8765