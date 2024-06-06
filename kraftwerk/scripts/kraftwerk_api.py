import asyncio
import json
import math
import os

from fastapi import FastAPI, Body, HTTPException, Request, Response
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


class KraftwerkApi():

    BASE_PATH = "/kraftwerk"

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
        self.add_api_route("/write_explore_presets", self.write_explore_presets, methods=["POST"])
        self.app.add_websocket_route(self.BASE_PATH + "/websocket", self.handle_websocket)

    def get_config(self):
        config_path = self.get_file_path("../config.json")
        return FileResponse(config_path, media_type="application/json")

    def get_window(self):
        index_html_path = self.get_file_path("index.html")
        return FileResponse(index_html_path)

    def on_image_saved(self, image_data):
        filename = image_data.filename

        if "txt2img-images" in filename or "img2img-images" in filename:
            outputs_dir = (os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
            filename = outputs_dir + "/" + filename
            filename = filename.replace("\\", "/")

            # data_dict = {k: v for k, v in image_data.p.__dict__.items()
            #              if isinstance(v, (int, float, str, bool, dict)) and
            #                 not (isinstance(v, (int, float)) and math.isinf(v))}

            msg = {
                "type": "SAVED_IMAGE",
                "filename": filename,
                #"params": data_dict,
                "pnginfo": self.pnginfo_to_dict(image_data.pnginfo)
            }

            self.websocket_queue.put_nowait(msg)

    def pnginfo_to_dict(self, pnginfo):
        parts = pnginfo["parameters"].split("\n")
        lines = parts[-1].split(', ')

        result_dict = {}
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                result_dict[key.strip().lower()] = value.strip()

        return result_dict

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
        result = "{}"
        presets_file = self.get_file_path("explore_presets.json", upper=True)

        if os.path.exists(presets_file):
            with open(presets_file, encoding="utf-8") as f:
                result = f.read()

        return Response(result, media_type="application/json")

    async def write_explore_presets(self, request: Request):
        presets_file = self.get_file_path("explore_presets.json", upper=True)

        with open(presets_file, mode="w", encoding="utf-8") as f:
            f.write((await request.body()).decode("utf-8"))

        return Response("", media_type="application/json")


try:
    api = KraftwerkApi()
    script_callbacks.on_app_started(api.start)
    script_callbacks.on_image_saved(api.on_image_saved)
except Exception as e:
    print(e)