# Editor plugin protocol

The contract between the Image Bench backend (SD WebUI or ComfyUI) and the editor plugins in this folder
(`photoshop/`, `krita/`; `photoshop-canny/` is a standalone Photoshop plugin without a connection). A plugin is a thin client: it reads pixels, uploads them and
places the images it is sent. Routing, conversion and the ComfyUI input files are the backend's
(`common-extension/shared_backend/editor.py`). The backend never branches on the editor; its name only labels
the send actions of the Image Bench window.

All paths are relative to the server URL set in the plugin (`http://127.0.0.1:7860` by default, ComfyUI `:8188`).

## Editor → Image Bench: upload

```
POST /image-bench/editor/upload?kind=<kind>&width=<w>&height=<h>&components=<n>&target=<target>
Content-Type: application/octet-stream
<raw pixels>
```

- Body: 8-bit interleaved pixels of the whole canvas, row by row, `components` bytes per pixel in R, G, B(, A) order;
  `width * height * components` bytes. The plugin converts from its own layout (Krita: B, G, R, A).
- `kind=image`: the merged document, 3 or 4 components. `kind=mask`: the selection, 1 component, 255 = selected.
- `target` and the kinds it accepts (`editor.EDITOR_TARGET_KINDS`):

  | target | kinds | goes to |
  |---|---|---|
  | `input` | image, mask | img2img / inpaint upload (WebUI), the `ib:img` / `ib:mask` nodes (ComfyUI), or a new reference image |
  | `cn_preprocess` | image | the ControlNet unit shown in the Image Bench window, preprocessed; the preview comes back as an `OPEN_IMAGE` |
  | `cn_image` | image | the same unit's control image, without a preprocessor |
  | `cn_mask` | mask | the same unit's mask |
  | `compare` | image | the Compare tab, saved by the backend even with the window closed |

- Reply: `{"clients": n}` (host pages that received it; 0 means no WebUI/ComfyUI page is open, an error for the user),
  plus `"saved": true` for `compare`. 400 with a message for a bad kind, target or size.

## Image Bench → editor: the plugin WebSocket

`GET /image-bench/editor/websocket` (WebSocket, text frames, JSON messages). The plugin keeps it open for its whole
session, whether its panel is shown or not, and reconnects 5 s after it is lost.

- On open, the plugin sends `{"type": "HELLO", "editor": "Krita", "version": "1.0.0", "acks": true}`.
  `editor` is the display name ("Photoshop" if missing); `acks` tells that the plugin reports `OPEN_IMAGE_DONE`.
- The backend sends `{"type": "OPEN_IMAGE", "requestId", "name", "imageUrl", "newDocument"}`: the plugin fetches
  `imageUrl` (PNG, JPEG or WebP), places it as a new layer of the active document named after `name` without its
  extension, or opens it as a new document if `newDocument` is true or no document is open.
- The plugin answers `{"type": "OPEN_IMAGE_DONE", "requestId", "error"?}`; the window shows the transfer until then
  (60 s at most).

**One editor at a time.** The backend keeps a single plugin connection: a new one replaces the previous one, which is
closed with code **4000**. A plugin closed with 4000 does not reconnect on its own (two running editors would take the
connection from each other in turn); it shows that another editor is connected and reconnects when the user asks.
`GET /image-bench/editor/status` answers `{"editor": name | null}`.

## Adding an editor

1. A folder here with the plugin and a `manifest.json` holding at least `id`, `name` and `version`.
2. An installer module in `common-extension/shared_backend/` (see `uxp_install.py`, `krita_install.py`) and an entry in
   `editor_plugins.PLUGINS`, which gives the `/image-bench/editor/plugin*` routes and the manual's install card.
3. Its icon and short name in `image-bench/src/editor.js` (`EDITORS`) and `components/icons.js`.
4. The deploy line in `justfile` (`_deploy_editors`) and a chapter of the manual.
