# Image Bench for SD WebUI

Image Bench automates the repetitive micro-tasks of working with SD WebUI (Forge / Forge Neo): generating batches,
comparing models and LoRAs, collecting the best images, upscaling them, moving images to and from Photoshop. It
works from one window that drives the WebUI page, mirrors its controls both ways and receives every generated
image with its parameters. It also offers seamless graphics editors integration (send images forth and back with one click).
See more at the [extension site](https://github.com/GChristensen/image-bench).

The full manual is built in: **Library › Manual** in the Image Bench window.

Note: This add-on is not designed to make SD WebUI less complicated.
It automates repetitive tasks, not the creative process.

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

Optional extensions: [sd-webui-openpose-editor](https://github.com/fabiencomte/sd-webui-openpose-editor) for editing poses from the ControlNet tab.

## Opening Image Bench

- `http://<webui address>/image-bench/app` opens it without a WebUI tab: the window loads WebUI itself in a tab
  of its own.
- The **🔬 Image Bench** button in the WebUI toolbar could open it as a new tab or a popup window depending on settings.
  By default, it offers to use the url above.

# Development repository link

This is not a development repository! The full source code is here: https://github.com/GChristensen/image-bench