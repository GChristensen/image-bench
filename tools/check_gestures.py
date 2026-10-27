"""
Check of the mouse grammar registry (just check-gestures): every file of the Vue app with a middle click handler
(@auxclick, button === 1) or a Shift branch (shiftKey) must be named by a `source` of image-bench/src/gestures.js or
image-bench/src/shortcuts.js, so that the cheat sheet and the manual (ShortcutTables.vue) list what it does:
python tools/check_gestures.py

A line marked `gesture-ignore` (e.g. Shift keeping the aspect of a drag) is not counted.
"""
import os
import re
import sys

SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "image-bench", "src")
REGISTRIES = ["gestures.js", "shortcuts.js"]
# Not handlers: the registries and the modifier state composables
IGNORED = set(REGISTRIES) | {"composables/useShiftKey.js", "composables/useCtrlKey.js"}

PATTERN = re.compile(r"@auxclick|button === 1|shiftKey")
SOURCE = re.compile(r"source:\s*(\[[^\]]*\]|\"[^\"]*\")")


def registered_sources():
    sources = set()

    for name in REGISTRIES:
        with open(os.path.join(SRC_DIR, name), encoding="utf-8") as file:
            for match in SOURCE.finditer(file.read()):
                sources.update(re.findall(r"\"([^\"]+)\"", match.group(1)))

    return sources


def handler_files():
    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [name for name in dirs if name not in ("node_modules", "assets")]

        for name in files:
            if not name.endswith((".vue", ".js")):
                continue

            path = os.path.join(root, name)
            relative = os.path.relpath(path, SRC_DIR).replace(os.sep, "/")

            if relative in IGNORED:
                continue

            with open(path, encoding="utf-8") as file:
                lines = [line for line in file if PATTERN.search(line) and "gesture-ignore" not in line]

            if lines:
                yield relative, len(lines)


def main():
    sources = registered_sources()
    missing = [(path, count) for path, count in sorted(handler_files()) if path not in sources]
    unknown = sorted(path for path in sources if not os.path.isfile(os.path.join(SRC_DIR, path)))

    for path, count in missing:
        print(f"not in gestures.js / shortcuts.js: {path} ({count} lines)")

    for path in unknown:
        print(f"source names a missing file: {path}")

    if missing or unknown:
        sys.exit(1)

    print("gestures: all handler files are registered")


if __name__ == "__main__":
    main()
