# Image Bench for GIMP

A GIMP 3 Python plug-in that sends an image and its selection (as a mask) to SD WebUI or ComfyUI with the Image Bench
extension, and places images sent from the Image Bench window into GIMP. It speaks the same protocol as the Photoshop
and Krita plugins (`../PROTOCOL.md`). GIMP 2.10 is not supported.

- **Tools › Image Bench › Panel**: a window with the server URL (with the recent ones), the connection state, the image to
  work on, and the buttons Input / Inpaint (Image, Mask, Image + Mask), ControlNet (Preprocess, Image, Mask) and
  Keep (Compare; File and Final save the image as PSD, and as PNG and JPEG for Final, into the project open in
  Image Bench). Its process holds the connection: closing the window hides it, **Quit** ends it. Running Panel again shows
  the running panel (and selects the image it was run from).
- **Tools › Image Bench › Send ...**: the same send actions for the image of the window they are chosen in. Each runs in its
  own process and uploads over HTTP, so they work without the panel. Shortcuts: Edit › Keyboard Shortcuts.
- **Send to GIMP** on an image in the Image Bench window opens it as a new image, or places it as a layer of the
  panel's image above its selected layer (centered). Images arrive only while the panel runs.

The image sent is the visible layers merged, converted by babl to 8-bit sRGB RGBA whatever the image's mode.

## Why it is built this way

- GIMP plug-ins are processes started per procedure call, and cannot add dockable dialogs. The panel is a Gtk window
  of a plug-in that keeps running (`Gtk.main()`), like GIMP's Python console.
- Only one panel may run, or the second connection would replace the first (close code 4000). The panel installs the
  temporary procedure `plug-in-image-bench-panel-show` and calls `persistent_enable()`, so that GIMP can call it while
  the panel's main loop runs; `Panel` calls it when it exists instead of starting another panel.
- GIMP API calls must stay on the main thread. The WebSocket reads in a thread, uploads and downloads of the panel run
  in threads, and their results come back through `GLib.idle_add`.
- Plug-ins cannot ask for the active image window, hence the panel's image list.

## Files

- `image_bench/image_bench.py`: the plug-in (procedure registration, the send procedures, the panel procedure)
- `image_bench/panel.py`: the panel window, its sending and receiving
- `image_bench/actions.py`: the send actions shared by the menu and the panel
- `image_bench/document.py`: the GIMP API (pixels, selection, layers, images)
- `image_bench/client.py`, `image_bench/websocket.py`: HTTP (http.client) and WebSocket (socket), without the GIMP API
- `image_bench/net.py`: connecting with IPv4 first and no link-local IPv6, since Python otherwise waits for each
  unreachable address of a LAN machine name (`http://rtx:7860`) to time out
- `image_bench/settings.py`: `image_bench.json` in GIMP's profile folder, shared by all plug-in processes
- `image_bench/manifest.json`: the version, read by the backend
- `gimp.py`: packaging and installing from a shell (not part of the plugin)

## Installation

- From Image Bench: the Editors chapter of the manual (Library tab) has **Download .zip**.
- From the .zip: unpack it into the plug-ins folder (Edit › Preferences › Folders › Plug-ins), so that it holds
  `image_bench/image_bench.py`.
- From this folder: `just gimp-deploy` (copies `image_bench/` into the plug-ins folder of the newest `GIMP/3.x`
  profile, or of `GIMP3_DIRECTORY` if set, e.g. in `.env`), `just gimp-undeploy`, `just gimp-package` (`dist/*.zip`).
- GIMP Portable keeps its profile in `Data/GimpAppData` (its launcher sets `GIMP3_DIRECTORY`): set
  `GIMP3_DIRECTORY` to that folder for `just gimp-deploy`, or unpack the .zip into its `plug-ins` folder.

Then restart GIMP, which reads plug-ins at startup. Errors of the plug-in appear in Windows › Dockable Dialogs ›
Error Console.
