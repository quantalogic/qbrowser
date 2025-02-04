#!/usr/bin/env -S uv run

# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "argparse",
#     "websockets",
#     "asyncio",
#     "uuid",
#     "logging"
# ]
# ///

"""
send_command.py

A command-line client to send browser automation commands via WebSocket
and query for the answer by request-id if needed.

Usage as an automation command:
    ./send_command.py --action screenshot [--xpath XPATH] [--text TEXT] [--url URL]

Usage as a query (retrieve a stored answer):
    ./send_command.py --query <requestId>

Make sure the API_KEY environment variable is set.
"""

import argparse
import asyncio
import base64
import json
import logging
import os
import sys
from datetime import datetime, timezone
import uuid
import websockets

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('send_command.log')
    ]
)
logger = logging.getLogger(__name__)

def generate_request_id() -> str:
    return str(uuid.uuid4())

def save_screenshot(data: str) -> str:
    if isinstance(data, dict) and "data" in data:
        data = data["data"]
    if isinstance(data, str) and data.startswith("data:image/png;base64,"):
        data = data.split(",", 1)[1]
    else:
        raise ValueError("Invalid screenshot data format")
    filename = f"screenshot-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    with open(filename, "wb") as f:
        f.write(base64.b64decode(data))
    return filename

def handle_response(response: dict) -> None:
    if "payload" in response:
        response = response["payload"]
    print("\nCommand Response:")
    print(f"Status: {response.get('success', False)}")
    print(f"Action: {response.get('action', 'unknown')}")
    print(f"Timestamp: {response.get('timestamp')}")
    if error := response.get("error"):
        print("\nError:")
        print(error)
        sys.exit(1)
    if html := response.get("html"):
        snippet = "\n".join(html.splitlines()[:50])
        print("\nHTML Content (first 50 lines):")
        print(snippet)
        filename = f"page-{datetime.now().strftime('%Y%m%d-%H%M%S')}.html"
        with open(filename, "w") as f:
            f.write(html)
        print(f"Full HTML saved to {filename}")
    if screenshot := response.get("screenshot"):
        try:
            filename = save_screenshot(screenshot)
            print(f"\nScreenshot saved as: {filename}")
        except Exception as e:
            print(f"\nError saving screenshot: {e}")
    if message := response.get("message"):
        print("\nMessage:")
        print(message)

async def send_message(ws, message: dict) -> None:
    logger.info("📤 Sending message")
    logger.debug(f"Message details: {json.dumps(message, indent=2)}")
    await ws.send(json.dumps(message))

async def wait_for_automation_response(ws) -> dict:
    while True:
        try:
            raw = await ws.recv()
            logger.info(f"📥 Raw response received")
            logger.debug(f"Response content: {raw}")
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.error("❌ Failed to parse response JSON")
                continue
            msg_type = msg.get("type")
            if msg_type == "automation-response":
                logger.info("🎉 Valid response received!")
                logger.debug(f"Response payload: {json.dumps(msg, indent=2)}")
                return msg
            if msg_type is None and "payload" in msg and msg.get("payload", {}).get("action"):
                logger.info("🎉 Valid response received!")
                logger.debug(f"Response payload: {json.dumps(msg, indent=2)}")
                return msg
            logger.warning(f"⚠️ Ignoring message of type: {msg.get('type')}")
        except asyncio.TimeoutError:
            logger.error("⏰ No response received within 30 seconds")
            return None
        except Exception as recv_error:
            logger.error(f"❗ Error receiving response: {recv_error}")
            return None

async def automation_command(command: dict, timeout: int = 5) -> None:
    api_key = command["apiKey"]
    request_id = command["requestId"]
    try:
        logger.info("🔌 Attempting connection to WebSocket server")
        async with websockets.connect("ws://localhost:8765") as ws:
            logger.info("✅ Connected to WebSocket server")
            await send_message(ws, command)
            response = await asyncio.wait_for(wait_for_automation_response(ws), timeout=timeout)
            handle_response(response)
    except (websockets.ConnectionClosed, asyncio.IncompleteReadError):
        logger.error("❌ Connection closed before a response was received. Querying stored result...")
        await query_response({
            "type": "query-response",
            "apiKey": api_key,
            "requestId": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        })
    except asyncio.TimeoutError:
        logger.error(f"⏰ Timed out after {timeout} seconds waiting for a response.")
        sys.exit(1)
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError) as e:
        logger.error(f"❗ Error: Could not connect to the server: {e}")
        sys.exit(1)

async def query_response(query: dict, timeout: int = 30) -> None:
    try:
        logger.info("🔌 Attempting connection to WebSocket server")
        async with websockets.connect("ws://localhost:8765") as ws:
            logger.info("✅ Connected to WebSocket server")
            await send_message(ws, query)
            response = await asyncio.wait_for(wait_for_automation_response(ws), timeout=timeout)
            handle_response(response)
    except asyncio.TimeoutError:
        logger.error(f"⏰ Timed out after {timeout} seconds waiting for query response.")
        sys.exit(1)
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError) as e:
        logger.error(f"❗ Error: Could not connect to the server: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Send browser automation commands via WebSocket."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--action", help="Command action (e.g. screenshot, click, etc.)")
    group.add_argument("--query", help="Query a response using a request-id")
    
    parser.add_argument("--xpath", help="XPath selector for an element")
    parser.add_argument("--text", help="Text to type into an element")
    parser.add_argument("--x", type=float, help="X coordinate for a click")
    parser.add_argument("--y", type=float, help="Y coordinate for a click")
    parser.add_argument("--url", help="URL to navigate to")
    parser.add_argument("--timestamp", help="Optional ISO timestamp")
    
    args = parser.parse_args()
    api_key = os.environ.get("API_KEY")
    if not api_key:
        logger.error("Error: API_KEY environment variable must be set.")
        sys.exit(1)
    
    if args.query:
        query_msg = {
            "type": "query-response",
            "apiKey": api_key,
            "requestId": args.query,
            "timestamp": args.timestamp or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        logger.info("Sending query for request-id: %s", args.query)
        asyncio.run(query_response(query_msg))
    else:
        request_id = generate_request_id()
        command = {
            "type": "automation-command",
            "action": args.action,
            "apiKey": api_key,
            "requestId": request_id,
            "timestamp": args.timestamp or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        }
        if args.xpath:
            command["xpath"] = args.xpath
        if args.text:
            command["text"] = args.text
        if args.x is not None:
            command["x"] = args.x
        if args.y is not None:
            command["y"] = args.y
        if args.url:
            command["url"] = args.url

        logger.info("Sending automation command:")
        logger.debug(json.dumps(command, indent=2))
        logger.info("Generated Request ID: %s", request_id)
        asyncio.run(automation_command(command))

if __name__ == "__main__":
    main()