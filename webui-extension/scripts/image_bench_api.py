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
from fastapi.responses import FileResponse

import gradio as gr
import modules.script_callbacks as script_callbacks
import modules.sd_models as sd_models
import requests

import websockets
from starlette.responses import JSONResponse
from PIL import Image
from starlette.status import HTTP_204_NO_CONTENT

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared import persist
from shared import tray

DEFAULT_CONFIG = """{
  "repositionConfigPresetsDropdown": false,
  "automaticallyClearGeneratedImages": true
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
        self.add_api_route("/save_controlnet_images", self.save_controlnet_images, methods=["POST"])
        self.add_api_route("/get_controlnet_images", self.get_controlnet_images, methods=["GET"])
        self.add_api_route("/download_image_tray", self.download_image_tray, methods=["GET"])
        self.add_api_route("/image_tray_upload", self.image_tray_upload, methods=["POST"])
        self.add_api_route("/concept_tray_upload", self.image_tray_upload, methods=["POST"])
        self.add_api_route("/models", self.get_models, methods=["GET"])
        self.app.add_websocket_route(self.BASE_PATH + "/websocket", self.handle_websocket)
        self.add_api_route("/close_websocket", self.close_websocket, methods=["GET"])

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
        return FileResponse(index_html_path)

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

    def on_before_config_presets(self, component, *args, **kwargs):
        if kwargs.get("elem_id") == "config_preset_txt2img_dropdown":
            self.config_presets_dropdown = component

    def clear_outputs_dir(self):
        folder = self.outputs_dir

        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print('Failed to delete %s. Reason: %s' % (file_path, e))

    async def save_controlnet_images(self, request: Request):
        content = await request.body()
        options = json.loads(content)
        output_folder = os.path.join(self.image_bench_dir, "controlnet", options["generation_id"])

        os.makedirs(output_folder, exist_ok=True)

        if "images" in options and len(options["images"]) > 0:
            for image in options["images"]:
                shutil.copy(image, output_folder)

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
