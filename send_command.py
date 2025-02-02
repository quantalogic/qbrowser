#!/usr/bin/env -S uv run

# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "argparse",
#     "websockets",
#     "asyncio"
# ]
# ///
import argparse
import json
import os
import sys
import base64
from datetime import datetime, timezone
import websockets
import asyncio

def save_screenshot(base64_data: str) -> str:
    """Save base64 screenshot data to a PNG file."""
    # Remove data URL prefix if present
    if isinstance(base64_data, dict) and 'data' in base64_data:
        base64_data = base64_data['data']
    if isinstance(base64_data, str):
        if base64_data.startswith('data:image/png;base64,'):
            base64_data = base64_data.split(',')[1]
    else:
        raise ValueError("Invalid screenshot data format")
    
    filename = f"screenshot-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    with open(filename, 'wb') as f:
        f.write(base64.b64decode(base64_data))
    return filename

def handle_response(response: dict) -> None:
    """Handle and display the command response."""
    print("\nCommand Response:")
    
    print(f"Status: {response.get('success', False)}")
    print(f"Action: {response.get('action', 'unknown')}")
    print(f"Timestamp: {response.get('timestamp')}")
    
    if error := response.get('error'):
        print(f"\nError:\n{error}")
        sys.exit(1)
        
    if html := response.get('html'):
        print("\nHTML Content:")
        print('\n'.join(html.split('\n')[:50]))
        print("... (truncated)")
        filename = f"page-{datetime.now().strftime('%Y%m%d-%H%M%S')}.html"
        with open(filename, 'w') as f:
            f.write(html)
        print(f"Full HTML saved to {filename}")
        
    # Updated screenshot handling
    if screenshot := response.get('screenshot'):
        try:
            filename = save_screenshot(screenshot)
            print(f"\nScreenshot saved as: {filename}")
        except Exception as e:
            print(f"\nError saving screenshot: {e}")
        
    if message := response.get('message'):
        print(f"\nMessage:\n{message}")

async def send_command(websocket, command: dict) -> None:
    """Send command to websocket server and handle response."""
    await websocket.send(json.dumps(command))
    response = await websocket.recv()
    try:
        handle_response(json.loads(response))
    except json.JSONDecodeError:
        print("Error: Invalid JSON response received:")
        print(response)
        sys.exit(1)

async def run(command: dict):
    try:
        async with websockets.connect('ws://localhost:8765') as websocket:
            await asyncio.wait_for(send_command(websocket, command), timeout=30)
    except asyncio.TimeoutError:
        print("Error: Connection timed out", file=sys.stderr)
        sys.exit(1)
    except (websockets.exceptions.WebSocketException, ConnectionRefusedError) as e:
        print(f"Error: Failed to connect to WebSocket server: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='Send commands to browser automation service')
    parser.add_argument('--action', required=True, help='Action to perform')
    parser.add_argument('--xpath', help='XPath selector')
    parser.add_argument('--text', help='Text to type')
    parser.add_argument('--x', type=float, help='X coordinate')
    parser.add_argument('--y', type=float, help='Y coordinate')
    parser.add_argument('--url', help='URL to navigate to')
    parser.add_argument('--requestId', help='Request ID')
    parser.add_argument('--timestamp', help='Timestamp')
    
    args = parser.parse_args()
    
    # Get API key from environment
    api_key = os.environ.get('API_KEY')
    if not api_key:
        print("Error: Please set the API_KEY environment variable.", file=sys.stderr)
        sys.exit(1)
    
    # Build command
    command = {
        'action': args.action,
        'apiKey': api_key,
        'requestId': args.requestId or f"req-{int(datetime.now().timestamp())}",
        'timestamp': args.timestamp or datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    }
    
    # Add optional parameters if provided
    if args.xpath: command['xpath'] = args.xpath
    if args.text: command['text'] = args.text
    if args.x is not None: command['x'] = args.x
    if args.y is not None: command['y'] = args.y
    if args.url: command['url'] = args.url
    
    print("Sending command:")
    print(json.dumps(command))
    
    # Pass command to run()
    asyncio.run(run(command))

if __name__ == '__main__':
    main()
