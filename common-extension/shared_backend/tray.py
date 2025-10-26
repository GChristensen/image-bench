"""
Shared tray management functions for image and concept trays.
Handles upload, download, import, and export operations.

This module is framework-agnostic and works with both FastAPI and aiohttp.
"""

import os
import json
import time
import zipfile
import re
from typing import Dict, Any, Optional, Tuple, Union
from PIL import Image

from .persist import read_json_file


def parse_pnginfo(input_string: str) -> Dict[str, Any]:
    """
    Parse PNG metadata string into a dictionary.

    Args:
        input_string: PNG metadata string to parse

    Returns:
        Dictionary of parsed metadata
    """
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


def prompts_from_pnginfo(pnginfo: str) -> Tuple[str, str]:
    """
    Extract positive and negative prompts from PNG info string.

    Args:
        pnginfo: PNG metadata string

    Returns:
        Tuple of (positive_prompt, negative_prompt)
    """
    lines = pnginfo.split("\n")
    lines = lines[:-1]
    neg_start = len(lines)

    for i, line in enumerate(lines):
        if line.startswith("Negative prompt: "):
            neg_start = i

    p = "\n".join(lines[:neg_start])
    n = "\n".join(lines[neg_start:]).replace("Negative prompt: ", "")

    return p, n


def pnginfo_to_dict(prompt: str, negative_prompt: str, pnginfo: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert PNG info to a dictionary with prompts and parameters.

    Args:
        prompt: Positive prompt text
        negative_prompt: Negative prompt text
        pnginfo: PNG metadata dictionary

    Returns:
        Dictionary with prompt and parsed parameters
    """
    parts = pnginfo["parameters"].split("\n")
    result_dict = {
        "prompt": prompt,
        "negative prompt": negative_prompt,
    }

    return result_dict | parse_pnginfo(parts[-1])


async def image_tray_upload(
    filename: str,
    file_data: bytes,
    image_bench_dir: str,
    image_tray_file: str
) -> Dict[str, Any]:
    """
    Handle image tray upload (single image or zip archive).

    Args:
        filename: Name of the uploaded file
        file_data: File content as bytes
        image_bench_dir: Base directory for image bench files
        image_tray_file: Name of the image tray JSON file

    Returns:
        Dictionary with imported image data or error
    """
    imported_dir = os.path.join(image_bench_dir, "images")
    imported_file = os.path.join(imported_dir, filename)
    os.makedirs(imported_dir, exist_ok=True)

    with open(imported_file, "wb") as f:
        f.write(file_data)

    if imported_file.lower().endswith(".zip"):
        return import_image_tray(imported_file, image_bench_dir, image_tray_file)
    else:
        image = Image.open(imported_file)
        result = {"error": "No PNGINFO text found."}

        if hasattr(image, "text") and image.text:
            parameters = image.text.get("parameters")

            if parameters:
                p, n = prompts_from_pnginfo(parameters)
                result = {
                    "imagePath": imported_file,
                    "parameters": pnginfo_to_dict(p, n, image.text)
                }

        return result


def download_image_tray(
    kind: str,
    image_bench_dir: str,
    store_dir: str,
    image_tray_file: str,
    concept_tray_file: str
) -> Tuple[Optional[str], int]:
    """
    Download image or concept tray as a zip archive.

    Args:
        kind: Type of tray ("image_tray" or "concept_tray")
        image_bench_dir: Base directory for image bench files
        store_dir: Directory containing tray JSON files
        image_tray_file: Name of the image tray JSON file
        concept_tray_file: Name of the concept tray JSON file

    Returns:
        Tuple of (zip_file_path, status_code) where:
        - zip_file_path is the path to the generated zip file, or None if empty/not found
        - status_code is 200 (OK), 204 (No Content), or 404 (Not Found)
    """
    export_dir = os.path.join(image_bench_dir, "export")
    export_file = os.path.join(export_dir, str(round(time.time() * 1000)) + ".zip")
    os.makedirs(export_dir, exist_ok=True)

    tray_filename = image_tray_file if kind == "image_tray" else concept_tray_file
    tray_file_path = os.path.join(store_dir, tray_filename)

    if os.path.exists(tray_file_path):
        image_tray = read_json_file(tray_file_path)
        images = image_tray["images"]
        controlnet_artifacts = {}

        if images and len(images):
            with zipfile.ZipFile(export_file, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for image in images:
                    archive_name = "images/" + os.path.basename(image["imagePath"])
                    zip_file.write(image["imagePath"], archive_name)
                    image["imagePath"] = archive_name

                    if image.get("generationId"):
                        image_controlnet_dir = os.path.join(
                            image_bench_dir, "controlnet", image["generationId"]
                        )
                        if os.path.isdir(image_controlnet_dir):
                            controlnet_artifacts[image["generationId"]] = image_controlnet_dir

                zip_file.writestr(image_tray_file, json.dumps(image_tray))

                for gen_id, gen_dir in controlnet_artifacts.items():
                    for gen_file in os.listdir(gen_dir):
                        gen_file_path = os.path.join(gen_dir, gen_file)
                        zip_file.write(gen_file_path, "controlnet/" + gen_id + "/" + gen_file)

            return (export_file, 200)  # OK
        else:
            return (None, 204)  # No Content
    else:
        return (None, 404)  # Not Found


def import_image_tray(
    archive_path: str,
    image_bench_dir: str,
    image_tray_file: str
) -> Union[list, Dict[str, str]]:
    """
    Import image tray from a zip archive.

    Args:
        archive_path: Path to zip archive
        image_bench_dir: Base directory for image bench files
        image_tray_file: Name of the image tray JSON file

    Returns:
        List of imported images or dict with error message
    """
    tray_file_path = os.path.join(image_bench_dir, image_tray_file)
    image_tray = None

    try:
        with zipfile.ZipFile(archive_path, "r") as zip_file:
            if image_tray_file in zip_file.namelist():
                zip_file.extractall(image_bench_dir)

                image_tray = read_json_file(tray_file_path)

                if image_tray:
                    for image in image_tray["images"]:
                        image["imagePath"] = image_bench_dir + "/" + image["imagePath"]

                    return image_tray["images"]
    finally:
        if image_tray:
            os.unlink(tray_file_path)
        os.unlink(archive_path)

    return {"error": "Error extracting archive."}