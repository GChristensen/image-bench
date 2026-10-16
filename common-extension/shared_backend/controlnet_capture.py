"""
ControlNet inputs of the generations: the host page captures the enabled units when a generation is queued
and the generated images carry the capture id (controlnetId).

image-bench/controlnet/<id>/
    units.json          {"units": [{"index", "params", "image", "mask", "preview"}]}, the files relative to
                        controlnet/, so that a capture equal to the previous one refers to its files
    unit<N>_<kind>.png  images of the units

Folders without units.json are the detected maps of older batches (scraped from the WebUI result gallery),
named by the generationId of their images.
"""

import base64
import json
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote

CONTROLNET_DIR = "controlnet"
UNITS_FILE = "units.json"
IMAGE_KINDS = ("image", "mask", "preview")
CAPTURE_ID = re.compile(r"^[\w.-]+$")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
FILE_ROUTE = "/image-bench/controlnet/capture_file?path="


class CaptureError(Exception):
    pass


def controlnet_dir(image_bench_dir: str) -> str:
    return os.path.join(image_bench_dir, CONTROLNET_DIR)


def check_id(capture_id) -> str:
    if not isinstance(capture_id, str) or not CAPTURE_ID.match(capture_id) or capture_id in (".", ".."):
        raise CaptureError(f"Invalid capture id: {capture_id!r}")

    return capture_id


def decode_data_url(data_url: str) -> bytes:
    """The content of a base64 data URL (the image of a unit as sent by the host page)"""
    header, _, data = data_url.partition(",")

    if not header.startswith("data:") or ";base64" not in header:
        raise CaptureError("Images must be base64 data URLs")

    return base64.b64decode(data)


def read_units(capture_dir: str) -> Optional[List[Dict[str, Any]]]:
    try:
        with open(os.path.join(capture_dir, UNITS_FILE), "r", encoding="utf-8") as file:
            return json.load(file).get("units") or []
    except (OSError, ValueError):
        return None


def save_capture(image_bench_dir: str, data: Dict[str, Any]) -> None:
    """
    Save a capture sent by the host page: {id, units: [{index, params, image, mask, preview}]} with the images
    as data URLs, or {id, sameAs} for a capture equal to an earlier one, which then shares its files
    """
    capture_id = check_id(data.get("id"))
    base_dir = controlnet_dir(image_bench_dir)
    capture_dir = os.path.join(base_dir, capture_id)
    same_as = data.get("sameAs")

    if same_as:
        units = read_units(os.path.join(base_dir, check_id(same_as)))

        if units is None:
            raise CaptureError(f"Unknown capture: {same_as}")
    else:
        units = []
        os.makedirs(capture_dir, exist_ok=True)

        for unit in data.get("units") or []:
            index = int(unit.get("index", 0))
            entry = {"index": index, "params": unit.get("params") or {}}

            for kind in IMAGE_KINDS:
                if unit.get(kind):
                    name = f"unit{index}_{kind}.png"

                    with open(os.path.join(capture_dir, name), "wb") as file:
                        file.write(decode_data_url(unit[kind]))

                    entry[kind] = f"{capture_id}/{name}"

            units.append(entry)

    os.makedirs(capture_dir, exist_ok=True)
    temp = os.path.join(capture_dir, UNITS_FILE + ".tmp")

    with open(temp, "w", encoding="utf-8") as file:
        json.dump({"units": units}, file, ensure_ascii=False, indent=1)

    os.replace(temp, os.path.join(capture_dir, UNITS_FILE))


def file_url(path: str) -> str:
    return FILE_ROUTE + quote(path)


def read_capture(image_bench_dir: str, capture_id: str) -> List[Dict[str, Any]]:
    """
    The units of a capture with the URLs of their images; a folder of an older batch gives one unit
    without index and parameters, holding its detected maps in "files"
    """
    capture_dir = os.path.join(controlnet_dir(image_bench_dir), check_id(capture_id))

    if not os.path.isdir(capture_dir):
        return []

    units = read_units(capture_dir)

    if units is None:
        files = sorted(name for name in os.listdir(capture_dir)
                       if os.path.splitext(name)[1].lower() in IMAGE_EXTENSIONS)
        return [{"index": None, "params": {}, "files": [file_url(f"{capture_id}/{name}") for name in files]}] \
            if files else []

    return [{**unit, **{kind: file_url(unit[kind]) for kind in IMAGE_KINDS if unit.get(kind)}} for unit in units]


def capture_file_path(image_bench_dir: str, path: str) -> str:
    """The file of a capture; the path is relative to controlnet/ and must stay inside it"""
    base_dir = os.path.realpath(controlnet_dir(image_bench_dir))
    file_path = os.path.realpath(os.path.join(base_dir, path or ""))

    if os.path.commonpath([base_dir, file_path]) != base_dir or not os.path.isfile(file_path):
        raise CaptureError(f"No such file: {path}")

    return file_path


def capture_dirs(image_bench_dir: str, image: Dict[str, Any]) -> Dict[str, str]:
    """
    The capture folders of an image by their id (for the tray archives): its capture, the captures whose files
    it shares, and the folder of an older batch named by its generationId
    """
    base_dir = controlnet_dir(image_bench_dir)
    result = {}

    for capture_id in (image.get("controlnetId"), image.get("generationId")):
        if not capture_id or not CAPTURE_ID.match(capture_id):
            continue

        capture_dir = os.path.join(base_dir, capture_id)

        if not os.path.isdir(capture_dir):
            continue

        result[capture_id] = capture_dir

        for unit in read_units(capture_dir) or []:
            for kind in IMAGE_KINDS:
                shared_id = unit.get(kind, "").split("/")[0]

                if shared_id and shared_id != capture_id and CAPTURE_ID.match(shared_id):
                    shared_dir = os.path.join(base_dir, shared_id)

                    if os.path.isdir(shared_dir):
                        result[shared_id] = shared_dir

    return result
