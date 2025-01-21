import asyncio
import json
import math
import os
import re
import shutil
import time
import zipfile

from fastapi import FastAPI, Body, HTTPException, Request, Response, UploadFile
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
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from starlette.status import HTTP_204_NO_CONTENT

DEFAULT_CONFIG = """{
  "repositionConfigPresetsDropdown": false,
  "automaticallyClearGeneratedImages": true
}
"""

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

    def get_path(self, path):
        return f"{self.BASE_PATH}{path}"

    def get_webui_root_dir(self):
        return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    def read_json_file(self, file_path):
        try:
            with open(file_path, 'r', encoding="utf-8") as file:
                data = json.load(file)
            return data
        except FileNotFoundError:
            print(f"Error: The file at {file_path} was not found.")
            return None
        except json.JSONDecodeError:
            print(f"Error: Failed to decode JSON from the file at {file_path}.")
            return None

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
        self.add_api_route("/image_tray_upload", self.image_tray_upload, methods=["POST"])
        self.add_api_route("/concept_tray_upload", self.image_tray_upload, methods=["POST"])
        self.app.add_websocket_route(self.BASE_PATH + "/websocket", self.handle_websocket)
        self.add_api_route("/close_websocket", self.close_websocket, methods=["GET"])
        self.add_api_route("/download_image_tray", self.download_image_tray, methods=["GET"])

    def add_api_route(self, path: str, endpoint, **kwargs):
        return self.app.add_api_route(self.get_path(path), endpoint, **kwargs)

    def get_config(self):
        config_path = self.get_file_path("../config.json")

        return FileResponse(config_path, media_type="application/json")

    def get_webui_config(self):
        config_path = os.path.join(self.get_webui_root_dir(), "config.json")
        return self.read_json_file(config_path) or {}

    async def write_config(self, request: Request):
        content = await request.body()
        config_path = self.get_file_path("../config.json")

        with open(config_path, mode="wb") as f:
            f.write(content)

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
                "imagePath": filename,
                "parameters": self.pnginfo_to_dict(image_data.p.prompt, image_data.p.negative_prompt,
                                                   image_data.pnginfo)
            }

            self.websocket_queue.put_nowait(msg)

    def pnginfo_to_dict(self, prompt, negative_prompt, pnginfo):
        parts = pnginfo["parameters"].split("\n")
        result_dict = {
            "prompt": prompt,
            "negative prompt": negative_prompt,
        }

        return result_dict | parse_pnginfo(parts[-1])

    def prompts_from_pnginfo(self, pnginfo):
        lines = pnginfo.split("\n")
        lines = lines[:-1]
        neg_start = len(lines)

        for i, line in enumerate(lines):
            if line.startswith("Negative prompt: "):
                neg_start = i

        p = "\n".join(lines[:neg_start])
        n = "\n".join(lines[neg_start:]).replace("Negative prompt: ", "")

        return p, n

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
        content = await request.body()
        return await self.write_store_file("explore_presets.json", content.decode("utf-8"))

    def get_image_tray(self):
        return self.serve_store_file(IMAGE_TRAY_FILE)

    async def write_image_tray(self, request: Request):
        content = await request.body()
        return await self.write_store_file(IMAGE_TRAY_FILE, content.decode("utf-8"))

    def get_concept_tray(self):
        return self.serve_store_file(CONCEPT_TRAY_FILE)

    async def write_concept_tray(self, request: Request):
        content = await request.body()
        return await self.write_store_file(CONCEPT_TRAY_FILE, content.decode("utf-8"))

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
                result.append(image_path)

        response = jsonable_encoder(result)
        return JSONResponse(response)

    async def image_tray_upload(self, file: UploadFile):
        imported_dir = os.path.join(self.image_bench_dir, "images")
        imported_file = os.path.join(imported_dir, file.filename)
        os.makedirs(imported_dir, exist_ok=True)

        with open(imported_file, "wb") as f:
            f.write(await file.read())

        if imported_file.lower().endswith(".zip"):
            return self.import_image_tray(imported_file)
        else:
            image = Image.open(imported_file)
            result = {"error": "No PNGINFO text found."}

            if hasattr(image, "text") and image.text:
                parameters = image.text.get("parameters")

                if parameters:
                    p, n = self.prompts_from_pnginfo(parameters)
                    result = {
                        "imagePath": imported_file,
                        "parameters": self.pnginfo_to_dict(p, n, image.text)
                    }

            return JSONResponse(content=result)

    def download_image_tray(self, kind: str):
        export_dir = os.path.join(self.image_bench_dir, "export")
        export_file = os.path.join(export_dir, str(round(time.time() * 1000)) + ".zip")
        os.makedirs(export_dir, exist_ok=True)

        image_tray_file = IMAGE_TRAY_FILE if kind == "image_tray" else CONCEPT_TRAY_FILE
        image_tray_file = self.get_file_path("../store/" + image_tray_file)

        if os.path.exists(image_tray_file):
            image_tray = self.read_json_file(image_tray_file)
            images = image_tray["images"]
            controlnet_artifacts = {}

            if images and len(images):
                with zipfile.ZipFile(export_file, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    for image in images:
                        archive_name = "images/" + os.path.basename(image["imagePath"])
                        zip_file.write(image["imagePath"], archive_name)
                        image["imagePath"] = archive_name

                        if image.get("generationId"):
                            image_controlnet_dir = os.path.join(self.image_bench_dir, "controlnet",
                                                                image["generationId"])
                            if os.path.isdir(image_controlnet_dir):
                                controlnet_artifacts[image["generationId"]] = image_controlnet_dir

                    zip_file.writestr(IMAGE_TRAY_FILE, json.dumps(image_tray))

                    for gen_id, gen_dir in controlnet_artifacts.items():
                        for gen_file in os.listdir(gen_dir):
                            gen_file_path = os.path.join(gen_dir, gen_file)
                            zip_file.write(gen_file_path, "controlnet/" + gen_id + "/" + gen_file)

                    return FileResponse(export_file, media_type="application/zip")
            else:
                return Response(status_code=HTTP_204_NO_CONTENT)
        else:
            raise HTTPException(status_code=404, detail="Not found")

    def import_image_tray(self, archive_path):
        image_tray_file = os.path.join(self.image_bench_dir, "image_tray.json")
        image_tray = None

        try:
            with zipfile.ZipFile(archive_path, "r") as zip_file:
                if IMAGE_TRAY_FILE in zip_file.namelist():
                    zip_file.extractall(self.image_bench_dir)

                    image_tray = self.read_json_file(image_tray_file)

                    if image_tray:
                        for image in image_tray["images"]:
                            image["imagePath"] = self.image_bench_dir + "/" + image["imagePath"]

                        return JSONResponse(content=image_tray["images"])
        finally:
            if image_tray:
                os.unlink(image_tray_file)
            os.unlink(archive_path)

        return {"error": "Error extracting archive."}


try:
    api = ImageBenchApi()
    script_callbacks.on_app_started(api.start)
    script_callbacks.on_image_saved(api.on_image_saved)
    script_callbacks.on_before_component(api.on_before_config_presets)
except Exception as e:
    print(e)


def parse_pnginfo(input_string):
    def tokenize(string):
        token_pattern = re.compile(r''':(?=(?:[^"]|"[^"]*")*$)|,(?=(?:[^"]|"[^"]*")*$)''')
        return token_pattern.split(string)

    def parse_tokens(tokens):
        result = {}
        i = 0
        while i < len(tokens):
            key_token = tokens[i].strip()
            if i + 1 < len(tokens):
                value_token = tokens[i+1].strip()

                if value_token.startswith('"') and value_token.endswith('"'):
                    nested_string = value_token[1:-1]
                    result[key_token.lower()] = parse_pnginfo(nested_string)
                    i += 2
                else:
                    result[key_token.lower()] = value_token
                    i += 2
            else:
                i += 1
        return result

    tokens = tokenize(input_string)
    parsed_result = parse_tokens(tokens)
    return parsed_result
