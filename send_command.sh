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

# Helper function to print usage and exit
usage() {
  echo "Usage: $0 --action <action> [--xpath <xpath>] [--text <text>] [--x <x>] [--y <y>] [--url <url>] [--requestId <id>] [--timestamp <timestamp>]" 1>&2
  exit 1
}

# Verify that websocat is installed
if ! command -v websocat >/dev/null 2>&1; then
  echo "Error: websocat command not found. Please install websocat and try again." 1>&2
  exit 1
fi

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
      echo "Unknown parameter passed: $1" 1>&2
      usage
      ;;
  esac
  shift
done

# Require the --action parameter
if [ -z "${action}" ]; then
  echo "Error: --action is required." 1>&2
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
  echo "Error: Please set the API_KEY environment variable." 1>&2
  exit 1
fi

# Build the JSON payload using printf for safety with quotes.
json=$(printf '{
  "action": "%s",
  "xpath": "%s",
  "text": "%s",
  "x": %s,
  "y": %s,
  "url": "%s",
  "requestId": "%s",
  "apiKey": "%s",
  "timestamp": "%s"
}' "${action}" "${xpath}" "${text}" "${x:-null}" "${y:-null}" "${url}" "${requestId}" "${API_KEY}" "${timestamp}")

# Optionally remove empty or null keys using jq if available.
if command -v jq >/dev/null 2>&1; then
  json=$(echo "$json" | jq 'del(.xpath|select(.=="")) | del(.text|select(.=="")) | del(.url|select(.=="")) | del(.x|select(.==null)) | del(.y|select(.==null))')
fi

# Remove newline characters to ensure compact JSON output.
oneline_json=$(echo "$json" | tr -d '\n')

echo "Sending command:"
echo "$oneline_json"

# Send the JSON payload to the WebSocket server using websocat.
# Use printf without a trailing newline and -1 for single-shot transmission.
printf "%s" "$oneline_json" | websocat -1 ws://localhost:8765