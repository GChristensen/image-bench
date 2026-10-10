import asyncio
import json
import os
import re
import shutil
import sys
import time
import zipfile

from fastapi import FastAPI, Body, HTTPException, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, StreamingResponse

import gradio as gr
import modules.images as webui_images
import modules.script_callbacks as script_callbacks
import modules.sd_models as sd_models
import modules.shared as shared
import requests

import websockets
from starlette.responses import JSONResponse
from PIL import Image
from starlette.status import HTTP_204_NO_CONTENT

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import persist
from shared import civitai
from shared import explore_export
from shared import loras
from shared import photoshop
from shared import tray

DEFAULT_CONFIG = """{
  "repositionConfigPresetsDropdown": false,
  "automaticallyClearGeneratedImages": true,
  "exploreLoraFreeImages": true
}
"""

EXTENSION_CONFIG_FILE = "config.json"
IMAGE_TRAY_FILE = "image_tray.json"
CONCEPT_TRAY_FILE = "concept_tray.json"

TERMINATE_WEBSOCKET = object()


class ImageBenchApi():

    BASE_PATH = "/image-bench"

    def __init__(self):
        webui_config = self.get_webui_config()

        self.websocket_queue = asyncio.Queue()
        # WebUI pages listening for images sent from Photoshop
        self.photoshop_websockets = set()
        # Photoshop plugins listening for images sent from the Image Bench window
        self.photoshop_plugin_websockets = set()
        # Last image of each kind as (content, media type)
        self.photoshop_images = {}
        self.config_presets_dropdown = None
        self.outputs_dir = webui_config.get("outdir_samples") or os.path.join(self.get_webui_root_dir(), "outputs")
        self.image_bench_dir = os.path.join(self.outputs_dir, "image-bench")

        config_path = self.get_file_path("../config.json")
        if not os.path.exists(config_path):
            with open(config_path, 'w') as f:
                f.write(DEFAULT_CONFIG)

    def start(self, _: gr.Blocks, app: FastAPI):
        self.app = app
        self.add_api_route("/window", self.get_window, methods=["GET"])
        self.add_api_route("/js/{path:path}", self.get_extension_js, methods=["GET"])
        self.add_api_route("/config.json", self.get_config, methods=["GET"])
        self.add_api_route("/config.json", self.write_config, methods=["POST"])
        self.add_api_route("/explore_presets", self.get_explore_presets, methods=["GET"])
        self.add_api_route("/explore_presets", self.write_explore_presets, methods=["POST"])
        self.add_api_route("/image_tray", self.get_image_tray, methods=["GET"])
        self.add_api_route("/image_tray", self.write_image_tray, methods=["POST"])
        self.add_api_route("/concept_tray", self.get_concept_tray, methods=["GET"])
        self.add_api_route("/concept_tray", self.write_concept_tray, methods=["POST"])
        self.add_api_route("/config_presets", self.get_presets, methods=["GET"])
        self.add_api_route("/clear_outputs_dir", self.clear_outputs_dir, methods=["GET"])
        self.add_api_route("/clear_generated_images", self.clear_generated_images, methods=["GET"])
        self.add_api_route("/save_controlnet_images", self.save_controlnet_images, methods=["POST"])
        self.add_api_route("/get_controlnet_images", self.get_controlnet_images, methods=["GET"])
        self.add_api_route("/download_image_tray", self.download_image_tray, methods=["GET"])
        self.add_api_route("/explore_export", self.explore_export, methods=["POST"])
        self.add_api_route("/image_tray_upload", self.image_tray_upload, methods=["POST"])
        self.add_api_route("/concept_tray_upload", self.image_tray_upload, methods=["POST"])
        self.add_api_route("/models", self.get_models, methods=["GET"])
        self.add_api_route("/samplers", self.get_samplers, methods=["GET"])
        self.add_api_route("/loras", self.get_loras, methods=["GET"])
        self.add_api_route("/civitai/model_info", self.get_civitai_model_info, methods=["GET"])
        self.app.add_websocket_route(self.BASE_PATH + "/websocket", self.handle_websocket)
        self.add_api_route("/close_websocket", self.close_websocket, methods=["GET"])
        self.add_api_route("/photoshop/upload", self.photoshop_upload, methods=["POST"])
        self.add_api_route("/photoshop/send", self.photoshop_send, methods=["POST"])
        self.add_api_route("/photoshop/image", self.get_photoshop_image, methods=["GET"])
        self.app.add_websocket_route(self.BASE_PATH + "/photoshop/websocket", self.handle_photoshop_websocket)
        self.app.add_websocket_route(self.BASE_PATH + "/photoshop/plugin-websocket",
                                     self.handle_photoshop_plugin_websocket)

    def get_path(self, path):
        return f"{self.BASE_PATH}{path}"

    def get_webui_root_dir(self):
        return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    def add_api_route(self, path: str, endpoint, **kwargs):
        return self.app.add_api_route(self.get_path(path), endpoint, **kwargs)

    def get_config(self):
        config_path = self.get_file_path(EXTENSION_CONFIG_FILE, upper=True)
        return FileResponse(config_path, media_type="application/json")

    def get_webui_config(self):
        config_path = os.path.join(self.get_webui_root_dir(), "config.json")
        return persist.read_json_file(config_path) or {}

    async def write_config(self, request: Request):
        config_path = self.get_file_path("../config.json")
        await persist.write_file_from_request(config_path, request, as_text=False)
        return Response("", media_type="application/json")

    def get_window(self):
        index_html_path = self.get_file_path("index.html")
        return FileResponse(index_html_path, headers={"Cache-Control": "no-cache"})

    def get_extension_js(self, path: str):
        # Serves the extension's ES module graph with revalidation, since Gradio's file= route
        # lets browsers cache modules imported without the mtime query
        base_dir = os.path.normpath(self.get_file_path("../javascript"))
        file_path = os.path.normpath(os.path.join(base_dir, path))

        # Check the unresolved path: javascript/shared is a symlink outside of base_dir
        if (not path.endswith(".js") or ".." in path.replace("\\", "/").split("/")
                or os.path.commonpath([base_dir, file_path]) != base_dir
                or not os.path.isfile(file_path)):
            raise HTTPException(status_code=404)

        return FileResponse(file_path, media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    def on_image_saved(self, image_data):
        filename = image_data.filename
        # print("\n", image_data.filename, "\n")
        # print("\n", image_data.pnginfo, "\n")
        # print("\n", image_data.p.__dict__, "\n")

        if "grid" not in filename:
            if not (filename.startswith("/") or ":" in filename):
                filename = self.get_webui_root_dir() + "/" + filename

            filename = filename.replace("\\", "/")

            msg = {
                "type": "SAVED_IMAGE",
                "imageUrl": f"/file={filename}",
                "imagePath": filename,
                # job_timestamp is shared by all images of a single generation (batch)
                "batchId": getattr(shared.state, "job_timestamp", None),
                "parameters": self.pnginfo_to_dict(image_data.p.prompt, image_data.p.negative_prompt,
                                                   image_data.pnginfo)
            }

            self.websocket_queue.put_nowait(msg)

    def pnginfo_to_dict(self, prompt, negative_prompt, pnginfo):
        return tray.pnginfo_to_dict(prompt, negative_prompt, pnginfo)

    def prompts_from_pnginfo(self, pnginfo):
        return tray.prompts_from_pnginfo(pnginfo)

    def get_file_path(self, file_name, upper=False):
        current_dir = os.path.dirname(os.path.abspath(__file__))

        if upper:
            current_dir = os.path.dirname(current_dir)

        file_path = os.path.join(current_dir, file_name)
        return file_path

    async def handle_websocket(self, websocket, *args):
        await websocket.accept()

        while not self.websocket_queue.empty():
            self.websocket_queue.get_nowait()

        while True:
            try:
                msg = await self.websocket_queue.get()

                if msg == TERMINATE_WEBSOCKET:
                    break

                await websocket.send_text(json.dumps(msg))
            except Exception as e:
                print(e)
                break
            finally:
                self.websocket_queue.task_done()

    def close_websocket(self):
        self.websocket_queue.put_nowait(TERMINATE_WEBSOCKET)
        return Response("")

    async def handle_photoshop_websocket(self, websocket, *args):
        """Keep a WebUI page connected to receive images sent from the Photoshop plugin"""
        await self.keep_websocket(websocket, self.photoshop_websockets)

    async def handle_photoshop_plugin_websocket(self, websocket, *args):
        """Keep the Photoshop plugin connected to receive images sent from the Image Bench window"""
        await self.keep_websocket(websocket, self.photoshop_plugin_websockets)

    @staticmethod
    async def keep_websocket(websocket, clients):
        await websocket.accept()
        clients.add(websocket)

        try:
            while True:
                await websocket.receive_text()
        except Exception:
            pass
        finally:
            clients.discard(websocket)

    @staticmethod
    async def broadcast(clients, msg):
        """Send a message to the connected websockets, returning the number of the receivers"""
        text = json.dumps(msg)
        receivers = 0

        for websocket in list(clients):
            try:
                await websocket.send_text(text)
                receivers += 1
            except Exception:
                clients.discard(websocket)

        return receivers

    def get_photoshop_image_url(self, kind):
        return f"{self.BASE_PATH}/photoshop/image?kind={kind}&t={time.time_ns()}"

    async def photoshop_upload(self, request: Request, kind: str, width: int, height: int, components: int):
        """
        Receive raw pixels of the document (kind=image) or its selection (kind=mask) from the Photoshop plugin
        and notify the connected WebUI pages to insert it into the inpaint upload tab
        """
        if kind not in photoshop.PHOTOSHOP_IMAGE_KINDS:
            raise HTTPException(status_code=400, detail=f"Unknown image kind: {kind}")

        try:
            png = photoshop.raw_pixels_to_png(await request.body(), width, height, components)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        self.photoshop_images[kind] = (png, "image/png")

        clients = await self.broadcast(self.photoshop_websockets, {
            "type": "PHOTOSHOP_IMAGE",
            "kind": kind,
            "imageUrl": self.get_photoshop_image_url(kind)
        })

        return JSONResponse({"clients": clients})

    async def photoshop_send(self, request: Request, name: str = "image.png", new_document: bool = False):
        """Receive an image file from the Image Bench window and notify the Photoshop plugin to open it"""
        media_type = request.headers.get("content-type", "").split(";")[0].strip()

        if media_type not in photoshop.SENDABLE_MEDIA_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported image type: {media_type}")

        kind = photoshop.OUTGOING_IMAGE_KIND
        self.photoshop_images[kind] = (await request.body(), media_type)

        clients = await self.broadcast(self.photoshop_plugin_websockets, {
            "type": "OPEN_IMAGE",
            "name": photoshop.get_image_file_name(name, media_type),
            "imageUrl": self.get_photoshop_image_url(kind),
            "newDocument": new_document
        })

        return JSONResponse({"clients": clients})

    def get_photoshop_image(self, kind: str):
        image = self.photoshop_images.get(kind)

        if image is None:
            raise HTTPException(status_code=404, detail="Not found")

        content, media_type = image
        return Response(content, media_type=media_type, headers={"Cache-Control": "no-store"})

    def get_explore_presets(self):
        return self.serve_store_file("explore_presets.json")

    async def write_explore_presets(self, request: Request):
        base_dir = self.get_file_path("", upper=True)
        await persist.write_store_file_from_request(base_dir, "explore_presets.json", request)
        return Response("", media_type="application/json")

    def get_image_tray(self):
        return self.serve_store_file(IMAGE_TRAY_FILE)

    async def write_image_tray(self, request: Request):
        # Read and parse tray data
        content = await request.body()
        tray_data = json.loads(content)

        # Process each image: copy to tray directory if not already processed
        for image in tray_data.get("images", []):
            if not image.get("_tray_processed"):
                try:
                    # Copy image to dedicated tray directory and update paths
                    await tray.save_image_to_tray(
                        image,
                        "image_tray",
                        self.image_bench_dir,
                        "webui"
                    )
                    # Mark as processed to avoid re-copying on subsequent saves
                    image["_tray_processed"] = True
                except Exception as e:
                    print(f"[Image Bench] Error copying image to tray: {e}")
                    # Continue with other images even if one fails

        # Save updated tray data with new paths
        base_dir = self.get_file_path("", upper=True)
        await persist.write_store_file_content(base_dir, IMAGE_TRAY_FILE, json.dumps(tray_data))

        # Return updated tray data so frontend can update its store with new paths
        return Response(json.dumps(tray_data), media_type="application/json")

    def get_concept_tray(self):
        return self.serve_store_file(CONCEPT_TRAY_FILE)

    async def write_concept_tray(self, request: Request):
        # Read and parse tray data
        content = await request.body()
        tray_data = json.loads(content)

        # Process each image: copy to tray directory if not already processed
        for image in tray_data.get("images", []):
            if not image.get("_tray_processed"):
                try:
                    # Copy image to dedicated tray directory and update paths
                    await tray.save_image_to_tray(
                        image,
                        "concept_tray",
                        self.image_bench_dir,
                        "webui"
                    )
                    # Mark as processed to avoid re-copying on subsequent saves
                    image["_tray_processed"] = True
                except Exception as e:
                    print(f"[Image Bench] Error copying image to tray: {e}")
                    # Continue with other images even if one fails

        # Save updated tray data with new paths
        base_dir = self.get_file_path("", upper=True)
        await persist.write_store_file_content(base_dir, CONCEPT_TRAY_FILE, json.dumps(tray_data))

        # Return updated tray data so frontend can update its store with new paths
        return Response(json.dumps(tray_data), media_type="application/json")

    def serve_store_file(self, filename):
        base_dir = self.get_file_path("", upper=True)
        result = persist.serve_store_file_content(base_dir, filename)
        return Response(result, media_type="application/json")

    async def write_store_file(self, filename, content):
        base_dir = self.get_file_path("", upper=True)
        await persist.write_store_file_content(base_dir, filename, content)
        return Response("", media_type="application/json")

    def get_presets(self):
        if self.config_presets_dropdown:
            response = jsonable_encoder(self.config_presets_dropdown.choices)
        else:
            response = jsonable_encoder([])

        return JSONResponse(response)

    def get_models(self):
        """Get list of available SD models/checkpoints"""
        models_list = []
        for model in sd_models.checkpoints_list.values():
            models_list.append({
                "title": model.title,
                "model_name": model.title, #model.model_name
                "hash": model.shorthash,
                "sha256": model.sha256,
                "filename": model.filename
            })
        return JSONResponse(jsonable_encoder(models_list))

    def get_samplers(self):
        """Get lists of available samplers and schedulers"""
        import modules.sd_samplers as sd_samplers
        import modules.sd_schedulers as sd_schedulers

        return JSONResponse({
            "samplers": sd_samplers.visible_sampler_names(),
            "schedulers": [s.label for s in sd_schedulers.schedulers]
        })

    def get_loras(self):
        """Get list of available LoRAs with their Forge user metadata (sidecar .json)"""
        networks = sys.modules.get("networks")  # Module of the built-in sd_forge_lora extension

        if networks is None:
            return JSONResponse([])

        # LoRA root folders, as scanned by sd_forge_lora (networks.process_network_files)
        lora_dirs = [getattr(shared.cmd_opts, "lora_dir", None), *(getattr(shared.cmd_opts, "lora_dirs", None) or [])]
        lora_roots = [os.path.abspath(d) for d in lora_dirs if d]

        def get_lora_folder(filename):
            """Folder of the LoRA relative to the deepest root containing it, "" if placed in the root itself"""
            lora_dir = os.path.dirname(os.path.abspath(filename))
            roots = [r for r in lora_roots
                     if os.path.normcase(lora_dir) == os.path.normcase(r)
                     or os.path.normcase(lora_dir).startswith(os.path.normcase(r) + os.sep)]

            if not roots:
                return os.path.basename(lora_dir)

            folder = os.path.relpath(lora_dir, max(roots, key=len))
            return "" if folder == "." else folder.replace(os.sep, "/")

        loras_list = []
        for lora in networks.available_networks.values():
            loras_list.append({
                "name": lora.name,
                "alias": lora.get_alias(),
                "filename": lora.filename,
                "folder": get_lora_folder(lora.filename),
                **loras.read_user_metadata(lora.filename)
            })
        return JSONResponse(jsonable_encoder(loras_list))

    def get_civitai_model_info(self, kind: str = "checkpoint", name: str = "", hash: str = ""):
        """Civitai page and metadata of a checkpoint or LoRA, by name and/or hash
        (no name and hash: the selected checkpoint)"""
        import modules.hashes as hashes

        file_hash = None

        if kind == "lora":
            networks = sys.modules.get("networks")
            available = networks.available_networks if networks else {}
            lora = available.get(name) or next((n for key, n in available.items() if key.lower() == name.lower()), None)

            if lora:
                file_hash = lambda: hashes.sha256(lora.filename, f"lora/{lora.name}")
        else:
            info = sd_models.get_closet_checkpoint_match(name or shared.opts.sd_model_checkpoint)

            if info:
                name = name or info.name

                def file_hash():
                    info.calculate_shorthash()
                    return info.sha256

        store_dir = persist.get_store_file_path(self.get_file_path("", upper=True), "")
        config = persist.read_json_file(self.get_file_path(EXTENSION_CONFIG_FILE, upper=True)) or {}
        domain = config.get("civitaiDomain", "com")
        return JSONResponse(civitai.model_info(name, hash, file_hash, store_dir, domain))

    def on_before_config_presets(self, component, *args, **kwargs):
        if kwargs.get("elem_id") == "config_preset_txt2img_dropdown":
            self.config_presets_dropdown = component

    def clear_outputs_dir(self):
        persist.clear_directory(self.outputs_dir)

    def clear_generated_images(self):
        persist.clear_directory_except(self.outputs_dir, ["image-bench"])

    async def save_controlnet_images(self, request: Request):
        content = await request.body()
        options = json.loads(content)
        output_folder = os.path.join(self.image_bench_dir, "controlnet", options["generation_id"])

        # The gallery also contains the generated images and grids; they carry generation parameters
        # (or are saved to a grids directory), while ControlNet detected maps do not
        images = [image for image in options.get("images", [])
                  if os.path.isfile(image) and not self.is_grid_image(image)
                  and not self.has_generation_parameters(image)]

        if images:
            os.makedirs(output_folder, exist_ok=True)
            for image in images:
                shutil.copy(image, output_folder)

    @staticmethod
    def has_generation_parameters(image_path):
        # read_info_from_image also finds parameters stored in EXIF (JPEG/WebP grids and images)
        try:
            with Image.open(image_path) as image:
                geninfo, _ = webui_images.read_info_from_image(image)
                return bool(geninfo)
        except Exception:
            return True

    def is_grid_image(self, image_path):
        root_dir = self.get_webui_root_dir()
        grid_dirs = [os.path.join(root_dir, "outputs", "txt2img-grids"), os.path.join(root_dir, "outputs", "img2img-grids")]

        for name in ["outdir_grids", "outdir_txt2img_grids", "outdir_img2img_grids"]:
            value = getattr(shared.opts, name, None)
            if value:
                grid_dirs.append(value if os.path.isabs(value) else os.path.join(root_dir, value))

        image_path = os.path.normcase(os.path.abspath(image_path))

        for grid_dir in grid_dirs:
            grid_dir = os.path.normcase(os.path.abspath(grid_dir))
            if image_path.startswith(grid_dir + os.sep):
                return True

        return False

    async def get_controlnet_images(self, id: str):
        image_folder = os.path.join(self.image_bench_dir, "controlnet", id)

        result = []
        if os.path.exists(image_folder):
            for image in os.listdir(image_folder):
                image_path = os.path.join(image_folder, image)
                result.append(f"/file={image_path}")

        response = jsonable_encoder(result)
        return JSONResponse(response)

    async def image_tray_upload(self, file: UploadFile):
        file_data = await file.read()
        result = await tray.image_tray_upload(file.filename, file_data, self.image_bench_dir, IMAGE_TRAY_FILE)
        return JSONResponse(content=result)

    def download_image_tray(self, kind: str):
        store_dir = self.get_file_path("store", upper=True)
        file_path, status_code = tray.download_image_tray(
            kind,
            self.image_bench_dir,
            store_dir,
            IMAGE_TRAY_FILE,
            CONCEPT_TRAY_FILE
        )

        if status_code == 200 and file_path:
            return FileResponse(file_path, media_type="application/zip")
        elif status_code == 204:
            return Response(status_code=HTTP_204_NO_CONTENT)
        else:  # 404
            raise HTTPException(status_code=404, detail="Not found")

    async def explore_export(self, request: Request):
        form = await request.form()
        data = json.loads(form.get("data") or "{}")
        roots = self.get_image_output_dirs()

        def resolve_path(image):
            path = image.get("imagePath")
            return path if explore_export.is_allowed_image(path, roots) else None

        content = explore_export.generate_explore_html(data.get("groups") or [], resolve_path,
                                                       data.get("title") or "Image Bench exploration")
        return StreamingResponse(content, media_type="text/html; charset=utf-8",
                                 headers={"Content-Disposition": explore_export.content_disposition()})

    def get_image_output_dirs(self):
        """Directories that generated images may be read from"""
        root_dir = self.get_webui_root_dir()
        option_names = ["outdir_samples", "outdir_txt2img_samples", "outdir_img2img_samples",
                        "outdir_extras_samples", "outdir_grids", "outdir_txt2img_grids",
                        "outdir_img2img_grids", "outdir_save"]
        dirs = [self.outputs_dir, os.path.join(root_dir, "outputs")]

        for name in option_names:
            value = getattr(shared.opts, name, None)
            if value:
                dirs.append(value if os.path.isabs(value) else os.path.join(root_dir, value))

        return dirs

    def import_image_tray(self, archive_path):
        result = tray.import_image_tray(archive_path, self.image_bench_dir, IMAGE_TRAY_FILE)
        return JSONResponse(content=result)


try:
    api = ImageBenchApi()
    script_callbacks.on_app_started(api.start)
    script_callbacks.on_image_saved(api.on_image_saved)
    script_callbacks.on_before_component(api.on_before_config_presets)
except Exception as e:
    print(e)
