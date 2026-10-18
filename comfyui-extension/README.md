# Image Bench for ComfyUI

Image Bench automates the repetitive micro-tasks of working with ComfyUI: generating batches, comparing models
and LoRAs, collecting the best images, upscaling them, moving images to and from Photoshop. It works from one
window that drives the workflow open in ComfyUI, mirrors its marked nodes both ways and receives every generated
image with its parameters.

- Generate and ControlNet tabs: compact editors for the prompt, LoRAs, model, sampling, size, Hires. fix, input
  images, references and ControlNet units of the workflow
- Model and LoRA exploration, batches, parameter sweeps, upscaling of chosen images
- Compare tab, image and concept trays, projects
- Photoshop, Krita and GIMP plugins (supplied with the extension, downloaded from the manual)

The full manual is built in: **Library › Manual** in the Image Bench window.

## Installation

With ComfyUI-Manager:

1. Open **Manager › Install via Git URL**.
2. Enter `https://github.com/GChristensen/comfyui-image-bench`.
3. Restart ComfyUI.

Manager accepts a Git URL only with `allow_git_url_install = true` in the `[default]` section of its `config.ini`
and ComfyUI listening on a loopback address (`--listen 127.0.0.1`, the default).

Or clone it by hand into ComfyUI's `custom_nodes` folder:

```bash
cd <ComfyUI>/custom_nodes
git clone https://github.com/GChristensen/comfyui-image-bench
```

Then restart ComfyUI: it loads extensions and the **Image Bench Prompt** node only at startup. Updates come from
Manager (**Update**), or `git pull` in the extension folder. They keep your settings (`config.json`), the trays and
presets in `store/` and your node additions in `store/node_config.json`, which are not part of the repository.

Optional node packs:

| Package | Needed for |
|---------|------------|
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet preprocessors; without it the preprocessor controls are hidden |
| [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) | ControlNet masks; without it *Use Mask* is hidden |

## Opening Image Bench

- The **🔬 Image Bench** button in the ComfyUI toolbar opens it in a popup window connected to that page. Keep the
  ComfyUI page open as the active tab of its window (the window may be minimized).
- `http://<comfyui address>/image-bench/app` opens it without a ComfyUI tab: the window loads ComfyUI itself in
  a tab of its own.
- With the setting *Open Image Bench in a browser tab instead of a popup window* both open it in a tab.

## Preparing a workflow

Image Bench drives the nodes whose titles carry a marker (right-click the node › *Title*): `ib:cp` checkpoint
loader, `ib:pp` / `ib:np` prompts, `ib:smp` sampler, and optionally `ib:smp:1` / `ib:hr` (Hires. fix), `ib:img` /
`ib:mask` (img2img, inpaint), `ib:ref:N` (references), `ib:cn:N` (ControlNet units), `ib:lora` (LoRA exploration).
For the LoRA list of the Generate tab, use the **Image Bench Prompt** node as `ib:pp`. The workflow needs a Save
Image or Preview Image node.

Example workflows with every node marked are copied into the *Image Bench* folder of the saved workflows. The
manual's *ComfyUI setup* chapter describes the markers in full; [NODE_CONFIG.md](NODE_CONFIG.md) describes how
to add custom nodes in `store/node_config.json`.
