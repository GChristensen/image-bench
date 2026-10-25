# Image Bench for ComfyUI

Image Bench is a generation workspace for ComfyUI, laid out so that the frequent steps
of image generation take as few actions as possible. It runs in its own window and drives
ComfyUI, which does the generation. Every image ComfyUI generates arrives in Image Bench
with its parameters, and you keep the best ones in trays, where the common follow-up
tasks are automated. For example, upscaling an image takes just one button click, with no need to look up its seed
or other parameters, and an image goes to a graphics editor and back in one click,
without copying and pasting. You do not need the file manager or an image browser
at any point. See more at the [extension site](https://gchristensen.github.io/image-bench).

The full manual is built in: **Library › Manual** in the Image Bench window.

Note: This add-on is not designed to make ComfyUI less complicated. 
It automates repetitive tasks, not the creative process.

## Prompting skill

Image Bench also has a Claude skill, [diffusion-prompting](https://github.com/GChristensen/image-bench/tree/master/skills/diffusion-prompting).
It writes, fixes and converts prompts and suggests sampler settings for the models described in the Library tab
(SDXL, FLUX, Qwen-Image, Z-Image, WAN 2.2 and others), using the Image Bench model docs as its references.
Download [diffusion-prompting.zip](https://github.com/GChristensen/image-bench/releases/download/skills/diffusion-prompting.zip) and upload it to claude.ai (Settings › Capabilities › Skills)
or unpack it into `~/.claude/skills/`. It may work with other agents that support skills.

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

| Package | Nodes | Needed for |
|---------|-------|------------|
| [ComfyUI-Inpaint-CropAndStitch](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch) | Inpaint Crop / Inpaint Stitch (Improved) | The bundled `*_inpaint` workflows, and the mask blur, mask mode, inpaint area, padding and size options of the Generate tab's Inpaint group. Your own inpaint workflows work without it, but the group then hides these options |
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | AIO Aux Preprocessor | ControlNet preprocessors (without it the preprocessor controls are hidden), and the ControlNet units of `image_anima_full` |
| [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) | Advanced ControlNet loader and apply nodes | ControlNet masks (without it *Use Mask* is hidden), and the ControlNet units of `image_anima_full` |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) or [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | Unet Loader (GGUF), GGUF Loader KJ | `.gguf` models as the `ib:cp` loader; not used by the bundled workflows |

The Hires. fix checkbox of the bundled `*_full` workflows is a **Switch** node titled `ib:hr`. It is a ComfyUI core
node, so it needs no node pack, but older ComfyUI versions do not have it: if it shows as missing, update ComfyUI.
With a workflow open, **Manager › Install Missing Custom Nodes** installs the packs it needs.

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
