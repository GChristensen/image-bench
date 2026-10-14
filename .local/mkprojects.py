"""
Turn the leaf folders of a folder of past generations into Image Bench projects.

    python .local/mkprojects.py <root> [--dry-run] [--overwrite]

The folders are expected as <root>/<YYYY>/[group]/<project>: in the year folders of the root, every folder without
subfolders is taken; other folders of the root are left alone (folders already holding an ib_project are skipped
unless --overwrite). For each one an ib_project/project.json
is written, as shared_backend/projects.py writes it:

- prompt and parameters: from the infotext (A1111 / Forge / Forge Neo) of the latest modified .png with at least
  3 digits in its name; a .png without any metadata is passed over for the next one, and a ComfyUI image
  (workflow metadata only) leaves the project without parameters
- final image: the first of final.png, final.jpg, final1.png, final1.jpg, copied to ib_project/final.<ext>
- name: the folder name (projects are named after their folders)

Only Pillow is needed. Without --dry-run, nothing outside the ib_project folders is changed.
"""

import argparse
import json
import os
import re
import shutil
import sys
import time

from PIL import Image

PROJECT_DIR = "ib_project"
PROJECT_FILE = "project.json"
FINAL_NAMES = ["final.png", "final.jpg", "final1.png", "final1.jpg"]
MIN_DIGITS = 3

# A "key: value" pair of the parameter line, as WebUI matches it (modules/infotext_utils.py)
RE_PARAM = re.compile(r'\s*(\w[\w \-/]+):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)')
RE_SIZE = re.compile(r"^(\d+)x(\d+)$")
RE_YEAR = re.compile(r"^\d{4}$")


def unquote(value):
    value = value.strip()

    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        try:
            return json.loads(value)
        except ValueError:
            return value[1:-1]

    return value


def parse_infotext(text):
    """
    (prompt, negative prompt, {key: value}) of an A1111 infotext; the last line is the parameter line
    if it has at least 3 "key: value" pairs, as WebUI decides
    """
    lines = text.strip().split("\n")
    params = {}

    if len(RE_PARAM.findall(lines[-1])) >= 3:
        params = {key.strip(): unquote(value) for key, value in RE_PARAM.findall(lines.pop())}

    prompt, negative, in_negative = [], [], False

    for line in lines:
        if line.startswith("Negative prompt:"):
            in_negative = True
            line = line[len("Negative prompt:"):].lstrip()

        (negative if in_negative else prompt).append(line)

    return "\n".join(prompt).strip(), "\n".join(negative).strip(), params


def number(value):
    try:
        result = float(value)
        return int(result) if result.is_integer() else result
    except (TypeError, ValueError):
        return None


def to_generate_params(prompt, negative, info):
    """(mode, parameters of the Generate tab) of an infotext, as the projects keep them (Generate tab names)"""
    params = {"prompt": prompt, "negativePrompt": negative}

    def put(name, value):
        if value is not None and value != "":
            params[name] = value

    put("steps", number(info.get("Steps")))
    put("sampler", info.get("Sampler"))
    put("scheduler", info.get("Schedule type"))
    put("cfg", number(info.get("CFG scale")))
    put("seed", number(info.get("Seed")))
    put("checkpoint", info.get("Model"))
    # Forge writes the distilled CFG slider as Shift for flow models
    put("shift", number(info.get("Distilled CFG Scale", info.get("Shift"))))

    size = RE_SIZE.match(info.get("Size", ""))

    if size:
        params["width"], params["height"] = int(size[1]), int(size[2])

    if "Variation seed" in info:
        put("subseed", number(info.get("Variation seed")))
        put("subseedStrength", number(info.get("Variation seed strength")))

    module_keys = [key for key in info if re.fullmatch(r"Module \d+", key)]
    modules = [info[key] for key in sorted(module_keys, key=lambda key: int(key.split()[1]))]

    if modules:
        params["modules"] = modules

    hires = "Hires upscale" in info

    if hires:
        params["hiresFix"] = True
        put("hiresScale", number(info.get("Hires upscale")))
        put("hiresSteps", number(info.get("Hires steps", 0)))
        put("hiresUpscaler", info.get("Hires upscaler"))

    put("denoising", number(info.get("Denoising strength")))

    # Denoising without Hires. fix: an img2img image
    mode = "img2img" if "Denoising strength" in info and not hires else "txt2img"
    return mode, params


def read_metadata(path):
    """("a1111", infotext) | ("comfy", None) | (None, None) of a PNG file"""
    try:
        with Image.open(path) as image:
            text = image.info or {}
    except Exception as e:
        print(f"  ! unreadable {os.path.basename(path)}: {e}")
        return None, None

    if text.get("parameters"):
        return "a1111", text["parameters"]

    if "workflow" in text or "prompt" in text:
        return "comfy", None

    return None, None


def source_candidates(folder):
    """PNG files with at least 3 digits in their names, latest modified first"""
    files = []

    for entry in os.scandir(folder):
        stem, ext = os.path.splitext(entry.name)

        if entry.is_file() and ext.lower() == ".png" and sum(c.isdigit() for c in stem) >= MIN_DIGITS:
            files.append((entry.stat().st_mtime, entry.path))

    return [path for _, path in sorted(files, reverse=True)]


def find_parameters(folder):
    """(parameters of project.json or None, source file name or None, note)"""
    for path in source_candidates(folder):
        kind, infotext = read_metadata(path)
        name = os.path.basename(path)

        if kind == "comfy":
            return None, name, "ComfyUI image, no parameters"

        if kind == "a1111":
            prompt, negative, info = parse_infotext(infotext)
            mode, params = to_generate_params(prompt, negative, info)
            parameters = {"host": "webui", "mode": mode, "params": params,
                          "controlnet": {"tab": "txt2img" if mode == "txt2img" else "img2img", "units": []}}
            return parameters, name, f"parameters from {name}"

    return None, None, "no image with parameters"


def find_final(folder):
    names = {entry.name.lower(): entry.name for entry in os.scandir(folder) if entry.is_file()}

    for candidate in FINAL_NAMES:
        if candidate in names:
            return names[candidate]

    return None


def leaf_folders(root):
    """Folders without subfolders (an ib_project folder does not count) in the year folders (YYYY) of the root"""
    for directory, subdirs, _ in os.walk(root):
        subdirs[:] = sorted(d for d in subdirs if d != PROJECT_DIR and not d.startswith("."))

        # Only the year folders of the root; deeper folders may have any name
        if os.path.normcase(directory) == os.path.normcase(root):
            subdirs[:] = [d for d in subdirs if RE_YEAR.match(d)]

        if not subdirs and os.path.normcase(directory) != os.path.normcase(root):
            yield directory


def make_project(folder, dry_run, overwrite):
    data_dir = os.path.join(folder, PROJECT_DIR)
    exists = os.path.isfile(os.path.join(data_dir, PROJECT_FILE))

    if exists and not overwrite:
        return "skipped (already a project)"

    parameters, source, note = find_parameters(folder)
    final = find_final(folder)
    now = time.time()

    data = {
        "version": 1,
        "name": os.path.basename(folder),
        "host": "webui",
        "created": now,
        "tags": [],
        "notes": "",
        "final": None,
        "trays": {}
    }

    if parameters:
        data["parameters"] = parameters
        data["savedAt"] = os.path.getmtime(os.path.join(folder, source))

    if exists:
        # Tags, notes and trays added in Image Bench are kept
        with open(os.path.join(data_dir, PROJECT_FILE), encoding="utf-8") as file:
            old = json.load(file)

        for key in ("created", "tags", "notes", "trays"):
            if key in old:
                data[key] = old[key]

    if final:
        ext = os.path.splitext(final)[1].lower()
        data["final"] = f"{PROJECT_DIR}/final{ext}"
        data["finalSource"] = final
        note += f", final {final}"
    else:
        note += ", no final image"

    if not dry_run:
        os.makedirs(data_dir, exist_ok=True)

        if final:
            for old_final in os.listdir(data_dir):
                if os.path.splitext(old_final)[0] == "final":
                    os.unlink(os.path.join(data_dir, old_final))

            shutil.copy2(os.path.join(folder, final), os.path.join(data_dir, "final" + os.path.splitext(final)[1].lower()))

        temp = os.path.join(data_dir, PROJECT_FILE + ".tmp")

        with open(temp, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=1)

        os.replace(temp, os.path.join(data_dir, PROJECT_FILE))

    return note


def main():
    parser = argparse.ArgumentParser(description="Turn the leaf folders of a folder of generations into Image Bench projects")
    parser.add_argument("root", help="Root folder (also a UNC path)")
    parser.add_argument("--dry-run", action="store_true", help="Only show what would be done")
    parser.add_argument("--overwrite", action="store_true",
                        help="Also redo folders that are projects already (their tags, notes and trays are kept)")
    args = parser.parse_args()

    root = os.path.normpath(args.root)

    if not os.path.isdir(root):
        sys.exit(f"Not a folder: {root}")

    count = 0

    for folder in leaf_folders(root):
        try:
            note = make_project(folder, args.dry_run, args.overwrite)
        except OSError as e:
            note = f"FAILED: {e}"

        print(f"{os.path.relpath(folder, root)}: {note}")
        count += 1

    print(f"\n{count} folders{' (dry run, nothing written)' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
