# Image Bench for SD WebUI

Image Bench automates the repetitive micro-tasks of working with SD WebUI (Forge / Forge Neo): generating batches,
comparing models and LoRAs, collecting the best images, upscaling them, moving images to and from Photoshop. It
works from one window that drives the WebUI page, mirrors its controls both ways and receives every generated
image with its parameters.

- Generate and ControlNet tabs: compact editors for the txt2img, img2img and Inpaint controls, references and
  the units of ControlNet Integrated
- Model and LoRA exploration, batches, variations, parameter sweeps, upscaling of chosen images
- Compare tab, image and concept trays, projects
- Photoshop plugins (supplied with the extension, installed from the manual)

The full manual is built in: **Library › Manual** in the Image Bench window.

## Installation

Build the extension from the repository root (needs Node.js, npm and [just](https://github.com/casey/just)):

```bash
cd image-bench && npm install && cd ..
just webui
```

Then put `webui-extension` into WebUI's `extensions` folder as `image-bench`: symlink it, or copy it with the
symlinks followed (`shared` and `javascript/shared` link into `common-extension`). `just deploy-webui` copies it to
the directory set as `WEBUI_DEST` in `.env` (see `.env.example`). Restart WebUI.

Optional extensions: [sd-webui-openpose-editor](https://github.com/fabiencomte/sd-webui-openpose-editor) for editing
poses from the ControlNet tab, and Config Presets, whose dropdown Image Bench can move to the results area.

## Opening Image Bench

- The **🔬 Image Bench** button in the header of the WebUI page opens it in a popup window connected to that page.
  Keep the WebUI page open as the active tab of its window (the window may be minimized).
- `http://<webui address>/image-bench/app` opens it without a WebUI tab: the window loads WebUI itself in a tab
  of its own.
