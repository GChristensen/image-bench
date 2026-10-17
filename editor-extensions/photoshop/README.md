# Image Bench for Photoshop

A UXP plugin that sends the active document to the **img2img → Inpaint upload** tab of SD WebUI (Forge / Forge Neo),
or to marked load nodes in ComfyUI, with the Image Bench extension installed:

- **Send image** — the composite document image goes to the inpaint upload image.
- **Send selection as mask** — the current selection, as a black and white image of the document size,
  goes to the inpaint upload mask (feathered selections produce gray edges).
- **Send image and mask** — both at once.

The same actions are available as menu commands in **Plugins → Image Bench**, so they can be bound to keyboard
shortcuts in **Edit → Keyboard Shortcuts → Plugins**.

Any open WebUI page receives the images; the Image Bench popup doesn't need to be open.

With ComfyUI, the images are saved to the ComfyUI `input` directory (`image_bench_photoshop_image.png`,
`image_bench_photoshop_mask.png`) and loaded into the nodes whose titles contain the markers:

- `ib:img` — a `LoadImage` node receives the image.
- `ib:mask` — a `LoadImageMask` node (any channel) or the `MASK` output of a `LoadImage` node receives the mask.
  The mask file carries the selection in its color channels and the inverse in its alpha channel.

In the other direction, the **Send to Photoshop** button on an image in the Image Bench window places it
as a new layer of the active document (or opens it, if no document is open). The layer is rasterized, so its pixels
can be edited directly; check **Place as smart objects** in the panel to keep it a smart object instead. The plugin stays connected to
the server while Photoshop runs, even with the panel closed, and retries every 5 seconds when the connection is lost.
After a Photoshop restart the plugin connects once its panel is shown (a docked panel is shown on startup) or a command
is used. The server URL (default `http://127.0.0.1:7860`, ComfyUI usually `http://127.0.0.1:8188`) is set in the panel:
Enter connects to it, and so does the button next to it, which shows the connection state (Connected, Connecting...,
Reconnect) along with a green, orange or red indicator.

Requires Photoshop 2024 (25.0) or newer.

## Development

1. Enable **Preferences → Plugins → Enable Developer Mode** in Photoshop (or run `just ps-enable`
   from an elevated shell) and restart it.
2. Install **UXP Developer Tool** from the Creative Cloud app.
3. In UXP Developer Tool: **Add Plugin** → select `manifest.json` from this folder → **Load**.
   Use **Reload** after editing the files and **Debug** for the console.

## Installation

- From Image Bench: the **Manual** tab of the Image Bench window has an **Install** button (copies the plugin as
  `just ps-deploy` does, asking for administrator rights on Windows; on the computer the host runs on) and a
  **Download .ccx** link. The backend (`common-extension/shared_backend/editor_plugins.py`, `uxp_install.py`) finds the plugin in
  `shared/editor-extensions/photoshop` of the extension (copied there by `just deploy-webui` / `deploy-comfy`) or in this folder.
- With the Creative Cloud app: run `just ps-package` (or **Package** in UXP Developer Tool), then double-click
  the produced `dist/*.ccx` file.
- Without it: run `just ps-deploy` from an elevated shell. It copies the plugin to
  `%CommonProgramFiles%\Adobe\UXP\Plugins\External` and registers it in `%APPDATA%\Adobe\UXP\PluginsInfo\v1\PS.json`,
  like the Creative Cloud installer does. `just ps-undeploy` removes it.

Restart Photoshop after installing.
