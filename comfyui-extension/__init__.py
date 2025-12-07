"""
Image Bench Extension for ComfyUI
Adds a toolbar button to open the Image Bench popup window for batch generation management.
"""

import os
import sys
import asyncio
import json
import aiohttp
from aiohttp import web
from server import PromptServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import persist
from shared.tray import download_image_tray, image_tray_upload as tray_upload_handler, save_image_to_tray

# Tell ComfyUI to serve files from the js/ directory
WEB_DIRECTORY = "./js"

# WebSocket clients for broadcasting image events
websocket_clients = set()

# Base path for all routes
BASE_PATH = "/image-bench"

# Store file names
IMAGE_TRAY_FILE = "image_tray.json"
CONCEPT_TRAY_FILE = "concept_tray.json"
EXPLORE_PRESETS_FILE = "explore_presets.json"


def get_extension_root():
    """Get the absolute path to this extension directory"""
    return os.path.dirname(os.path.abspath(__file__))


def get_config_path():
    """Get path to config.json file"""
    return os.path.join(get_extension_root(), "config.json")


def get_node_config_path():
    """Get path to node_config.json file"""
    return os.path.join(get_extension_root(), "node_config.json")


def get_image_bench_dir():
    """Get the image-bench output directory"""
    # Try to find ComfyUI output directory
    comfy_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output_dir = os.path.join(comfy_root, "output")

    # Create image-bench subdirectory in output
    image_bench_dir = os.path.join(output_dir, "image-bench")
    os.makedirs(image_bench_dir, exist_ok=True)

    return image_bench_dir


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


# Serve node_config.json
@PromptServer.instance.routes.get(BASE_PATH + "/node_config.json")
async def get_node_config(request):
    """Serve the node configuration file for marker-based node discovery"""
    node_config_path = get_node_config_path()

    # Create default config if it doesn't exist
    if not os.path.exists(node_config_path):
        default_node_config = {
            "checkpoint": {
                "marker": "cp",
                "nodeTypes": [
                    "CheckpointLoaderSimple",
                    "CheckpointLoader",
                    "unCLIPCheckpointLoader"
                ],
                "widgetNames": {
                    "CheckpointLoaderSimple": "ckpt_name",
                    "CheckpointLoader": "ckpt_name",
                    "unCLIPCheckpointLoader": "ckpt_name"
                }
            }
        }
        with open(node_config_path, 'w') as f:
            json.dump(default_node_config, f, indent=2)

    return web.FileResponse(node_config_path)


# System information endpoint
@PromptServer.instance.routes.get(BASE_PATH + "/system_info")
async def get_system_info(request):
    """Get system information including paths"""
    try:
        comfy_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        image_bench_dir = get_image_bench_dir()
        output_dir = os.path.join(comfy_root, "output")

        return web.json_response({
            "comfyui_root": comfy_root,
            "output_dir": output_dir,
            "image_bench_dir": image_bench_dir
        })
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Explore presets endpoints

# Clear outputs directory endpoint
@PromptServer.instance.routes.get(BASE_PATH + "/clear_outputs_dir")
async def clear_outputs_dir(request):
    """Clear all files in the ComfyUI output directory"""
    try:
        comfy_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        output_dir = os.path.join(comfy_root, "output")
        persist.clear_directory(output_dir)
        return web.Response(text="OK")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Clear generated images (everything except image-bench folder)
@PromptServer.instance.routes.get(BASE_PATH + "/clear_generated_images")
async def clear_generated_images(request):
    """Clear all files in the ComfyUI output directory except image-bench folder"""
    try:
        comfy_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        output_dir = os.path.join(comfy_root, "output")
        persist.clear_directory_except(output_dir, ["image-bench"])
        return web.Response(text="OK")
    except Exception as e:
        return web.Response(text=str(e), status=500)


@PromptServer.instance.routes.get(BASE_PATH + "/explore_presets")
async def get_explore_presets(request):
    """Get explore presets from store"""
    base_dir = get_extension_root()
    content = persist.serve_store_file_content(base_dir, EXPLORE_PRESETS_FILE)
    return web.Response(text=content, content_type="application/json")


@PromptServer.instance.routes.post(BASE_PATH + "/explore_presets")
async def update_explore_presets(request):
    """Update explore presets in store"""
    try:
        base_dir = get_extension_root()
        await persist.write_store_file_from_request(base_dir, EXPLORE_PRESETS_FILE, request)
        return web.Response(text="", content_type="application/json")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Models endpoint
@PromptServer.instance.routes.get(BASE_PATH + "/models")
async def get_models(request):
    """Get list of available checkpoints from ComfyUI"""
    try:
        # Get ComfyUI's object_info to find available checkpoints
        # ComfyUI typically runs on port 8188, but we can get the port from the PromptServer
        async with aiohttp.ClientSession() as session:
            # Use localhost since we're running inside ComfyUI
            async with session.get('http://localhost:8188/object_info/CheckpointLoaderSimple') as resp:
                if resp.status != 200:
                    return web.Response(text="Failed to fetch model list from ComfyUI", status=500)

                data = await resp.json()

                # Extract checkpoint names from the response
                # ComfyUI's object_info structure: { "CheckpointLoaderSimple": { "input": { "required": { "ckpt_name": [array of names] } } } }
                checkpoint_names = []
                if 'CheckpointLoaderSimple' in data:
                    node_info = data['CheckpointLoaderSimple']
                    if 'input' in node_info and 'required' in node_info['input']:
                        if 'ckpt_name' in node_info['input']['required']:
                            checkpoint_names = node_info['input']['required']['ckpt_name'][0]

                # Format to match SD WebUI's response structure
                models_list = []
                for name in checkpoint_names:
                    models_list.append({
                        "title": name,
                        "model_name": name,
                        "hash": "",  # ComfyUI doesn't provide hash in object_info
                        "sha256": "",
                        "filename": name,
                        "config": None
                    })

                return web.json_response(models_list)
    except Exception as e:
        import traceback
        print(f"Error in get_models: {e}")
        print(traceback.format_exc())
        return web.Response(text=str(e), status=500)


# Image tray endpoints
@PromptServer.instance.routes.get(BASE_PATH + "/image_tray")
async def get_image_tray(request):
    """Get image tray from store"""
    base_dir = get_extension_root()
    content = persist.serve_store_file_content(base_dir, IMAGE_TRAY_FILE)
    return web.Response(text=content, content_type="application/json")


@PromptServer.instance.routes.post(BASE_PATH + "/image_tray")
async def update_image_tray(request):
    """Update image tray in store"""
    try:
        # Read and parse tray data
        content = await request.text()
        tray_data = json.loads(content)

        # Get image-bench directory
        image_bench_dir = get_image_bench_dir()

        # Process each image: copy to tray directory if not already processed
        for image in tray_data.get("images", []):
            if not image.get("_tray_processed"):
                try:
                    # Copy image to dedicated tray directory and update paths
                    await save_image_to_tray(
                        image,
                        "image_tray",
                        image_bench_dir,
                        "comfyui"
                    )
                    # Mark as processed to avoid re-copying on subsequent saves
                    image["_tray_processed"] = True
                except Exception as e:
                    print(f"[Image Bench] Error copying image to tray: {e}")
                    # Continue with other images even if one fails

        # Save updated tray data with new paths
        base_dir = get_extension_root()
        await persist.write_store_file_content(base_dir, IMAGE_TRAY_FILE, json.dumps(tray_data))

        # Return updated tray data so frontend can update its store with new paths
        return web.Response(text=json.dumps(tray_data), content_type="application/json")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Concept tray endpoints
@PromptServer.instance.routes.get(BASE_PATH + "/concept_tray")
async def get_concept_tray(request):
    """Get concept tray from store"""
    base_dir = get_extension_root()
    content = persist.serve_store_file_content(base_dir, CONCEPT_TRAY_FILE)
    return web.Response(text=content, content_type="application/json")


@PromptServer.instance.routes.post(BASE_PATH + "/concept_tray")
async def update_concept_tray(request):
    """Update concept tray in store"""
    try:
        # Read and parse tray data
        content = await request.text()
        tray_data = json.loads(content)

        # Get image-bench directory
        image_bench_dir = get_image_bench_dir()

        # Process each image: copy to tray directory if not already processed
        for image in tray_data.get("images", []):
            if not image.get("_tray_processed"):
                try:
                    # Copy image to dedicated tray directory and update paths
                    await save_image_to_tray(
                        image,
                        "concept_tray",
                        image_bench_dir,
                        "comfyui"
                    )
                    # Mark as processed to avoid re-copying on subsequent saves
                    image["_tray_processed"] = True
                except Exception as e:
                    print(f"[Image Bench] Error copying image to tray: {e}")
                    # Continue with other images even if one fails

        # Save updated tray data with new paths
        base_dir = get_extension_root()
        await persist.write_store_file_content(base_dir, CONCEPT_TRAY_FILE, json.dumps(tray_data))

        # Return updated tray data so frontend can update its store with new paths
        return web.Response(text=json.dumps(tray_data), content_type="application/json")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Tray upload/download endpoints
@PromptServer.instance.routes.get(BASE_PATH + "/download_image_tray")
async def download_tray(request):
    """Download image or concept tray as a zip archive"""
    try:
        kind = request.query.get("kind", "image_tray")
        image_bench_dir = get_image_bench_dir()
        store_dir = os.path.join(get_extension_root(), "store")

        file_path, status_code = download_image_tray(
            kind,
            image_bench_dir,
            store_dir,
            IMAGE_TRAY_FILE,
            CONCEPT_TRAY_FILE
        )

        if status_code == 200 and file_path:
            return web.FileResponse(file_path)
        elif status_code == 204:
            return web.Response(status=204)  # No Content
        else:  # 404
            return web.Response(text="Not found", status=404)
    except Exception as e:
        import traceback
        print(f"Error in download_tray: {e}")
        print(traceback.format_exc())
        return web.Response(text=str(e), status=500)


@PromptServer.instance.routes.post(BASE_PATH + "/image_tray_upload")
async def upload_image_tray(request):
    """Upload image(s) to image tray"""
    try:
        # aiohttp multipart handling
        reader = await request.multipart()
        field = await reader.next()

        if field is None:
            return web.Response(text="No file provided", status=400)

        filename = field.filename
        file_data = await field.read()
        image_bench_dir = get_image_bench_dir()

        result = await tray_upload_handler(filename, file_data, image_bench_dir, IMAGE_TRAY_FILE)

        return web.Response(text=json.dumps(result), content_type="application/json")
    except Exception as e:
        import traceback
        print(f"Error in upload_image_tray: {e}")
        print(traceback.format_exc())
        return web.Response(text=str(e), status=500)


@PromptServer.instance.routes.post(BASE_PATH + "/concept_tray_upload")
async def upload_concept_tray(request):
    """Upload image(s) to concept tray"""
    try:
        # aiohttp multipart handling
        reader = await request.multipart()
        field = await reader.next()

        if field is None:
            return web.Response(text="No file provided", status=400)

        filename = field.filename
        file_data = await field.read()
        image_bench_dir = get_image_bench_dir()

        result = await tray_upload_handler(filename, file_data, image_bench_dir, CONCEPT_TRAY_FILE)

        return web.Response(text=json.dumps(result), content_type="application/json")
    except Exception as e:
        import traceback
        print(f"Error in upload_concept_tray: {e}")
        print(traceback.format_exc())
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
