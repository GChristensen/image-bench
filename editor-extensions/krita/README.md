# Image Bench for Krita

A Krita Python plugin that sends the active document and its selection (as a mask) to SD WebUI or ComfyUI with the
Image Bench extension, and places images sent from the Image Bench window into Krita. It speaks the same protocol as
the Photoshop plugin (`../PROTOCOL.md`).

- **Settings › Dockers › Image Bench**: the server URL (with the recent ones), the connection state, and the buttons
  Input / Inpaint (Image, Mask, Image + Mask), ControlNet (Preprocess, Image, Mask) and Compare.
- **Tools › Scripts › Image Bench**: the same send actions, which can get shortcuts in
  Settings › Configure Krita › Keyboard Shortcuts.
- **Send to Krita** on an image in the Image Bench window places it as a layer above the active one (centered,
  converted to the document's color space), or opens it as a new document.

The image sent is the merged document converted to 8-bit sRGB, whatever the document's color space.

## Files

- `image_bench.desktop`, `image_bench/__init__.py`: the plugin descriptor and its registration
- `image_bench/extension.py`: the controller, alive for the whole Krita session: the connection, the send actions,
  the received images
- `image_bench/docker.py`: the docker
- `image_bench/document.py`: the Krita API (pixels, selection, layers, documents)
- `image_bench/client.py`, `image_bench/websocket.py`: HTTP and WebSocket over QtNetwork (Krita's PyQt5 has no
  QtWebSockets), without the Krita API
- `image_bench/manifest.json`: the version, read by the backend
- `krita.py`: packaging and installing from a shell (not part of the plugin)

## Installation

- From Image Bench: the Editors chapter of the manual (Library tab) has **Install** (on the computer the host runs on;
  Krita must be closed, since it rewrites its settings when it exits) and **Download .zip**.
- From the .zip: Krita › Tools › Scripts › Import Python Plugin from File, then restart Krita.
- From this folder: `just krita-deploy` (copies into `%APPDATA%\krita\pykrita` and sets `enable_image_bench=true` in
  `[python]` of `%LOCALAPPDATA%\kritarc`), `just krita-undeploy`, `just krita-package` (`dist/*.zip`).

Then enable the docker in Settings › Dockers › Image Bench. If the plugin does not load, check
Settings › Configure Krita › Python Plugin Manager.
