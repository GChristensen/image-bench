"""
Image Bench Extension for ComfyUI
Adds a toolbar button to open the Image Bench popup window for batch generation management.
"""

import os
import asyncio
import json
from aiohttp import web
from server import PromptServer

# Tell ComfyUI to serve files from the js/ directory
WEB_DIRECTORY = "./js"

# WebSocket clients for broadcasting image events
websocket_clients = set()

# Base path for all routes
BASE_PATH = "/image-bench"


def get_extension_root():
    """Get the absolute path to this extension directory"""
    return os.path.dirname(os.path.abspath(__file__))


def get_config_path():
    """Get path to config.json file"""
    return os.path.join(get_extension_root(), "config.json")


# Serve the main window (index.html)
@PromptServer.instance.routes.get(BASE_PATH + "/window")
async def serve_window(request):
    """Serve the image-bench index.html file"""
    html_path = os.path.join(get_extension_root(), "js", "index.html")

    if not os.path.exists(html_path):
        return web.Response(
            text="Image Bench not built yet. Run 'just comfy' to build.",
            status=404
        )

    return web.FileResponse(html_path)


# Serve config.json
@PromptServer.instance.routes.get(BASE_PATH + "/config.json")
async def get_config(request):
    """Serve the configuration file"""
    config_path = get_config_path()

    # Create default config if it doesn't exist
    if not os.path.exists(config_path):
        default_config = {
            "repositionConfigPresetsDropdown": False,
            "automaticallyClearGeneratedImages": True,
            "defaultBatches": 100
        }
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)

    return web.FileResponse(config_path)


# Update config.json
@PromptServer.instance.routes.post(BASE_PATH + "/config.json")
async def update_config(request):
    """Update the configuration file"""
    try:
        data = await request.json()
        config_path = get_config_path()

        with open(config_path, 'w') as f:
            json.dump(data, f, indent=2)

        return web.Response(text="OK")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# WebSocket endpoint for real-time communication
@PromptServer.instance.routes.get(BASE_PATH + "/websocket")
async def websocket_handler(request):
    """WebSocket endpoint for real-time communication with popup"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    # Add to clients set
    websocket_clients.add(ws)

    try:
        async for msg in ws:
            # Handle incoming messages if needed
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                # Echo back or handle specific message types
                await ws.send_json({"type": "ack", "received": data})
            elif msg.type == web.WSMsgType.ERROR:
                print(f'WebSocket error: {ws.exception()}')
    finally:
        # Remove from clients set
        websocket_clients.discard(ws)

    return ws


# Close all WebSocket connections
@PromptServer.instance.routes.get(BASE_PATH + "/close_websocket")
async def close_websocket(request):
    """Close all WebSocket connections"""
    for ws in list(websocket_clients):
        await ws.close()
    websocket_clients.clear()
    return web.Response(text="OK")


async def broadcast_to_clients(message):
    """Broadcast a message to all connected WebSocket clients"""
    if not websocket_clients:
        return

    # Remove closed clients
    closed_clients = set()
    for ws in websocket_clients:
        if ws.closed:
            closed_clients.add(ws)
        else:
            try:
                await ws.send_json(message)
            except Exception as e:
                print(f"Error broadcasting to client: {e}")
                closed_clients.add(ws)

    # Clean up closed clients
    websocket_clients.difference_update(closed_clients)


# Hook into ComfyUI's execution system to capture image saves
# This is called when images are generated
def on_prompt_execution(prompt_id, outputs, status):
    """Called when a prompt finishes executing"""
    if status.get("status_str") == "success" and outputs:
        # Broadcast image completion event to all WebSocket clients
        asyncio.create_task(broadcast_to_clients({
            "type": "PROMPT_EXECUTED",
            "prompt_id": prompt_id,
            "outputs": outputs
        }))


# Register extension metadata
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Extension metadata
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

print("✓ Image Bench ComfyUI Extension loaded")
print(f"  - Serving UI at {BASE_PATH}/window")
print(f"  - WebSocket at {BASE_PATH}/websocket")
