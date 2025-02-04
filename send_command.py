#!/usr/bin/env python3
"""
send_command.py

A command-line client to send browser automation commands via a REST API
and poll for the answer by request-id if needed.

Usage as an automation command:
    ./send_command.py --action screenshot [--xpath XPATH] [--text TEXT] [--url URL]

Usage as a query (retrieve a stored answer):
    ./send_command.py --query <requestId>

Make sure the API_KEY environment variable is set.
"""

import argparse
import base64
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('send_command.log')
    ]
)
logger = logging.getLogger(__name__)

SERVER_URL = "http://localhost:8765"

def save_screenshot(data: str) -> str:
    """
    Decode a base64-encoded screenshot (with a data URI prefix)
    and save it to a PNG file.
    """
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
    """
    Unwrap and display the final response.
    If a screenshot is provided, save it.
    """
    print("\nCommand Response:")
    print(f"Status: {response.get('success', False)}")
    print(f"Action: {response.get('action', 'unknown')}")
    print(f"Timestamp: {response.get('timestamp')}")
    if error := response.get("error"):
        print("\nError:")
        print(error)
        sys.exit(1)
    if response.get("action") == "get-html":
        print(f"URL: {response.get('url', 'N/A')}")
        print("HTML Content:")
        print(response.get('html', 'No HTML content retrieved'))
        return
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

def send_command(api_key: str, command: dict) -> str:
    """
    Send the automation command to the REST API server.
    Returns the generated requestId.
    """
    command['apiKey'] = api_key
    url = f"{SERVER_URL}/command"
    logger.info("Sending automation command...")
    response = requests.post(url, json=command)
    if response.status_code != 200:
        logger.error(f"Failed to send command: {response.text}")
        sys.exit(1)
    data = response.json()
    requestId = data.get("requestId")
    logger.info(f"Command sent with Request ID: {requestId}")
    return requestId

def send_html(api_key: str, html_content: str, request_id: str = None) -> str:
    """
    Send an HTML command to be displayed in the current browser tab.
    
    Args:
        api_key (str): The API key for authentication
        html_content (str): The HTML content to be sent and displayed
        request_id (str, optional): A custom request ID. If not provided, one will be generated.
    
    Returns:
        str: The request ID for tracking the command's status
    """
    command = {
        "action": "send-html",
        "html": html_content
    }
    
    if request_id:
        command["requestId"] = request_id
    
    return send_command(api_key, command)

def get_html(api_key: str, request_id: str = None) -> str:
    """
    Retrieve HTML content from the current active browser tab.
    
    Args:
        api_key (str): The API key for authentication
        request_id (str, optional): A custom request ID. If not provided, one will be generated.
    
    Returns:
        str: The request ID for tracking the command's status
    """
    command = {
        "action": "get-html"
    }
    
    if request_id:
        command["requestId"] = request_id
    
    return send_command(api_key, command)

def poll_for_answer(api_key: str, request_id: str, timeout: int = 30) -> dict:
    """
    Poll the REST API server for an answer corresponding to the given requestId.
    """
    url = f"{SERVER_URL}/command/{request_id}/answer"
    start_time = time.time()
    while time.time() - start_time < timeout:
        params = {"apiKey": api_key}
        response = requests.get(url, params=params)
        data = response.json()
        if data.get("success") and "answer" in data:
            logger.info("Received answer from server.")
            return data["answer"]
        logger.info("Answer not ready, polling again...")
        time.sleep(2)
    logger.error("Timed out waiting for answer.")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Send browser automation commands via a REST API."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--action", help="Command action (e.g. screenshot, click, etc.)")
    group.add_argument("--query", help="Query a response using a request-id")
    group.add_argument("--html", type=str, help="HTML content to send to the browser")
    group.add_argument("--get-html", action='store_true', help='Get HTML content from the current tab')
    
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
        # Poll for answer directly using the provided request id
        answer = poll_for_answer(api_key, args.query)
        handle_response(answer)
    elif args.get_html:
        request_id = get_html(api_key)
        logger.info(f"Sent get-html command. Request ID: {request_id}")
        
        response = poll_for_answer(api_key, request_id)
        handle_response(response)
    elif args.html:
        request_id = send_html(api_key, args.html)
        logger.info(f"Sent HTML command. Request ID: {request_id}")
        
        if not args.query:
            response = poll_for_answer(api_key, request_id)
            handle_response(response)
    else:
        command = {
            "action": args.action,
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

        request_id = send_command(api_key, command)
        logger.info("Polling for answer...")
        answer = poll_for_answer(api_key, request_id)
        handle_response(answer)

if __name__ == "__main__":
    main()