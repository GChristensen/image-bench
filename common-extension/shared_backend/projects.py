"""
Projects of the Library tab.

The projects are a directory tree under the project root (the projectRoot setting of the extension config, a local
or UNC path as the server sees it). A directory that contains ib_project/ is a project; the tree is not searched
below it. ib_project/ holds:

    project.json        name, tags, notes, final image, parameter snapshot, tray counts
    final.<ext>         copy of the image considered final
    trays/<kind>.zip    the trays in the format of the tray download, so that any of them can be imported into a tray
    controlnet/         control images of the parameter snapshot
    workflow.json       ComfyUI workflow of the parameter snapshot
    thumbs/             thumbnails of the image files of the project directory
    file_info.json      generation parameters of the image files of the project directory (by name, size and time)

The trays of the store directory are the workspace, which is saved into a project and restored from it.
store/current_project.json points to the current project, with the hashes of the tray store files at the last save
or open, which tell the unsaved changes. store/project_index.json caches the summaries of the projects
(revalidated by the modification time of project.json), so that network shares are not read through on every visit.

All paths of the requests are relative to the root ('/'-separated) and must stay inside it.
This module is framework-agnostic: the hosts call dispatch() off the event loop.
"""

import ctypes
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from PIL import Image

from .persist import read_json_file
from .tray import TRAY_FILES, unique_file_path

PROJECT_DIR = "ib_project"
PROJECT_FILE = "project.json"
WORKFLOW_FILE = "workflow.json"
CONTROLNET_DIR = "controlnet"
TRAYS_DIR = "trays"
THUMBS_DIR = "thumbs"
FILE_INFO_FILE = "file_info.json"
INDEX_FILE = "project_index.json"
CURRENT_FILE = "current_project.json"

# Trays saved into a project, in this order
TRAY_KINDS = ("image_tray", "concept_tray", "compare")

# Marking of the final choice in the trays; a project saved without a final image takes the image marked with it
FINAL_MARKING = "\U0001F3C1"

# Name of the tray content in the archives, as in the tray download, which any tray imports
ARCHIVE_TRAY_FILE = TRAY_FILES["image_tray"]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".psd", ".tif", ".tiff"}
# Images whose generation parameters are read (infotext, or the prompt of ComfyUI)
INFO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
# Served as they are; other images are converted to PNG
BROWSER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}
MEDIA_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
               ".gif": "image/gif", ".bmp": "image/bmp", ".avif": "image/avif"}

# Directories not shown in the tree
SKIPPED_DIRS = {PROJECT_DIR.lower(), "$recycle.bin", "system volume information", "__pycache__", "node_modules"}

MAX_TREE_DEPTH = 16
# Subdirectories of a project searched for image files
MAX_FILE_DEPTH = 3
MAX_FILES = 2000
THUMB_SIZE = 256

INVALID_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class ProjectError(Exception):
    """An error reported to the popup, with the HTTP status of the response"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class FileResult:
    """A file response: a path on disk or content in memory"""

    def __init__(self, media_type: str, path: Optional[str] = None, content: Optional[bytes] = None):
        self.media_type = media_type
        self.path = path
        self.content = content


# ---------- Paths ----------

def get_root(config: Dict[str, Any]) -> str:
    root = (config or {}).get("projectRoot") or ""
    return os.path.normpath(root.strip()) if root.strip() else ""


def split_path(path: Optional[str]) -> List[str]:
    """Components of a relative path; '..' is refused"""
    parts = [part for part in (path or "").replace("\\", "/").split("/") if part and part != "."]

    if any(part == ".." for part in parts):
        raise ProjectError("Invalid path")

    return parts


def join_path(parts: List[str]) -> str:
    return "/".join(parts)


def resolve(root: str, path: Optional[str]) -> str:
    """Absolute path of a path relative to the root, which must stay inside it"""
    if not root:
        raise ProjectError("The project root is not set (Settings › Library).", 409)

    absolute = os.path.normpath(os.path.join(root, *split_path(path)))

    if os.path.normcase(os.path.commonpath([root, absolute])) != os.path.normcase(root):
        raise ProjectError("Invalid path")

    return absolute


def relative(root: str, absolute: str) -> str:
    rel = os.path.relpath(absolute, root)
    return "" if rel == "." else rel.replace(os.sep, "/")


def check_name(name: Optional[str]) -> str:
    """A valid file name for a folder or project"""
    name = (name or "").strip().rstrip(".")

    if not name or INVALID_NAME.search(name) or name in (".", "..") or name.lower() == PROJECT_DIR:
        raise ProjectError(f"Invalid name: {name!r}")

    return name


def is_project_dir(path: str) -> bool:
    return os.path.isdir(os.path.join(path, PROJECT_DIR))


def project_paths(root: str, path: str):
    """(project directory, its ib_project directory); the project must exist"""
    directory = resolve(root, path)
    data_dir = os.path.join(directory, PROJECT_DIR)

    if not os.path.isdir(data_dir):
        raise ProjectError("The project does not exist.", 404)

    return directory, data_dir


def host_name(platform: str) -> str:
    """Host of the popup ("webui" or "comfy") by the platform of the tray functions ("webui" or "comfyui")"""
    return "comfy" if platform == "comfyui" else "webui"


# ---------- JSON files ----------

def read_json(path: str, default=None):
    if not os.path.isfile(path):
        return default

    data = read_json_file(path)
    return default if data is None else data


def write_json(path: str, data) -> None:
    """Write a JSON file through a temporary file, so that it is never left half-written"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp = path + ".tmp"

    with open(temp, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=1)

    os.replace(temp, path)


def read_project_file(data_dir: str) -> Dict[str, Any]:
    data = read_json(os.path.join(data_dir, PROJECT_FILE), {})
    return data if isinstance(data, dict) else {}


# ---------- Root ----------

def check_root(root: str) -> Dict[str, Any]:
    """Whether a root directory exists and is writable, and the number of projects under it"""
    if not root:
        return {"exists": False, "writable": False, "projects": 0, "error": "No path"}

    if not os.path.isdir(root):
        return {"exists": False, "writable": False, "projects": 0, "error": "The directory does not exist"}

    # os.access() is unreliable on network shares
    try:
        with tempfile.TemporaryFile(dir=root):
            pass
        writable = True
    except OSError:
        writable = False

    return {"exists": True, "writable": writable, "projects": count_projects(scan_dir(root, root, 0, {}, set()))}


def count_projects(nodes) -> int:
    return sum(1 if node["type"] == "project" else count_projects(node["children"]) for node in nodes)


# ---------- Tree ----------

def summarize(data: Dict[str, Any]) -> Dict[str, Any]:
    """Summary of a project kept in the index: what the tree shows and searches"""
    params = (data.get("parameters") or {}).get("params") or {}

    return {
        # Name the project was saved under; the folder may have been renamed or copied outside Image Bench
        "name": data.get("name"),
        "host": data.get("host"),
        "tags": data.get("tags") or [],
        "prompt": params.get("prompt") or "",
        "negativePrompt": params.get("negativePrompt") or "",
        "savedAt": data.get("savedAt"),
        "final": data.get("final")
    }


def scan_dir(root: str, directory: str, depth: int, index: Dict[str, Any], seen: set) -> List[Dict[str, Any]]:
    """Folders and projects in a directory, sorted by name"""
    try:
        entries = sorted((entry for entry in os.scandir(directory)
                          if entry.is_dir() and not entry.name.startswith(".")
                          and entry.name.lower() not in SKIPPED_DIRS),
                         key=lambda entry: entry.name.lower())
    except OSError:
        return []

    nodes = []

    for entry in entries:
        rel = relative(root, entry.path)

        if is_project_dir(entry.path):
            seen.add(rel)
            nodes.append({"type": "project", "name": entry.name, "path": rel,
                          "project": project_summary(entry.path, rel, index)})
        else:
            children = scan_dir(root, entry.path, depth + 1, index, seen) if depth < MAX_TREE_DEPTH else []
            nodes.append({"type": "folder", "name": entry.name, "path": rel, "children": children})

    return nodes


def project_summary(directory: str, rel: str, index: Dict[str, Any]) -> Dict[str, Any]:
    """Summary from the index, read again if project.json was changed since"""
    project_file = os.path.join(directory, PROJECT_DIR, PROJECT_FILE)

    try:
        mtime = os.stat(project_file).st_mtime
    except OSError:
        mtime = 0

    cached = index.get(rel)

    if cached and cached.get("mtime") == mtime:
        return cached["summary"]

    summary = summarize(read_project_file(os.path.join(directory, PROJECT_DIR)))
    index[rel] = {"mtime": mtime, "summary": summary}
    return summary


def get_tree(root: str, store_dir: str) -> Dict[str, Any]:
    if not root:
        return {"root": "", "exists": False, "nodes": []}

    if not os.path.isdir(root):
        return {"root": root, "exists": False, "nodes": []}

    index_path = os.path.join(store_dir, INDEX_FILE)
    stored = read_json(index_path, {})
    index = dict(stored.get("projects") or {}) if stored.get("root") == root else {}
    seen = set()

    nodes = scan_dir(root, root, 0, index, seen)

    # Projects removed or moved outside of Image Bench are dropped from the index
    index = {rel: entry for rel, entry in index.items() if rel in seen}

    if stored.get("root") != root or index != stored.get("projects"):
        try:
            write_json(index_path, {"root": root, "projects": index})
        except OSError as e:
            print(f"[Image Bench] Unable to write the project index: {e}")

    return {"root": root, "exists": True, "nodes": nodes, "trash": can_trash(root)}


# ---------- Project ----------

def list_files(directory: str) -> List[Dict[str, Any]]:
    """Image files of a project directory and its subdirectories, except ib_project and nested projects"""
    files = []

    def walk(path: str, prefix: str, depth: int):
        try:
            entries = list(os.scandir(path))
        except OSError:
            return

        for entry in entries:
            if len(files) >= MAX_FILES:
                return

            if entry.is_dir():
                if (depth < MAX_FILE_DEPTH and entry.name.lower() not in SKIPPED_DIRS
                        and not entry.name.startswith(".") and not is_project_dir(entry.path)):
                    walk(entry.path, prefix + entry.name + "/", depth + 1)
            elif os.path.splitext(entry.name)[1].lower() in IMAGE_EXTENSIONS:
                try:
                    stat = entry.stat()
                except OSError:
                    continue

                files.append({"name": prefix + entry.name, "size": stat.st_size, "modified": stat.st_mtime})

    walk(directory, "", 0)
    files.sort(key=lambda file: file["modified"], reverse=True)
    return files


def add_file_parameters(directory: str, data_dir: str, files: List[Dict[str, Any]]) -> None:
    """
    Add the generation parameters of the image files ("parameters", left out if they have none), read once and kept
    in ib_project/file_info.json by name, size and modification time
    """
    from .pnginfo import image_info

    cache_path = os.path.join(data_dir, FILE_INFO_FILE)
    cached = read_json(cache_path, {})
    cached = cached if isinstance(cached, dict) else {}
    cache = {}

    for file in files:
        if os.path.splitext(file["name"])[1].lower() not in INFO_EXTENSIONS:
            continue

        key = f"{file['size']}|{file['modified']}"
        entry = cached.get(file["name"])

        if not entry or entry.get("key") != key:
            try:
                with open(os.path.join(directory, *split_path(file["name"])), "rb") as source:
                    parameters = image_info(source.read()).get("parameters") or {}
            except OSError:
                continue

            entry = {"key": key, "parameters": parameters}

        cache[file["name"]] = entry

        if entry["parameters"]:
            file["parameters"] = entry["parameters"]

    if cache != cached:
        try:
            write_json(cache_path, cache)
        except OSError:
            pass  # A read-only project is read again the next time


def get_project(root: str, path: str) -> Dict[str, Any]:
    directory, data_dir = project_paths(root, path)
    data = read_project_file(data_dir)
    files = list_files(directory)
    add_file_parameters(directory, data_dir, files)

    return {
        "path": relative(root, directory),
        "name": os.path.basename(directory),
        "data": data,
        "files": files,
        "trays": {kind: os.path.isfile(os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")) for kind in TRAY_KINDS}
    }


def project_file_path(root: str, path: str, name: str) -> str:
    """A file of a project directory (also in ib_project), by its name relative to the directory"""
    directory, _ = project_paths(root, path)
    file_path = os.path.normpath(os.path.join(directory, *split_path(name)))

    if os.path.normcase(os.path.commonpath([directory, file_path])) != os.path.normcase(directory) \
            or not os.path.isfile(file_path):
        raise ProjectError("File not found", 404)

    return file_path


def get_file(root: str, path: str, name: str, thumb: bool = False) -> FileResult:
    file_path = project_file_path(root, path, name)
    ext = os.path.splitext(file_path)[1].lower()

    if thumb:
        return get_thumbnail(root, path, name, file_path)

    # The workflow of the parameter snapshot
    if ext == ".json":
        return FileResult("application/json", path=file_path)

    if ext in BROWSER_EXTENSIONS:
        return FileResult(MEDIA_TYPES[ext], path=file_path)

    try:
        with Image.open(file_path) as image:
            buffer = io.BytesIO()
            to_rgb(image).save(buffer, format="PNG", compress_level=1)
    except Exception as e:
        raise ProjectError(f"Unable to read the image: {e}", 415)

    return FileResult("image/png", content=buffer.getvalue())


def to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        return image.convert("RGBA")

    return image.convert("RGB")


def get_thumbnail(root: str, path: str, name: str, file_path: str) -> FileResult:
    """JPEG thumbnail, cached in ib_project/thumbs by the name, size and modification time of the file"""
    _, data_dir = project_paths(root, path)
    stat = os.stat(file_path)
    return cached_thumbnail(data_dir, f"{name}|{stat.st_size}|{stat.st_mtime_ns}", lambda: file_path)


def cached_thumbnail(data_dir: str, key: str, open_source) -> FileResult:
    """
    JPEG thumbnail cached in ib_project/thumbs under the hash of a key that changes with the image
    open_source() gives the image to open: a path or a file object
    """
    thumb_path = os.path.join(data_dir, THUMBS_DIR, hashlib.sha1(key.encode("utf-8")).hexdigest() + ".jpg")

    if os.path.isfile(thumb_path):
        return FileResult("image/jpeg", path=thumb_path)

    try:
        with Image.open(open_source()) as image:
            image.draft("RGB", (THUMB_SIZE * 2, THUMB_SIZE * 2))
            image = to_rgb(image)

            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, (22, 25, 29))
                background.paste(image, mask=image.getchannel("A"))
                image = background

            image.thumbnail((THUMB_SIZE, THUMB_SIZE))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=82)
    except Exception as e:
        raise ProjectError(f"Unable to read the image: {e}", 415)

    content = buffer.getvalue()

    try:
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)

        with open(thumb_path, "wb") as file:
            file.write(content)
    except OSError:
        pass  # A read-only project is shown without the cache

    return FileResult("image/jpeg", content=content)


# ---------- File system ----------

def add_file(root: str, path: str, filename: Optional[str], content: Optional[bytes]) -> Dict[str, Any]:
    """Save an image into a project directory under its name (another name if it is taken)"""
    directory, _ = project_paths(root, path)
    name = os.path.basename((filename or "").replace("\\", "/")) or "image.png"

    if content is None:
        raise ProjectError("No file")

    if os.path.splitext(name)[1].lower() not in IMAGE_EXTENSIONS:
        raise ProjectError("Not an image file.", 415)

    target = unique_file_path(directory, check_name(name))

    with open(target, "wb") as file:
        file.write(content)

    return {"name": os.path.basename(target), "project": get_project(root, path)}


def create_folder(root: str, parent: str, name: str) -> Dict[str, Any]:
    directory = os.path.join(resolve(root, parent), check_name(name))

    if os.path.exists(directory):
        raise ProjectError(f"'{name}' already exists.", 409)

    os.makedirs(directory)
    return {"path": relative(root, directory)}


def create_project(root: str, parent: str, name: str, platform: str) -> Dict[str, Any]:
    parent_dir = resolve(root, parent)

    if parent and is_project_dir(parent_dir):
        raise ProjectError("A project cannot be created inside another project.")

    directory = os.path.join(parent_dir, check_name(name))

    if os.path.exists(directory):
        raise ProjectError(f"'{name}' already exists.", 409)

    os.makedirs(os.path.join(directory, PROJECT_DIR))
    write_json(os.path.join(directory, PROJECT_DIR, PROJECT_FILE), {
        "version": 1,
        "name": os.path.basename(directory),
        "host": host_name(platform),
        "created": time.time(),
        "tags": [],
        "notes": "",
        "final": None
    })

    return {"path": relative(root, directory)}


def check_movable(root: str, path: str) -> str:
    source = resolve(root, path)

    if os.path.normcase(source) == os.path.normcase(root):
        raise ProjectError("The project root cannot be changed here.")

    if not os.path.isdir(source):
        raise ProjectError("The folder does not exist.", 404)

    return source


def rename(root: str, store_dir: str, path: str, name: str) -> Dict[str, Any]:
    source = check_movable(root, path)
    target = os.path.join(os.path.dirname(source), check_name(name))

    # A change of case only is a rename on case-insensitive file systems
    if os.path.exists(target) and os.path.normcase(target) != os.path.normcase(source):
        raise ProjectError(f"'{name}' already exists.", 409)

    os.rename(source, target)
    new_path = relative(root, target)
    update_current_path(store_dir, path, new_path)

    # A project renamed here keeps its name in step with the folder
    if is_project_dir(target):
        data_dir = os.path.join(target, PROJECT_DIR)
        data = read_project_file(data_dir)
        data["name"] = os.path.basename(target)
        write_json(os.path.join(data_dir, PROJECT_FILE), data)

    return {"path": new_path}


def move(root: str, store_dir: str, path: str, to: str) -> Dict[str, Any]:
    source = check_movable(root, path)
    parent = resolve(root, to)

    if not os.path.isdir(parent):
        raise ProjectError("The target folder does not exist.", 404)

    if is_project_dir(parent):
        raise ProjectError("A folder or project cannot be moved into a project.")

    source_key = os.path.normcase(source)
    parent_key = os.path.normcase(parent)

    if parent_key == source_key or parent_key.startswith(source_key + os.sep):
        raise ProjectError("A folder cannot be moved into itself.")

    target = os.path.join(parent, os.path.basename(source))

    if os.path.normcase(target) == source_key:
        return {"path": path}

    if os.path.exists(target):
        raise ProjectError(f"'{os.path.basename(source)}' already exists in the target folder.", 409)

    shutil.move(source, target)
    new_path = relative(root, target)
    update_current_path(store_dir, path, new_path)
    return {"path": new_path}


def can_trash(path: str) -> bool:
    """Whether deleted files go to the Recycle Bin (not on network shares)"""
    if path.startswith("\\\\") or path.startswith("//"):
        return False

    try:
        import send2trash  # noqa: F401
        return True
    except ImportError:
        return os.name == "nt"


def trash(path: str) -> None:
    try:
        from send2trash import send2trash
        send2trash(path)
        return
    except ImportError:
        pass

    if os.name != "nt":
        raise ProjectError("The Recycle Bin is not available.", 500)

    # SHFileOperationW with FOF_ALLOWUNDO moves to the Recycle Bin
    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [("hwnd", ctypes.c_void_p), ("wFunc", ctypes.c_uint), ("pFrom", ctypes.c_wchar_p),
                    ("pTo", ctypes.c_wchar_p), ("fFlags", ctypes.c_ushort), ("fAnyOperationsAborted", ctypes.c_int),
                    ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", ctypes.c_wchar_p)]

    fo_delete, fof_silent, fof_noconfirmation, fof_allowundo, fof_noerrorui = 3, 0x4, 0x10, 0x40, 0x400
    operation = SHFILEOPSTRUCTW(wFunc=fo_delete, pFrom=os.path.abspath(path) + "\0",
                                fFlags=fof_silent | fof_noconfirmation | fof_allowundo | fof_noerrorui)
    result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation))

    if result or operation.fAnyOperationsAborted:
        raise ProjectError(f"Unable to move to the Recycle Bin (error {result}).", 500)


def delete(root: str, store_dir: str, path: str) -> Dict[str, Any]:
    target = check_movable(root, path)

    if can_trash(target):
        trash(target)
    else:
        shutil.rmtree(target)

    update_current_path(store_dir, path, None)
    return {}


def delete_file(root: str, path: str, name: str) -> Dict[str, Any]:
    """Delete an image file of a project directory (into the Recycle Bin where it is available); not in ib_project"""
    if split_path(name)[:1] and split_path(name)[0].lower() == PROJECT_DIR:
        raise ProjectError("Files of ib_project cannot be deleted.")

    file_path = project_file_path(root, path, name)

    if os.path.splitext(file_path)[1].lower() not in IMAGE_EXTENSIONS:
        raise ProjectError("Not an image file.", 415)

    if can_trash(file_path):
        trash(file_path)
    else:
        os.unlink(file_path)

    return get_project(root, path)


def reveal(root: str, path: str) -> Dict[str, Any]:
    """Show a folder or project in the file manager of the server computer (the popup offers it when it is local)"""
    target = resolve(root, path)

    if not os.path.isdir(target):
        raise ProjectError("The folder does not exist.", 404)

    if os.name == "nt":
        os.startfile(target)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", target])
    else:
        subprocess.Popen(["xdg-open", target])

    return {}


# ---------- Current project ----------

def read_current(store_dir: str) -> Dict[str, Any]:
    data = read_json(os.path.join(store_dir, CURRENT_FILE), {})
    return data if isinstance(data, dict) else {}


def write_current(store_dir: str, data: Optional[Dict[str, Any]]) -> None:
    path = os.path.join(store_dir, CURRENT_FILE)

    if data:
        write_json(path, data)
    elif os.path.exists(path):
        os.unlink(path)


def update_current_path(store_dir: str, old: str, new: Optional[str]) -> None:
    """Follow a renamed, moved or deleted folder of the current project"""
    current = read_current(store_dir)
    current_path = current.get("path")

    if current_path is None:
        return

    old_parts, current_parts = split_path(old), split_path(current_path)

    if current_parts[:len(old_parts)] != old_parts:
        return

    if new is None:
        write_current(store_dir, None)
    else:
        current["path"] = join_path(split_path(new) + current_parts[len(old_parts):])
        write_current(store_dir, current)


def read_tray_store(store_dir: str, kind: str):
    """(content of the store file of a tray, its hash, its image count)"""
    path = os.path.join(store_dir, TRAY_FILES[kind])

    try:
        with open(path, "rb") as file:
            content = file.read()
    except OSError:
        content = b""

    try:
        count = len(json.loads(content).get("images") or []) if content.strip() else 0
    except (ValueError, AttributeError):
        count = 0

    return content, hashlib.sha1(content).hexdigest() if count else "", count


def get_current(root: str, store_dir: str) -> Dict[str, Any]:
    """The current project with the tray changes since the last save or open"""
    current = read_current(store_dir)
    path = current.get("path")

    if path is None:
        return {"path": None}

    try:
        directory, data_dir = project_paths(root, path)
    except ProjectError:
        return {"path": path, "name": split_path(path)[-1] if split_path(path) else "", "exists": False}

    saved = read_project_file(data_dir).get("trays") or {}
    hashes = current.get("trays") or {}
    trays = {}

    for kind in TRAY_KINDS:
        _, tray_hash, count = read_tray_store(store_dir, kind)
        trays[kind] = {"workspace": count, "saved": (saved.get(kind) or {}).get("count", 0),
                       "changed": tray_hash != hashes.get(kind, "")}

    return {"path": relative(root, directory), "name": os.path.basename(directory), "exists": True,
            "trays": trays, "changed": any(tray["changed"] for tray in trays.values())}


def set_current(root: str, store_dir: str, path: Optional[str]) -> Dict[str, Any]:
    """Make a project current as the workspace is (its trays count as saved), or forget the current project"""
    if path is None:
        write_current(store_dir, None)
        return {"path": None}

    project_paths(root, path)
    write_current(store_dir, {"path": path,
                              "trays": {kind: read_tray_store(store_dir, kind)[1] for kind in TRAY_KINDS}})
    return get_current(root, store_dir)


# ---------- Metadata ----------

def update_project(root: str, path: str, changes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Change the tags or notes of a project, saved at once (they are not part of the workspace);
    "name": true takes the folder name as the name of the project
    """
    directory, data_dir = project_paths(root, path)
    data = read_project_file(data_dir)

    if "tags" in changes:
        tags = []

        for tag in changes["tags"] or []:
            tag = re.sub(r"\s+", " ", str(tag)).strip().lstrip("#")

            if tag and tag.lower() not in (t.lower() for t in tags):
                tags.append(tag)

        data["tags"] = tags

    if "notes" in changes:
        data["notes"] = str(changes["notes"] or "")

    if changes.get("name"):
        data["name"] = os.path.basename(directory)

    write_json(os.path.join(data_dir, PROJECT_FILE), data)
    return get_project(root, path)


def set_final(root: str, path: str, name: Optional[str] = None, filename: Optional[str] = None,
              content: Optional[bytes] = None, kind: Optional[str] = None,
              member: Optional[str] = None) -> Dict[str, Any]:
    """
    Copy an image into the project as its final image: a file of the project directory (name), an image of a saved
    tray (kind and member of its archive) or uploaded content; none of them clears it
    """
    _, data_dir = project_paths(root, path)
    data = read_project_file(data_dir)

    if name:
        source = project_file_path(root, path, name)
        write_final(data_dir, data, os.path.splitext(source)[1], name, path=source)
    elif kind:
        content = read_tray_member(data_dir, kind, member)
        write_final(data_dir, data, os.path.splitext(member)[1], f"{kind}:{os.path.basename(member)}", content=content)
    elif content is not None:
        write_final(data_dir, data, os.path.splitext(filename or "")[1], filename, content=content)
    else:
        write_final(data_dir, data, None, None)

    write_json(os.path.join(data_dir, PROJECT_FILE), data)
    return get_project(root, path)


def write_final(data_dir: str, data: Dict[str, Any], ext: Optional[str], source_label: Optional[str],
                path: Optional[str] = None, content: Optional[bytes] = None) -> None:
    """
    Write the final image into ib_project as final.<ext> from a file or content, and record it in the project data;
    no extension removes it
    """
    ext = ext.lower() if ext else None

    if ext is not None and ext not in IMAGE_EXTENSIONS:
        raise ProjectError("Not an image file.", 415)

    for old in os.listdir(data_dir):
        old_path = os.path.join(data_dir, old)

        # The source may be the final image itself
        if os.path.splitext(old)[0] == "final" and os.path.isfile(old_path) \
                and (path is None or os.path.normcase(old_path) != os.path.normcase(path)):
            os.unlink(old_path)

    if ext is None:
        data["final"] = None
        data.pop("finalSource", None)
        return

    target = os.path.join(data_dir, "final" + ext)

    if path is not None:
        if os.path.normcase(target) != os.path.normcase(path):
            shutil.copy2(path, target)
    else:
        with open(target, "wb") as file:
            file.write(content)

    data["final"] = f"{PROJECT_DIR}/final{ext}"
    data["finalSource"] = source_label


# ---------- Tray archives ----------

def open_tray_archive(data_dir: str, kind: str) -> Optional[zipfile.ZipFile]:
    if kind not in TRAY_KINDS:
        raise ProjectError(f"Unknown tray: {kind}")

    archive_path = os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")
    return zipfile.ZipFile(archive_path, "r") if os.path.isfile(archive_path) else None


def read_archive_tray(archive: zipfile.ZipFile) -> Dict[str, Any]:
    names = set(archive.namelist())
    tray_file = next((name for name in [ARCHIVE_TRAY_FILE, *TRAY_FILES.values()] if name in names), None)
    return json.loads(archive.read(tray_file)) if tray_file else {}


def get_tray(root: str, path: str, kind: str) -> Dict[str, Any]:
    """
    Images of a saved tray of a project, in the tray order:
    {member, name, marking, comment, prompt, parameters, img2img, generationId}
    (images whose files were missing when the tray was saved are left out)
    """
    _, data_dir = project_paths(root, path)
    archive = open_tray_archive(data_dir, kind)

    if archive is None:
        return {"kind": kind, "images": [], "version": None}

    with archive:
        names = set(archive.namelist())
        images = []

        for image in read_archive_tray(archive).get("images") or []:
            member = image.get("imagePath")

            if member in names:
                images.append({
                    "member": member,
                    "name": os.path.basename(member),
                    "marking": image.get("marking"),
                    "comment": image.get("comment"),
                    "prompt": (image.get("parameters") or {}).get("prompt") or "",
                    "parameters": image.get("parameters") or {},
                    "img2img": image.get("img2img"),
                    "generationId": image.get("generationId")
                })

    version = os.stat(os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")).st_mtime_ns
    return {"kind": kind, "images": images, "version": version}


def read_tray_member(data_dir: str, kind: str, member: Optional[str]) -> bytes:
    archive = open_tray_archive(data_dir, kind)

    if archive is None or not member or not member.startswith("images/"):
        raise ProjectError("Image not found", 404)

    with archive:
        try:
            return archive.read(member)
        except KeyError:
            raise ProjectError("Image not found", 404)


def get_tray_image(root: str, path: str, kind: str, member: str, thumb: bool = False) -> FileResult:
    """An image of a saved tray, or its thumbnail (cached by the archive modification time)"""
    _, data_dir = project_paths(root, path)
    content = read_tray_member(data_dir, kind, member)

    if thumb:
        version = os.stat(os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")).st_mtime_ns
        return cached_thumbnail(data_dir, f"{kind}|{member}|{version}", lambda: io.BytesIO(content))

    ext = os.path.splitext(member)[1].lower()

    if ext in BROWSER_EXTENSIONS:
        return FileResult(MEDIA_TYPES[ext], content=content)

    try:
        with Image.open(io.BytesIO(content)) as image:
            buffer = io.BytesIO()
            to_rgb(image).save(buffer, format="PNG", compress_level=1)
    except Exception as e:
        raise ProjectError(f"Unable to read the image: {e}", 415)

    return FileResult("image/png", content=buffer.getvalue())


def marked_final(store_dir: str) -> Optional[Dict[str, Any]]:
    """The image marked as the final choice (🏁) in the image tray, else in the concept tray, of the workspace"""
    for kind in ("image_tray", "concept_tray"):
        content, _, count = read_tray_store(store_dir, kind)

        if not count:
            continue

        for image in json.loads(content).get("images") or []:
            if image.get("marking") == FINAL_MARKING and os.path.isfile(image.get("imagePath") or ""):
                return {"kind": kind, "path": image["imagePath"]}

    return None


def write_tray_archive(store_content: bytes, archive_path: str) -> int:
    """
    Write the tray content of a store file and its images into an archive in the format of the tray download
    (see tray.download_image_tray). An image whose file is missing keeps its entry as it is.
    Returns the number of the images of the tray
    """
    tray_data = json.loads(store_content)
    images = []
    names = set()
    temp = archive_path + ".tmp"

    with zipfile.ZipFile(temp, "w", zipfile.ZIP_STORED) as archive:
        for image in tray_data.get("images") or []:
            image_path = image.get("imagePath")

            if image.get("separator") or not image_path or not os.path.isfile(image_path):
                images.append(image)
                continue

            name = os.path.basename(image_path)
            stem, ext = os.path.splitext(name)
            counter = 1

            while name.lower() in names:
                name = f"{stem}_{counter:03d}{ext}"
                counter += 1

            names.add(name.lower())
            archive_name = "images/" + name
            archive.write(image_path, archive_name)
            images.append({**image, "imagePath": archive_name})

        archive.writestr(ARCHIVE_TRAY_FILE, json.dumps({**tray_data, "images": images}))

    os.replace(temp, archive_path)
    return len(images)


def extract_tray_archive(archive_path: str, image_bench_dir: str, kind: str, platform: str) -> List[Dict[str, Any]]:
    """
    Extract the images of a tray archive into the tray directory (image-bench/<kind>/), where they are kept by the
    tray. A file of the same name and content is reused, another one gets a new name.
    Returns the images of the tray with their new paths
    """
    tray_dir = os.path.join(image_bench_dir, kind)
    os.makedirs(tray_dir, exist_ok=True)
    images = []

    with zipfile.ZipFile(archive_path, "r") as archive:
        names = set(archive.namelist())
        tray_file = next((name for name in [ARCHIVE_TRAY_FILE, *TRAY_FILES.values()] if name in names), None)

        if not tray_file:
            raise ProjectError(f"{os.path.basename(archive_path)} holds no tray.", 422)

        tray_data = json.loads(archive.read(tray_file))

        for image in tray_data.get("images") or []:
            member = image.get("imagePath")

            # An image whose file was missing when it was saved keeps its entry
            if not member or member not in names:
                if member and not member.startswith("images/"):
                    images.append(image)

                continue

            info = archive.getinfo(member)
            name = os.path.basename(member.replace("\\", "/"))
            target = os.path.join(tray_dir, name)

            if not (os.path.isfile(target) and same_file(target, info)):
                target = unique_file_path(tray_dir, name)

                with archive.open(info) as source, open(target, "wb") as file:
                    shutil.copyfileobj(source, file)

            name = os.path.basename(target)
            image = {key: value for key, value in image.items() if key != "selected"}
            image["imagePath"] = target
            image["imageUrl"] = (f"/view?filename={quote(name)}&type=output&subfolder=image-bench/{kind}"
                                 if platform == "comfyui" else f"/file={target.replace(os.sep, '/')}")
            image["_tray_processed"] = True
            images.append(image)

    return images


def same_file(path: str, info: zipfile.ZipInfo) -> bool:
    if os.path.getsize(path) != info.file_size:
        return False

    crc = 0

    with open(path, "rb") as file:
        while chunk := file.read(1 << 20):
            crc = zipfile.crc32(chunk, crc)

    return crc == info.CRC


def image_key(image: Dict[str, Any]) -> str:
    """Identity of a tray image across workspaces: its original path, else its file name"""
    return os.path.normcase(image.get("sourcePath") or os.path.basename(image.get("imagePath") or ""))


# ---------- Save and open ----------

def save_project(root: str, store_dir: str, image_bench_dir: str, platform: str, path: str,
                 snapshot: Dict[str, Any], files: Dict[str, bytes]) -> Dict[str, Any]:
    """
    Save the workspace into a project and make it current: the trays (only the archives of the changed ones are
    written again) and the parameter snapshot with its ControlNet images and ComfyUI workflow
    """
    directory, data_dir = project_paths(root, path)
    data = read_project_file(data_dir)
    saved_trays = data.get("trays") or {}
    trays = {}
    hashes = {}

    os.makedirs(os.path.join(data_dir, TRAYS_DIR), exist_ok=True)

    for kind in TRAY_KINDS:
        content, tray_hash, count = read_tray_store(store_dir, kind)
        archive_path = os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")
        hashes[kind] = tray_hash

        if not count:
            if os.path.exists(archive_path):
                os.unlink(archive_path)

            trays[kind] = {"count": 0, "hash": ""}
        elif (saved_trays.get(kind) or {}).get("hash") == tray_hash and os.path.isfile(archive_path):
            trays[kind] = saved_trays[kind]
        else:
            trays[kind] = {"count": write_tray_archive(content, archive_path), "hash": tray_hash}

    parameters = dict(snapshot.get("parameters") or {})
    controlnet_dir = os.path.join(data_dir, CONTROLNET_DIR)
    shutil.rmtree(controlnet_dir, ignore_errors=True)

    if files:
        os.makedirs(controlnet_dir)

        for name, content in files.items():
            with open(os.path.join(controlnet_dir, check_name(os.path.basename(name))), "wb") as file:
                file.write(content)

    workflow_path = os.path.join(data_dir, WORKFLOW_FILE)
    workflow = snapshot.get("workflow")

    if workflow:
        write_json(workflow_path, workflow)
        parameters["workflow"] = WORKFLOW_FILE
    elif os.path.exists(workflow_path):
        os.unlink(workflow_path)

    data.update({
        "version": 1,
        "host": host_name(platform),
        "savedAt": time.time(),
        "parameters": parameters,
        "trays": trays
    })
    data.setdefault("name", os.path.basename(directory))
    data.setdefault("tags", [])
    data.setdefault("notes", "")

    if not data.get("final"):
        marked = marked_final(store_dir)

        if marked:
            write_final(data_dir, data, os.path.splitext(marked["path"])[1],
                        f"{marked['kind']}:{os.path.basename(marked['path'])}", path=marked["path"])

    write_json(os.path.join(data_dir, PROJECT_FILE), data)

    write_current(store_dir, {"path": relative(root, directory), "trays": hashes})
    return {"project": get_project(root, path), "current": get_current(root, store_dir)}


def open_project(root: str, store_dir: str, image_bench_dir: str, platform: str, path: str,
                 restore_trays: bool = True, merge: bool = False) -> Dict[str, Any]:
    """
    Restore the trays of a project into the workspace and make it current; merged, the images of the project are
    added to the trays. The parameters are restored by the popup
    """
    _, data_dir = project_paths(root, path)
    counts = {}

    if restore_trays:
        for kind in TRAY_KINDS:
            archive_path = os.path.join(data_dir, TRAYS_DIR, f"{kind}.zip")
            images = extract_tray_archive(archive_path, image_bench_dir, kind, platform) \
                if os.path.isfile(archive_path) else []

            if merge:
                content, _, _ = read_tray_store(store_dir, kind)
                existing = (json.loads(content).get("images") or []) if content.strip() else []
                keys = {image_key(image) for image in existing}
                images = existing + [image for image in images if image_key(image) not in keys]

            counts[kind] = len(images)
            store_path = os.path.join(store_dir, TRAY_FILES[kind])
            os.makedirs(store_dir, exist_ok=True)

            with open(store_path, "w", encoding="utf-8") as file:
                json.dump({"version": 1, "images": images}, file)

    # Merged trays or parameters only leave the workspace with the project it belongs to
    if restore_trays and not merge:
        write_current(store_dir, {"path": path,
                                  "trays": {kind: read_tray_store(store_dir, kind)[1] for kind in TRAY_KINDS}})

    return {"project": get_project(root, path), "current": get_current(root, store_dir), "trays": counts}


# ---------- Dispatch ----------

def dispatch(action: str, args: Dict[str, Any], files: Dict[str, Any], config: Dict[str, Any],
             store_dir: str, image_bench_dir: str, platform: str):
    """
    Run an action of the /image-bench/projects/<action> endpoint.
    args: query or JSON body; files: uploaded files by field name as (file name, content).
    Returns a JSON-serializable dict or a FileResult; raises ProjectError
    """
    root = get_root(config)
    path = args.get("path") or ""

    # The docs of the Library tab, under their own root
    if action.startswith("doc"):
        from . import docs
        docs_root = docs.get_root(config, store_dir)

        if action == "docs_tree":
            return docs.get_tree(docs_root, store_dir)
        if action == "docs_check":
            check = str(args.get("root") or "").strip()
            return docs.check_root(os.path.normpath(check) if check else docs.default_root(store_dir), store_dir)
        if action == "doc":
            return docs.get_doc(docs_root, path)
        if action == "doc_asset":
            return docs.get_asset(docs_root, path)

    if action == "tree":
        return get_tree(root, store_dir)
    if action == "check":
        return check_root(os.path.normpath(str(args.get("root") or "").strip()) if args.get("root") else "")
    if action == "project":
        return get_project(root, path)
    if action == "file":
        return get_file(root, path, args.get("name") or "", str(args.get("thumb")).lower() in ("1", "true"))
    if action == "tray":
        return get_tray(root, path, args.get("kind") or "")
    if action == "tray_image":
        return get_tray_image(root, path, args.get("kind") or "", args.get("member") or "",
                              str(args.get("thumb")).lower() in ("1", "true"))
    if action == "current":
        return get_current(root, store_dir)
    if action == "set_current":
        return set_current(root, store_dir, args.get("path"))
    if action == "create_folder":
        return create_folder(root, path, args.get("name"))
    if action == "create_project":
        return create_project(root, path, args.get("name"), platform)
    if action == "rename":
        return rename(root, store_dir, path, args.get("name"))
    if action == "move":
        return move(root, store_dir, path, args.get("to") or "")
    if action == "delete":
        return delete(root, store_dir, path)
    if action == "reveal":
        return reveal(root, path)
    if action == "update":
        return update_project(root, path, args.get("changes") or {})
    if action == "delete_file":
        return delete_file(root, path, args.get("name") or "")
    if action == "add_file":
        upload = files.get("file")
        return add_file(root, path, upload[0] if upload else None, upload[1] if upload else None)
    if action == "set_final":
        upload = files.get("file")
        return set_final(root, path, name=args.get("name"), kind=args.get("kind"), member=args.get("member"),
                         filename=upload[0] if upload else None, content=upload[1] if upload else None)
    if action == "save":
        snapshot = args.get("snapshot") or {}
        return save_project(root, store_dir, image_bench_dir, platform, path, snapshot,
                            {name: content for name, (_, content) in files.items()})
    if action == "open":
        return open_project(root, store_dir, image_bench_dir, platform, path,
                            restore_trays=args.get("trays", True) is not False, merge=bool(args.get("merge")))

    raise ProjectError(f"Unknown action: {action}", 404)


def parse_args(query: Dict[str, Any], form: Dict[str, Any], body: Optional[bytes],
               files: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Arguments of a request: the query, a JSON body, or the "data" part (JSON) of a multipart form, which is taken
    out of the files if it was sent as a file (a ComfyUI workflow exceeds the size limit of form fields)
    """
    args = dict(query)
    data = files.pop("data", None) if files is not None else None

    if data:
        args.update(json.loads(data[1]))
    elif form and form.get("data"):
        args.update(json.loads(form["data"]))
    elif body and body.strip():
        try:
            parsed = json.loads(body)
        except ValueError:
            raise ProjectError("Invalid request")

        if isinstance(parsed, dict):
            args.update(parsed)

    return args
