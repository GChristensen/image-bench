# Image Bench for Photoshop

A UXP plugin that sends the active document to the **img2img → Inpaint upload** tab of SD WebUI (Forge / Forge Neo)
with the Image Bench extension installed:

- **Send image** — the composite document image goes to the inpaint upload image.
- **Send selection as mask** — the current selection, as a black and white image of the document size,
  goes to the inpaint upload mask (feathered selections produce gray edges).
- **Send image and mask** — both at once.

The same actions are available as menu commands in **Plugins → Image Bench**, so they can be bound to keyboard
shortcuts in **Edit → Keyboard Shortcuts → Plugins**.

Any open WebUI page receives the images; the Image Bench popup doesn't need to be open.

In the other direction, the **Send to Photoshop** button on an image in the Image Bench window places it
as a new layer of the active document (or opens it, if no document is open). The plugin stays connected to WebUI
while Photoshop runs, even with the panel closed; the panel shows the connection state. After a Photoshop restart
the plugin connects once its panel is shown (a docked panel is shown on startup) or a command is used.
The WebUI URL (default `http://127.0.0.1:7860`) is set in the panel.

Requires Photoshop 2024 (25.0) or newer.

## Development

1. Enable **Preferences → Plugins → Enable Developer Mode** in Photoshop (or run `just ps-enable`
   from an elevated shell) and restart it.
2. Install **UXP Developer Tool** from the Creative Cloud app.
3. In UXP Developer Tool: **Add Plugin** → select `manifest.json` from this folder → **Load**.
   Use **Reload** after editing the files and **Debug** for the console.

## Installation

- With the Creative Cloud app: run `just ps-package` (or **Package** in UXP Developer Tool), then double-click
  the produced `dist/*.ccx` file.
- Without it: run `just ps-deploy` from an elevated shell. It copies the plugin to
  `%CommonProgramFiles%\Adobe\UXP\Plugins\External` and registers it in `%APPDATA%\Adobe\UXP\PluginsInfo\v1\PS.json`,
  like the Creative Cloud installer does. `just ps-undeploy` removes it.

Restart Photoshop after installing.
