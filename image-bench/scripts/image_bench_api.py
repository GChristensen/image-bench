import asyncio
import json
import math
import os
import shutil

from fastapi import FastAPI, Body, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse

import gradio as gr
import modules.shared as shared
import modules.script_callbacks as script_callbacks


import os

import websockets
from fastapi import FastAPI, Body, HTTPException, Request, Response
from fastapi.responses import FileResponse

import gradio as gr
import modules.shared as shared
import modules.script_callbacks as script_callbacks
from starlette.responses import JSONResponse


class ImageBenchApi():

    BASE_PATH = "/image-bench"

    def __init__(self):
        self.config_presets_dropdown = None

    def get_path(self, path):
        return f"{self.BASE_PATH}{path}"

    def add_api_route(self, path: str, endpoint, **kwargs):
        return self.app.add_api_route(self.get_path(path), endpoint, **kwargs)

    def start(self, _: gr.Blocks, app: FastAPI):
        self.app = app
        self.websocket_queue = asyncio.Queue()
        self.add_api_route("/window", self.get_window, methods=["GET"])
        self.add_api_route("/config.json", self.get_config, methods=["GET"])
        self.add_api_route("/explore_presets", self.get_explore_presets, methods=["GET"])
        self.add_api_route("/explore_presets", self.write_explore_presets, methods=["POST"])
        self.add_api_route("/image_tray", self.get_image_tray, methods=["GET"])
        self.add_api_route("/image_tray", self.write_image_tray, methods=["POST"])
        self.add_api_route("/config_presets", self.get_presets, methods=["GET"])
        self.app.add_websocket_route(self.BASE_PATH + "/websocket", self.handle_websocket)

    def get_config(self):
        config_path = self.get_file_path("../config.json")
        return FileResponse(config_path, media_type="application/json")

    def get_window(self):
        index_html_path = self.get_file_path("index.html")
        return FileResponse(index_html_path)

    def get_root_dir(self):
        return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    def on_image_saved(self, image_data):
        filename = image_data.filename

        if "txt2img-images" in filename or "img2img-images" in filename:
            filename = self.get_root_dir() + "/" + filename
            filename = filename.replace("\\", "/")

            # data_dict = {k: v for k, v in image_data.p.__dict__.items()
            #              if isinstance(v, (int, float, str, bool, dict)) and
            #                 not (isinstance(v, (int, float)) and math.isinf(v))}

            msg = {
                "type": "SAVED_IMAGE",
                "imagePath": filename,
                "parameters": self.pnginfo_to_dict(image_data.pnginfo)
                #"data": data_dict,
            }

            self.websocket_queue.put_nowait(msg)

    def pnginfo_to_dict(self, pnginfo):
        parts = pnginfo["parameters"].split("\n")
        result_dict = {
            "prompt": parts[0] if len(parts) > 1 and not parts[0].startswith("Negative prompt: ") else "",
            "negative prompt": parts[1].replace("Negative prompt: ", "") if len(parts) > 2
                                                                           and parts[1].startswith("Negative prompt: ")
                                                                           else ""
        }

        lines = parts[-1].split('"') # controlnet subparams, etc.
        self.extract_params(lines[0], result_dict)

        if len(lines) > 1:
            key = list(result_dict)[-1]
            result_dict[key] = {}
            self.extract_params(lines[1], result_dict[key])

            subparams = lines[2:-1]
            pairs = [subparams[i:i + 2] for i in range(0, len(subparams), 2)]

            for pair in pairs:
                if len(pair) == 2:
                    key = pair[0].strip().lower().replace(":", "").replace(", ", "")
                    result_dict[key] = {}
                    self.extract_params(pair[1].strip(), result_dict[key])

            self.extract_params(lines[-1], result_dict)
        return result_dict

    def extract_params(self, line, result_dict):
        main_params = line.split(", ")

        for param in main_params:
            if ':' in param:
                key, value = param.split(':', 1)
                result_dict[key.strip().lower()] = value.strip()

    def get_file_path(self, file_name, upper=False):
        current_dir = os.path.dirname(os.path.abspath(__file__))

        if upper:
            current_dir = os.path.dirname(current_dir)

        file_path = os.path.join(current_dir, file_name)
        return file_path

    async def handle_websocket(self, websocket, *args):
        await websocket.accept()

        while True:
            try:
                msg = await self.websocket_queue.get()
                await websocket.send_text(json.dumps(msg))
            finally:
                self.websocket_queue.task_done()

    def get_explore_presets(self):
        return self.serve_store_file("explore_presets.json")

    async def write_explore_presets(self, request: Request):
        content = await request.body()
        return await self.write_store_file("explore_presets.json", content.decode("utf-8"))

    def get_image_tray(self):
        return self.serve_store_file("image_tray.json")

    async def write_image_tray(self, request: Request):
        content = await request.body()
        return await self.write_store_file("image_tray.json", content.decode("utf-8"))

    def serve_store_file(self, filename):
        result = ""
        presets_file = self.get_file_path(f"store/{filename}", upper=True)

        if os.path.exists(presets_file):
            with open(presets_file, encoding="utf-8") as f:
                result = f.read()

        return Response(result, media_type="application/json")

    async def write_store_file(self, filename, content):
        presets_file = self.get_file_path(f"store/{filename}", upper=True)

        with open(presets_file, mode="w", encoding="utf-8") as f:
            f.write(content)

        return Response("", media_type="application/json")

    def get_presets(self):
        if self.config_presets_dropdown:
            response = jsonable_encoder(self.config_presets_dropdown.choices)
        else:
            response = jsonable_encoder([])

        return JSONResponse(response)

    # def clear_outputs(self):
    #     folder = os.path.join(self.get_root_dir(), "outputs")
    #
    #     for filename in os.listdir(folder):
    #         file_path = os.path.join(folder, filename)
    #         try:
    #             if os.path.isfile(file_path) or os.path.islink(file_path):
    #                 os.unlink(file_path)
    #             elif os.path.isdir(file_path):
    #                 shutil.rmtree(file_path)
    #         except Exception as e:
    #             print('Failed to delete %s. Reason: %s' % (file_path, e))

    def on_before_config_presets(self, component, *args, **kwargs):
        if kwargs.get("elem_id") == "config_preset_txt2img_dropdown":
            self.config_presets_dropdown = component

try:
    api = ImageBenchApi()
    script_callbacks.on_app_started(api.start)
    script_callbacks.on_image_saved(api.on_image_saved)
    script_callbacks.on_before_component(api.on_before_config_presets)
except Exception as e:
    print(e)