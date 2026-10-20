# Image Bench for ComfyUI

Image Bench automates the repetitive micro-tasks of working with ComfyUI. 
Basically, it is an image generation UI that works on top of ComfyUI by driving it. 
It is built so that you never have to touch the file manager or image browser during 
the whole process. Generated images are captured from ComfyUI, and you save 
the best ones into trays that allow you to perform common operations on them. 
For example, to upscale an image, you just click one button, without needing 
to manually extract image generation parameters, such as the generation seed.
You can also send images to and from graphics editor with a single click,
skipping copy-and-paste operations entirely. See more at the [extension site](https://gchristensen.github.io/image-bench).

The full manual is built in: **Library › Manual** in the Image Bench window.

Note: This add-on is not designed to make ComfyUI less complicated. 
It automates repetitive tasks, not the creative process.

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
Manager (**Update**), or `git pull` in the extension folder. Updates keep your settings (`config.json`), the trays and
presets in `store/` and your node additions in `store/node_config.json`, which are not part of the repository.

Optional node packs:

| Package | Needed for |
|---------|------------|
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet preprocessors; without it the preprocessor controls are hidden |
| [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) | ControlNet masks; without it *Use Mask* is hidden |

## Opening Image Bench

Image Bench could run in a standalone mode which loads ComfyUI in background, or be
launched from ComfyUI and work along it.

- `http://<comfyui address>/image-bench/app` opens it without a ComfyUI tab: the window loads ComfyUI itself in
  a tab of its own.
- The **🔬 Image Bench** button in the ComfyUI toolbar could open it as a new tab or a popup window depending on settings. 
By default, it offers to use the url above.

## Preparing a workflow

Image Bench drives the nodes whose titles carry a marker (right-click the node › *Title*): `ib:cp` checkpoint
loader, `ib:pp` / `ib:np` prompts, `ib:smp` sampler, and optionally `ib:smp:1` / `ib:hr` (Hires. fix), `ib:img` /
`ib:mask` (img2img, inpaint), `ib:ref:N` (references), `ib:cn:N` (ControlNet units), `ib:lora` (LoRA exploration).
For the LoRA list of the Generate tab, use the **Image Bench Prompt** node as `ib:pp`. The workflow needs a Save
Image or Preview Image node.

Example workflows with every node marked are copied into the *Image Bench* folder of the saved workflows. The
manual's *ComfyUI setup* chapter describes the markers in full; [NODE_CONFIG.md](NODE_CONFIG.md) describes how
to add custom nodes in `store/node_config.json`.

## Development repository link

This is not a development repository! The full source code is here: https://github.com/GChristensen/image-bench
