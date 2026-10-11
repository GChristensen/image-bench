"""
Image Bench Extension for ComfyUI
Adds a toolbar button to open the Image Bench popup window for batch generation management.
"""

import os
import sys
import asyncio
import json
import time
from urllib.parse import parse_qs, urlparse
import aiohttp
from aiohttp import web
from server import PromptServer
import folder_paths

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import civitai, explore_export, loras, persist, photoshop
from .image_bench_nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from shared.tray import download_image_tray, image_tray_upload as tray_upload_handler, save_image_to_tray

# Tell ComfyUI to serve files from the js/ directory
WEB_DIRECTORY = "./js"

# WebSocket clients for broadcasting image events
websocket_clients = set()

# Photoshop plugins listening for images sent from the Image Bench window
photoshop_plugin_websockets = set()
# Images exchanged with the Photoshop plugin: kind -> (content, media type)
photoshop_images = {}

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

    return web.FileResponse(html_path, headers={"Cache-Control": "no-cache"})


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
                    "unCLIPCheckpointLoader",
                    "UNETLoader"
                ],
                "widgetNames": {
                    "CheckpointLoaderSimple": "ckpt_name",
                    "CheckpointLoader": "ckpt_name",
                    "unCLIPCheckpointLoader": "ckpt_name",
                    "UNETLoader": "unet_name"
                }
            }
        }
        with open(node_config_path, 'w') as f:
            json.dump(default_node_config, f, indent=2)

    return web.FileResponse(node_config_path, headers={"Cache-Control": "no-cache"})


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
    """Get list of available checkpoints, in the shape of the SD WebUI response"""
    models_list = [{
        "title": name,
        "model_name": name,
        "hash": "",  # ComfyUI does not hash the models
        "sha256": "",
        "filename": name,
        "config": None
    } for name in folder_paths.get_filename_list("checkpoints")]

    return web.json_response(models_list)


# Samplers endpoint
@PromptServer.instance.routes.get(BASE_PATH + "/samplers")
async def get_samplers(request):
    """Get lists of available samplers and schedulers"""
    import comfy.samplers

    return web.json_response({
        "samplers": list(comfy.samplers.KSampler.SAMPLERS),
        "schedulers": list(comfy.samplers.KSampler.SCHEDULERS)
    })


# LoRAs endpoint; LoRA exploration drives the LoRA loader node marked ib:lora
@PromptServer.instance.routes.get(BASE_PATH + "/loras")
async def get_loras(request):
    """Get list of available LoRAs; the name is the lora_name widget value (path relative to the LoRA folder)"""
    import folder_paths

    loras_list = []
    for name in folder_paths.get_filename_list("loras"):
        path = folder_paths.get_full_path("loras", name)

        loras_list.append({
            "name": name,
            "alias": os.path.splitext(os.path.basename(name))[0],
            "filename": path,
            "folder": "",  # Already part of the name
            **(loras.read_user_metadata(path) if path else {"preferredWeight": 1, "activationText": ""})
        })

    return web.json_response(loras_list)


@PromptServer.instance.routes.get(BASE_PATH + "/civitai/model_info")
async def get_civitai_model_info(request):
    """Civitai page and metadata of a checkpoint or LoRA, by name and/or hash"""
    import folder_paths

    kind = request.query.get("kind", "checkpoint")
    name = request.query.get("name", "")
    hash_value = request.query.get("hash", "")
    file_hash = None
    store_dir = persist.get_store_file_path(get_extension_root(), "")

    if name:
        path = folder_paths.get_full_path("loras" if kind == "lora" else "checkpoints", name)

        if path:
            cache_path = os.path.join(store_dir, "model_hashes.json")
            file_hash = lambda: civitai.file_sha256(path, cache_path)

    config = persist.read_json_file(get_config_path()) or {}
    domain = config.get("civitaiDomain", "com")

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, civitai.model_info, name, hash_value, file_hash, store_dir, domain)
    return web.json_response(result)


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


@PromptServer.instance.routes.post(BASE_PATH + "/explore_export")
async def explore_export_handler(request):
    """Stream the exploration results as a single self-contained HTML page"""
    form = await request.post()
    data = json.loads(form.get("data") or "{}")
    roots = [folder_paths.get_output_directory(), folder_paths.get_temp_directory()]

    def resolve_path(image):
        # Resolve like /view does: imagePath lacks the subfolder
        query = parse_qs(urlparse(image.get("imageUrl") or "").query)
        filename = (query.get("filename") or [""])[0]
        subfolder = (query.get("subfolder") or [""])[0]
        base_dir = folder_paths.get_directory_by_type((query.get("type") or ["output"])[0])

        if not filename or not base_dir:
            return None

        path = os.path.join(base_dir, subfolder, filename)
        return path if explore_export.is_allowed_image(path, roots) else None

    response = web.StreamResponse(headers={
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": explore_export.content_disposition()
    })
    await response.prepare(request)

    content = explore_export.generate_explore_html(data.get("groups") or [], resolve_path,
                                                   data.get("title") or "Image Bench exploration")

    # File reads happen in the generator, so advance it off the event loop
    while (chunk := await asyncio.to_thread(next, content, None)) is not None:
        await response.write(chunk)

    await response.write_eof()
    return response


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


# Photoshop plugin WebSocket: receives notifications about images sent from the Image Bench window
@PromptServer.instance.routes.get(BASE_PATH + "/photoshop/plugin-websocket")
async def photoshop_plugin_websocket_handler(request):
    """Keep the Photoshop plugin connected to receive images sent from the Image Bench window"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    photoshop_plugin_websockets.add(ws)

    try:
        async for msg in ws:
            pass
    finally:
        photoshop_plugin_websockets.discard(ws)

    return ws


def get_photoshop_image_url(kind):
    return f"{BASE_PATH}/photoshop/image?kind={kind}&t={time.time_ns()}"


# Send an image to Photoshop
@PromptServer.instance.routes.post(BASE_PATH + "/photoshop/send")
async def photoshop_send(request):
    """Receive an image file from the Image Bench window and notify the Photoshop plugin to open it"""
    media_type = request.content_type

    if media_type not in photoshop.SENDABLE_MEDIA_TYPES:
        return web.Response(text=f"Unsupported image type: {media_type}", status=400)

    kind = photoshop.OUTGOING_IMAGE_KIND
    photoshop_images[kind] = (await request.read(), media_type)

    message = {
        "type": "OPEN_IMAGE",
        "name": photoshop.get_image_file_name(request.query.get("name", "image.png"), media_type),
        "imageUrl": get_photoshop_image_url(kind),
        "newDocument": request.query.get("new_document") == "true"
    }

    clients = 0
    for ws in list(photoshop_plugin_websockets):
        try:
            await ws.send_json(message)
            clients += 1
        except Exception:
            photoshop_plugin_websockets.discard(ws)

    return web.json_response({"clients": clients})


# Receive an image or a mask from Photoshop
@PromptServer.instance.routes.post(BASE_PATH + "/photoshop/upload")
async def photoshop_upload(request):
    """
    Receive raw pixels of the document (kind=image) or its selection (kind=mask) from the Photoshop plugin,
    save them to the input directory and notify the ComfyUI pages to load them into the node marked ib:img or ib:mask,
    or into the ControlNet unit shown in the ControlNet tab (target cn_*)
    """
    kind = request.query.get("kind")
    target = request.query.get("target", "input")

    if kind not in photoshop.PHOTOSHOP_IMAGE_KINDS:
        return web.Response(text=f"Unknown image kind: {kind}", status=400)

    if kind not in photoshop.PHOTOSHOP_TARGET_KINDS.get(target, ()):
        return web.Response(text=f"Unknown target {target} of {kind}", status=400)

    try:
        width, height, components = (int(request.query.get(name, "")) for name in ("width", "height", "components"))
        to_png = photoshop.raw_mask_to_png if kind == "mask" else photoshop.raw_pixels_to_png
        png = to_png(await request.read(), width, height, components)
    except ValueError as e:
        return web.Response(text=str(e), status=400)

    filename = photoshop.COMFYUI_INPUT_FILES[target][kind]

    with open(os.path.join(folder_paths.get_input_directory(), filename), "wb") as file:
        file.write(png)

    server = PromptServer.instance
    await server.send("image-bench.photoshop", {"kind": kind, "filename": filename, "target": target})

    return web.json_response({"clients": len(server.sockets)})


# Mask uploaded from the Generate or ControlNet tab
@PromptServer.instance.routes.post(BASE_PATH + "/input_mask")
async def upload_input_mask(request):
    """
    Save a mask image (white or transparent where masked) to the input directory as an RGBA image
    readable as a mask by any ComfyUI loader
    """
    name = os.path.basename(request.query.get("name", ""))

    if not name.lower().endswith(".png"):
        return web.Response(text="The mask name must be a .png file name", status=400)

    try:
        png = photoshop.image_file_to_mask_png(await request.read())
    except Exception as e:
        return web.Response(text=f"Unable to read the mask: {e}", status=400)

    with open(os.path.join(folder_paths.get_input_directory(), name), "wb") as file:
        file.write(png)

    return web.json_response({"name": name})


# Preprocessors and models of the ControlNet tab
@PromptServer.instance.routes.get(BASE_PATH + "/controlnet/choices")
async def get_controlnet_choices(request):
    """
    ControlNet preprocessors (of AIO_Preprocessor, comfyui_controlnet_aux, if it is installed) and models.
    ComfyUI has no control types, so all of them are listed
    """
    import nodes

    preprocessors = []
    aio = nodes.NODE_CLASS_MAPPINGS.get("AIO_Preprocessor")

    if aio:
        try:
            inputs = aio.INPUT_TYPES()
            spec = inputs.get("optional", {}).get("preprocessor") or inputs.get("required", {}).get("preprocessor")
            choices = spec[0] if spec else []
            preprocessors = list(choices) if isinstance(choices, (list, tuple)) else []
        except Exception as e:
            print(f"[Image Bench] Unable to read the AIO_Preprocessor choices: {e}")

    return web.json_response({
        "preprocessors": preprocessors,
        "models": folder_paths.get_filename_list("controlnet"),
        "aux": aio is not None
    })


# Image downloaded by the Photoshop plugin
@PromptServer.instance.routes.get(BASE_PATH + "/photoshop/image")
async def get_photoshop_image(request):
    image = photoshop_images.get(request.query.get("kind"))

    if image is None:
        return web.Response(text="Not found", status=404)

    content, media_type = image
    return web.Response(body=content, content_type=media_type, headers={"Cache-Control": "no-store"})


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


# Extension metadata (the node mappings come from image_bench_nodes)
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

print("✓ Image Bench ComfyUI Extension loaded")
print(f"  - Serving UI at {BASE_PATH}/window")
print(f"  - WebSocket at {BASE_PATH}/websocket")
