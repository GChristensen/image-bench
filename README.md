# Image Bench

Image Bench automates the repetitive micro-tasks of working with ComfyUI. See more at the [extension site](https://gchristensen.github.io/image-bench).

This is the development repository. Please do not try to install the extension from it.

## Installation repositories

### Forge Neo

https://github.com/GChristensen/sd-webui-image-bench

### ComfyUI

https://github.com/GChristensen/comfyui-image-bench

## Building

Builds require [just](https://github.com/casey/just) and Node.js (run `npm install` in `image-bench/` once).
From the repository root, `just webui` or `just comfy` builds the Vue app into the corresponding extension folder.
The hosts serve the built page, so rebuild after every change. See the `justfile` for the release,
deploy and editor plugin recipes.

## Repository layout

| Directory            | Contents                                                                                              |
|----------------------|-------------------------------------------------------------------------------------------------------|
| `image-bench/`       | The Vue 3 app (popup / embedded window), built into a single `index.html`                             |
| `webui-extension/`   | The Forge / SD WebUI extension: `javascript/` runs in the WebUI page, `scripts/` is the FastAPI backend |
| `comfyui-extension/` | The ComfyUI custom node: `__init__.py` (backend routes), `js/` (ComfyUI frontend extension), `workflows/` |
| `common-extension/`  | Code shared by both extensions: `shared_frontend/` (JS) and `shared_backend/` (Python)               |
| `editor-extensions/` | Photoshop, Krita and GIMP plugins; `PROTOCOL.md` describes their protocol                             |
| `model-docs/`        | The model docs shown in the Library tab, copied into the extensions by the build                      |
| `landing/`           | Sources of the GitHub Pages site, built into the repo-root `index.html`                               |
| `tools/`             | `assemble.py`, which makes the release trees of the installation repositories                        |

The extensions link the shared code through relative symlinks (`webui-extension/javascript/shared`,
`*/image_bench_shared`), so clone with symlinks enabled (`git config core.symlinks true`; on Windows this needs
Developer Mode or an elevated shell). Edit only the originals in `common-extension/`.

## Development

During development, the host can load the extension straight from this repository: create a directory symlink
in the host's extension folder that points to the extension folder of the checkout, e.g. on Windows:

```bat
mklink /D D:\ai\sd\webui\extensions\image-bench D:\dev\sd\image-bench\webui-extension
mklink /D D:\ai\sd\comfyui\custom_nodes\image-bench D:\dev\sd\image-bench\comfyui-extension
```

(`ln -s` elsewhere). Then `just webui` / `just comfy` is all that is needed to update the install. ComfyUI loads
extensions only at startup, so restart it after creating the link; reload the page after each build.

## Q&A

**Q: Do you accept issues, feature or pull requests for this project?**<br>
A: Not now. This software is distributed in the hope that it will be useful, but is provided 'as is' without warranty of any kind. You know.

**Q: There is an annoying bug!**<br>
A: Unfortunately, the author currently does not have the resources to fix. Please fix any issues using your favorite coding agent or wait while it will be fixed.

**Q: The host backend prints something about tensor shape in the console, nothing is working!**<br>
A: Something may have gotten messed up in the host UI (e.g., an incorrect VAE, text encoder, or image dimensions). 
Please try to get the host UI working first, or try resetting it.

**Q: It doesn't work at all!**<br>
A: It may be incompatible with your setup. Sometimes this happens. Please use logs and your best judgement to understand why exactly. 