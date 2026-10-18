# Image Bench for SD WebUI

Image Bench automates the repetitive micro-tasks of working with SD WebUI (Forge / Forge Neo): generating batches,
comparing models and LoRAs, collecting the best images, upscaling them, moving images to and from Photoshop. It
works from one window that drives the WebUI page, mirrors its controls both ways and receives every generated
image with its parameters.

- Generate and ControlNet tabs: compact editors for the txt2img, img2img and Inpaint controls, references and
  the units of ControlNet Integrated
- Model and LoRA exploration, batches, variations, parameter sweeps, upscaling of chosen images
- Compare tab, image and concept trays, projects
- Photoshop, Krita and GIMP plugins (supplied with the extension, downloaded from the manual)

The full manual is built in: **Library › Manual** in the Image Bench window.

## Installation

From the WebUI page:

1. Open **Extensions › Install from URL**.
2. Enter `https://github.com/GChristensen/sd-webui-image-bench` as the URL and press **Install**.
3. Restart WebUI.

Or clone it by hand into WebUI's `extensions` folder:

```bash
cd <webui>/extensions
git clone https://github.com/GChristensen/sd-webui-image-bench
```

Then restart WebUI. Updates come from **Extensions › Installed › Check for updates**, or `git pull` in the
extension folder. They keep your settings (`config.json`) and the trays and presets in `store/`, which are not
part of the repository.

Optional extensions: [sd-webui-openpose-editor](https://github.com/fabiencomte/sd-webui-openpose-editor) for editing
poses from the ControlNet tab, and Config Presets, whose dropdown Image Bench can move to the results area.

## Opening Image Bench

- The **🔬 Image Bench** button in the header of the WebUI page opens it in a popup window connected to that page.
  Keep the WebUI page open as the active tab of its window (the window may be minimized).
- `http://<webui address>/image-bench/app` opens it without a WebUI tab: the window loads WebUI itself in a tab
  of its own.
