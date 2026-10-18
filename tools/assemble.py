"""
Assembling the release tree of one host add-on (the content of its build repository) from the repository:
python tools/assemble.py webui|comfy <out_dir>

The file sets are those of the deploy recipes of the justfile. Shared code is copied from the common-extension/
originals rather than through the symlinks of the extension folders. Everything in out_dir but .git is replaced;
run `just webui` / `just comfy` first, since the built index.html is a part of the tree.
"""
import fnmatch
import os
import shutil
import sys

REPOSITORY_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# Folders never copied: user data (store/), caches and the linked or copied folders mapped explicitly below
SKIPPED_DIRS = {"store", "__pycache__", "model_docs", "dist", "image_bench_shared", "shared"}

# Files the hosts update on their own or that are written at runtime
SKIPPED_FILES = {"config.json", ".gitkeep"}

# Files of all add-ons (repository root -> tree root)
COMMON_FILES = ["LICENSE", "THIRD_PARTY_LICENSES"]

# Editor plugins, supplied for installing them from the manual: folder and file patterns (_deploy_editors)
EDITOR_PLUGINS = {
    "photoshop": ["index.js", "index.html", "manifest.json"],
    "photoshop-canny": ["*.js", "index.html", "manifest.json"],
    "krita": ["*.py", "*.desktop", "manifest.json"],
    "gimp": ["*.py", "manifest.json"],
}

HOSTS = {
    "webui": {
        "dir": "webui-extension",
        "patterns": ["*.js", "*.py", "*.css", "*.html", "default_snippets.json", "metadata.in", "README.md"],
        "shared_frontend": "javascript/shared",
        "index": "scripts/index.html",
    },
    "comfy": {
        "dir": "comfyui-extension",
        "patterns": ["*.js", "*.py", "*.html", "node_config.json", "NODE_CONFIG.md", "default_snippets.json",
                     "workflows/*.json", "pyproject.toml", "README.md"],
        "shared_frontend": "js/shared",
        "index": "js/index.html",
    },
}

GITIGNORE = """\
store/
config.json
__pycache__/
*.pyc
.tracking
"""


def matches(relative_path, patterns):
    name = os.path.basename(relative_path)
    return any(fnmatch.fnmatch(relative_path if "/" in pattern else name, pattern) for pattern in patterns)


def copy_tree(source_dir, target_dir, patterns=("*",)):
    """Copy the files of source_dir matching patterns (by name, or by relative path for a pattern with /)"""
    count = 0

    for directory, dirs, files in os.walk(source_dir):
        dirs[:] = sorted(d for d in dirs if d not in SKIPPED_DIRS and not d.startswith(".")
                         and not os.path.islink(os.path.join(directory, d)))

        for name in sorted(files):
            source = os.path.join(directory, name)
            relative = os.path.relpath(source, source_dir).replace(os.sep, "/")

            if name in SKIPPED_FILES or not matches(relative, patterns):
                continue

            target = os.path.join(target_dir, relative)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(source, target)
            count += 1

    return count


def clear(out_dir):
    for name in os.listdir(out_dir):
        if name == ".git":
            continue

        path = os.path.join(out_dir, name)
        shutil.rmtree(path) if os.path.isdir(path) and not os.path.islink(path) else os.remove(path)


def assemble(host, out_dir):
    config = HOSTS[host]
    extension_dir = os.path.join(REPOSITORY_DIR, config["dir"])
    common_dir = os.path.join(REPOSITORY_DIR, "common-extension")

    if not os.path.isfile(os.path.join(extension_dir, config["index"])):
        sys.exit(f"{config['dir']}/{config['index']} is missing: build first (just {host})")

    os.makedirs(out_dir, exist_ok=True)
    clear(out_dir)

    copy_tree(extension_dir, out_dir, config["patterns"])
    copy_tree(os.path.join(common_dir, "shared_backend"), os.path.join(out_dir, "image_bench_shared"),
              ["*.py", "*.html", "*.json"])
    copy_tree(os.path.join(common_dir, "shared_frontend"), os.path.join(out_dir, config["shared_frontend"]),
              ["*.js"])
    copy_tree(os.path.join(REPOSITORY_DIR, "model-docs", "docs"), os.path.join(out_dir, "model_docs"))

    for folder, patterns in EDITOR_PLUGINS.items():
        copy_tree(os.path.join(REPOSITORY_DIR, "editor-extensions", folder),
                  os.path.join(out_dir, "image_bench_shared", "editor-extensions", folder), patterns)

    for name in COMMON_FILES:
        if not os.path.exists(os.path.join(out_dir, name)):
            shutil.copy2(os.path.join(REPOSITORY_DIR, name), os.path.join(out_dir, name))

    with open(os.path.join(out_dir, ".gitignore"), "w", encoding="utf-8", newline="\n") as file:
        file.write(GITIGNORE)

    print(f"Assembled {host} into {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in HOSTS:
        sys.exit("Usage: python tools/assemble.py webui|comfy <out_dir>")

    assemble(sys.argv[1], os.path.abspath(sys.argv[2]))
