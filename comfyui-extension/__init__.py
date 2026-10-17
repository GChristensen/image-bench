"""
Image Bench Extension for ComfyUI
Adds a toolbar button to open the Image Bench popup window for batch generation management.
"""

import os
import sys
import asyncio
import json
import shutil
import time
from urllib.parse import parse_qs, urlparse
import aiohttp
from aiohttp import web
from server import PromptServer
import folder_paths

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import civitai, controlnet_inputs, editor, editor_plugins, explore_export, launcher, loras, persist, pnginfo, projects
from .image_bench_nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from shared.tray import TRAY_FILES, download_image_tray, image_tray_upload as tray_upload_handler, save_tray_images
from shared.tray import COMPARE_KIND, save_compare_file, append_tray_image

# Tell ComfyUI to serve files from the js/ directory
WEB_DIRECTORY = "./js"

# WebSocket clients for broadcasting image events
websocket_clients = set()

# The editor plugin receiving images sent from the Image Bench window
editor_connection = editor.EditorConnection()
# Images exchanged with the editor plugin: kind -> (content, media type)
editor_images = {}

# Base path for all routes
BASE_PATH = "/image-bench"

# Store file names
IMAGE_TRAY_FILE = TRAY_FILES["image_tray"]
CONCEPT_TRAY_FILE = TRAY_FILES["concept_tray"]
EXPLORE_PRESETS_FILE = "explore_presets.json"
SNIPPETS_FILE = "snippets.json"


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
    """Get the image-bench directory in the ComfyUI output directory (which --output-directory may move)"""
    image_bench_dir = os.path.join(folder_paths.get_output_directory(), "image-bench")
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


# Image Bench with ComfyUI in its own iframe tab, opened as a popup by the launcher page
@PromptServer.instance.routes.get(BASE_PATH + "/app")
async def serve_app(request):
    return web.FileResponse(launcher.LAUNCHER_PATH, headers={"Cache-Control": "no-cache"})


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
        return web.json_response({
            "comfyui_root": folder_paths.base_path,
            "output_dir": folder_paths.get_output_directory(),
            "temp_dir": folder_paths.get_temp_directory(),
            "image_bench_dir": get_image_bench_dir()
        })
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Explore presets endpoints

# Clear outputs directory endpoint
@PromptServer.instance.routes.get(BASE_PATH + "/clear_outputs_dir")
async def clear_outputs_dir(request):
    """Clear all files in the ComfyUI output directory"""
    try:
        persist.clear_directory(folder_paths.get_output_directory())
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


# Snippets of the Library tab, inserted into the prompts of the Generate tab
@PromptServer.instance.routes.get(BASE_PATH + "/snippets")
async def get_snippets(request):
    content = persist.serve_store_file_content(get_extension_root(), SNIPPETS_FILE,
                                               persist.DEFAULT_SNIPPETS_FILE)
    return web.Response(text=content, content_type="application/json")


@PromptServer.instance.routes.post(BASE_PATH + "/snippets")
async def update_snippets(request):
    try:
        await persist.write_store_file_from_request(get_extension_root(), SNIPPETS_FILE, request)
        return web.Response(text="", content_type="application/json")
    except Exception as e:
        return web.Response(text=str(e), status=500)


# Projects of the Library tab (see projects.dispatch)
async def projects_action(request):
    files = {}
    form = None
    body = None

    if request.content_type.startswith("multipart/"):
        form = {}

        for key, value in (await request.post()).items():
            if hasattr(value, "file"):
                files[key] = (value.filename, value.file.read())
            else:
                form[key] = value
    elif request.method == "POST":
        body = await request.read()

    store_dir = os.path.join(get_extension_root(), "store")
    config = persist.read_json_file(get_config_path()) or {}

    try:
        args = projects.parse_args(dict(request.query), form, body, files)
        result = await asyncio.to_thread(projects.dispatch, request.match_info["action"], args, files, config,
                                         store_dir, get_image_bench_dir(), "comfyui")
    except projects.ProjectError as e:
        return web.json_response({"error": str(e)}, status=e.status)
    except OSError as e:
        return web.json_response({"error": str(e)}, status=500)

    if isinstance(result, projects.FileResult):
        if result.path:
            return web.FileResponse(result.path, headers={"Content-Type": result.media_type,
                                                          "Cache-Control": "no-cache"})

        return web.Response(body=result.content, content_type=result.media_type,
                            headers={"Cache-Control": "no-cache"})

    return web.json_response(result)


PromptServer.instance.routes.get(BASE_PATH + "/projects/{action}")(projects_action)
PromptServer.instance.routes.post(BASE_PATH + "/projects/{action}")(projects_action)


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


# The model lists need no rescan: folder_paths revalidates its cache by the folder modification times
@PromptServer.instance.routes.post(BASE_PATH + "/refresh_models")
async def refresh_models(request):
    return web.json_response({})


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


# Folder of the saved workflows of ComfyUI's Workflows sidebar that receives the workflows of the extension
SAVED_WORKFLOWS_FOLDER = "Image Bench"


def copy_bundled_workflows():
    """
    Copy the workflows of the extension (workflows/) into the saved workflows of the default user, so that the
    Workflows sidebar and the workflow dropdown of the Generate tab list them. Only missing files are copied:
    a workflow edited and saved there is kept
    """
    source_dir = os.path.join(get_extension_root(), "workflows")
    target_dir = os.path.join(folder_paths.get_user_directory(), "default", "workflows", SAVED_WORKFLOWS_FOLDER)

    try:
        names = [name for name in os.listdir(source_dir) if name.lower().endswith(".json")]
    except OSError:
        return

    for name in names:
        target = os.path.join(target_dir, name)

        if os.path.exists(target):
            continue

        try:
            os.makedirs(target_dir, exist_ok=True)
            shutil.copy2(os.path.join(source_dir, name), target)
        except OSError as e:
            print(f"[Image Bench] Unable to copy the workflow {name}: {e}")


copy_bundled_workflows()


# VAE / Text Encoder modules, as listed by WebUI (Forge); the Generate tab does not set them in ComfyUI
@PromptServer.instance.routes.get(BASE_PATH + "/modules")
async def get_modules(request):
    """List of the VAE and text encoder files as [{name, kind}], kind "vae" or "te" """
    import folder_paths

    te_folder = "text_encoders" if "text_encoders" in folder_paths.folder_names_and_paths else "clip"
    modules_list = [{"name": name, "kind": kind}
                    for folder, kind in (("vae", "vae"), (te_folder, "te"))
                    for name in folder_paths.get_filename_list(folder)]
    modules_list.sort(key=lambda m: m["name"].lower())

    return web.json_response(modules_list)


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


# Persistent image collections: image tray, concept tray and upscaled images
async def get_tray(request, kind):
    """Get tray from store"""
    base_dir = get_extension_root()
    content = persist.serve_store_file_content(base_dir, TRAY_FILES[kind])
    return web.Response(text=content, content_type="application/json")


async def update_tray(request, kind):
    """Update tray in store"""
    try:
        tray_data = json.loads(await request.text())

        # The file of a new image is where its /view URL points (its imagePath may be outdated)
        for image in tray_data.get("images", []):
            if not image.get("_tray_processed"):
                image["imagePath"] = resolve_view_path(image.get("imageUrl")) or image.get("imagePath")

        # Copy the new images to the tray directory and update their paths
        await save_tray_images(tray_data, kind, get_image_bench_dir(), "comfyui")

        base_dir = get_extension_root()
        await persist.write_store_file_content(base_dir, TRAY_FILES[kind], json.dumps(tray_data))

        # Return updated tray data so frontend can update its store with new paths
        return web.Response(text=json.dumps(tray_data), content_type="application/json")
    except Exception as e:
        return web.Response(text=str(e), status=500)


def add_tray_routes(kind):
    @PromptServer.instance.routes.get(BASE_PATH + "/" + kind)
    async def get(request):
        return await get_tray(request, kind)

    @PromptServer.instance.routes.post(BASE_PATH + "/" + kind)
    async def update(request):
        return await update_tray(request, kind)


for tray_kind in TRAY_FILES:
    add_tray_routes(tray_kind)


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
            IMAGE_TRAY_FILE
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


def resolve_view_path(image_url):
    """File path of a /view URL (filename, subfolder, type), as /view resolves it; None if it is not one"""
    query = parse_qs(urlparse(image_url or "").query)
    filename = (query.get("filename") or [""])[0]
    subfolder = (query.get("subfolder") or [""])[0]
    base_dir = folder_paths.get_directory_by_type((query.get("type") or ["output"])[0])

    if not filename or not base_dir:
        return None

    base_dir = os.path.abspath(base_dir)
    path = os.path.abspath(os.path.join(base_dir, subfolder, filename))

    # Like /view, nothing outside the directory of the type (an absolute subfolder may be on another drive)
    try:
        return path if os.path.commonpath([base_dir, path]) == base_dir else None
    except ValueError:
        return None


@PromptServer.instance.routes.post(BASE_PATH + "/explore_export")
async def explore_export_handler(request):
    """Stream the exploration results as a single self-contained HTML page"""
    form = await request.post()
    data = json.loads(form.get("data") or "{}")
    roots = [folder_paths.get_output_directory(), folder_paths.get_temp_directory()]

    def resolve_path(image):
        path = resolve_view_path(image.get("imageUrl"))
        return path if path and explore_export.is_allowed_image(path, roots) else None

    response = web.StreamResponse(headers={
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": explore_export.content_disposition()
    })
    await response.prepare(request)

    content = explore_export.generate_explore_html(data.get("groups") or [], resolve_path,
                                                   data.get("title") or "Image Bench exploration",
                                                   data.get("matrix"))

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


@PromptServer.instance.routes.post(BASE_PATH + "/compare_upload")
async def upload_compare(request):
    """Upload an image to the Compare tab (any image, also without PNG info)"""
    reader = await request.multipart()
    field = await reader.next()

    if field is None:
        return web.Response(text="No file provided", status=400)

    try:
        image = save_compare_file(field.filename, await field.read(), get_image_bench_dir(), "comfyui")
    except ValueError as e:
        return web.json_response({"error": str(e)})

    return web.json_response(image)


@PromptServer.instance.routes.post(BASE_PATH + "/png_info")
async def png_info(request):
    """Infotext and parameters of an uploaded image (PNG text, EXIF or comment)"""
    reader = await request.multipart()
    field = await reader.next()

    if field is None:
        return web.Response(text="No file provided", status=400)

    return web.json_response(pnginfo.image_info(await field.read()))


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


# Kept open by the Image Bench window to tell that the backend is running; answers its pings
@PromptServer.instance.routes.get(BASE_PATH + "/heartbeat")
async def heartbeat_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    async for msg in ws:
        if msg.type == web.WSMsgType.TEXT and msg.data == "ping":
            await ws.send_str("pong")

    return ws


# Editor plugin WebSocket: receives notifications about images sent from the Image Bench window
async def editor_websocket_handler(request):
    """
    Keep the editor plugin connected to receive images sent from the Image Bench window,
    and to report when they are in the editor; a new plugin connection replaces this one
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    token = await editor_connection.attach(ws.send_str, lambda code: ws.close(code=code))

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                editor_connection.handle_message(token, msg.data)
    finally:
        editor_connection.detach(token)

    return ws


PromptServer.instance.routes.get(BASE_PATH + "/editor/websocket")(editor_websocket_handler)
# The route of the Photoshop plugins installed before the editor bridge
PromptServer.instance.routes.get(BASE_PATH + "/photoshop/plugin-websocket")(editor_websocket_handler)


def get_editor_image_url(kind):
    return f"{BASE_PATH}/editor/image?kind={kind}&t={time.time_ns()}"


# Send an image to the editor
@PromptServer.instance.routes.post(BASE_PATH + "/editor/send")
async def editor_send(request):
    """
    Receive an image file from the Image Bench window and notify the editor plugin to open it,
    answering when the plugin reports the image is in the editor
    """
    media_type = request.content_type

    if media_type not in editor.SENDABLE_MEDIA_TYPES:
        return web.Response(text=f"Unsupported image type: {media_type}", status=400)

    kind = editor.OUTGOING_IMAGE_KIND
    editor_images[kind] = (await request.read(), media_type)

    return web.json_response(await editor_connection.send_open_image(
        editor.get_image_file_name(request.query.get("name", "image.png"), media_type),
        get_editor_image_url(kind), request.query.get("new_document") == "true"))


# The name of the connected editor, or null
@PromptServer.instance.routes.get(BASE_PATH + "/editor/status")
async def get_editor_status(request):
    return web.json_response(editor_connection.status())


# Receive an image or a mask from the editor
async def editor_upload(request):
    """
    Receive raw pixels of the document (kind=image) or its selection (kind=mask) from the editor plugin,
    save them to the input directory and notify the ComfyUI pages to load them into the node marked ib:img or ib:mask,
    or into the ControlNet unit shown in the ControlNet tab (target cn_*)
    """
    kind = request.query.get("kind")
    target = request.query.get("target", "input")

    if kind not in editor.EDITOR_IMAGE_KINDS:
        return web.Response(text=f"Unknown image kind: {kind}", status=400)

    if kind not in editor.EDITOR_TARGET_KINDS.get(target, ()):
        return web.Response(text=f"Unknown target {target} of {kind}", status=400)

    try:
        width, height, components = (int(request.query.get(name, "")) for name in ("width", "height", "components"))
        to_png = editor.raw_mask_to_png if kind == "mask" else editor.raw_pixels_to_png
        png = to_png(await request.read(), width, height, components)
    except ValueError as e:
        return web.Response(text=str(e), status=400)

    server = PromptServer.instance

    # Saved and added to the Compare tab here, so that it arrives even if the popup is closed
    if target == editor.COMPARE_TARGET:
        image = save_compare_file(f"editor_{time.strftime('%Y%m%d-%H%M%S')}.png", png,
                                  get_image_bench_dir(), "comfyui")
        append_tray_image(os.path.join(get_extension_root(), "store"), COMPARE_KIND, image)
        await server.send("image-bench.editor", {"kind": kind, "target": target, "image": image})
        return web.json_response({"clients": len(server.sockets), "saved": True})

    filename = editor.COMFYUI_INPUT_FILES[target][kind]

    with open(os.path.join(folder_paths.get_input_directory(), filename), "wb") as file:
        file.write(png)

    await server.send("image-bench.editor", {"kind": kind, "filename": filename, "target": target})

    return web.json_response({"clients": len(server.sockets)})


PromptServer.instance.routes.post(BASE_PATH + "/editor/upload")(editor_upload)
# The route of the Photoshop plugins installed before the editor bridge
PromptServer.instance.routes.post(BASE_PATH + "/photoshop/upload")(editor_upload)


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
        png = editor.image_file_to_mask_png(await request.read())
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


# ControlNet inputs of the generated images, stored by hash (see shared_backend/controlnet_inputs.py)
@PromptServer.instance.routes.post(BASE_PATH + "/controlnet/input")
async def save_controlnet_input(request):
    try:
        return web.json_response({"hash": controlnet_inputs.save_input(get_image_bench_dir(),
                                                                       await persist.read_request_body(request))})
    except ValueError as e:
        return web.Response(text=str(e), status=400)


@PromptServer.instance.routes.get(BASE_PATH + "/controlnet/input")
async def get_controlnet_input(request):
    try:
        path = controlnet_inputs.input_path(get_image_bench_dir(), request.query.get("hash"))
    except FileNotFoundError:
        return web.Response(status=404)

    return web.FileResponse(path, headers={"Cache-Control": "max-age=31536000, immutable"})


def input_file_path(name):
    try:
        return folder_paths.get_annotated_filepath(name)
    except Exception:
        return None


def record_controlnet_inputs(json_data):
    """
    Record the ControlNet units of every posted prompt into its extra_data, read back from /history by core.js;
    ComfyUI keeps the prompt if a handler fails
    """
    if not os.path.isfile(get_node_config_path()):
        return json_data

    with open(get_node_config_path(), "r", encoding="utf-8") as f:
        config = json.load(f).get("controlnet") or {}

    return controlnet_inputs.record_comfy_prompt(json_data, get_image_bench_dir(), config, input_file_path)


PromptServer.instance.add_on_prompt_handler(record_controlnet_inputs)


# Image downloaded by the editor plugin
@PromptServer.instance.routes.get(BASE_PATH + "/editor/image")
async def get_editor_image(request):
    image = editor_images.get(request.query.get("kind"))

    if image is None:
        return web.Response(text="Not found", status=404)

    content, media_type = image
    return web.Response(body=content, content_type=media_type, headers={"Cache-Control": "no-store"})


def _editor_plugin_name(request):
    """The plugin of a request (?plugin=, a key of editor_plugins.PLUGINS)"""
    return request.query.get("plugin", editor_plugins.DEFAULT_PLUGIN)


# Version of a supplied editor plugin and of the one installed on the server computer
@PromptServer.instance.routes.get(BASE_PATH + "/editor/plugin")
async def get_editor_plugin_status(request):
    try:
        return web.json_response(editor_plugins.get_status(_editor_plugin_name(request)))
    except editor_plugins.PluginError as e:
        return web.Response(text=str(e), status=404)


@PromptServer.instance.routes.get(BASE_PATH + "/editor/plugin/package")
async def download_editor_plugin(request):
    try:
        name, content = editor_plugins.package(_editor_plugin_name(request))
    except editor_plugins.PluginError as e:
        return web.Response(text=str(e), status=404)

    return web.Response(body=content, content_type="application/octet-stream",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})


# Install an editor plugin on the server computer (see editor_plugins.install_or_elevate)
@PromptServer.instance.routes.post(BASE_PATH + "/editor/plugin/install")
async def install_editor_plugin(request):
    try:
        return web.json_response(editor_plugins.install_or_elevate(_editor_plugin_name(request)))
    except (editor_plugins.PluginError, OSError) as e:
        return web.json_response({"detail": str(e)}, status=500)


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
