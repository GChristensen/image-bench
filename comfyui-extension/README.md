# Image Bench for ComfyUI

Image Bench extension for ComfyUI - systematic image generation experimentation and batch management.

## Features

- 🔬 Batch generation management
- 📊 Real-time image capture and display
- 💾 Image tray system for organizing generations
- 🎨 Parameter tracking and metadata
- 🖼️ Popup window interface (non-intrusive)

## Installation

### Method 1: Copy to custom_nodes

1. Build the extension:
   ```bash
   cd /path/to/image-bench
   just comfy
   # Or manually:
   # cd image-bench && npm run build:comfy
   # cp -f image-bench/dist/index.html comfyui-extension/js/
   ```

2. Copy the entire `comfyui-extension` folder to ComfyUI's custom_nodes directory:
   ```bash
   cp -r comfyui-extension /path/to/ComfyUI/custom_nodes/image-bench
   ```

3. Restart ComfyUI

### Method 2: Symlink (for development)

```bash
ln -s /path/to/image-bench/comfyui-extension /path/to/ComfyUI/custom_nodes/image-bench
```

## Usage

1. Start ComfyUI
2. Look for the **🔬 Image Bench** button in the toolbar
3. Click the button to open the Image Bench popup window
4. Generate images in ComfyUI - they will automatically appear in the Image Bench window

## Node Markers

An arbitrary workflow may contain several checkpoint loaders, samplers or text encoders, so Image Bench
cannot reliably guess which node it should drive. Tell it by adding a **marker** to the node's title
(right-click the node → *Title*, or double-click the title bar).

A marker has the form `ib:<type>:<index>`:

| Marker     | Node role        | Accepted node types                                                                                 | Widget written           |
|------------|------------------|-----------------------------------------------------------------------------------------------------|--------------------------|
| `ib:cp:0`  | Checkpoint loader | `CheckpointLoaderSimple`, `CheckpointLoader`, `unCLIPCheckpointLoader`, `UNETLoader`               | `ckpt_name` (`unet_name` for `UNETLoader`) |
| `ib:smp:0` | Sampler          | `KSampler`, `KSamplerAdvanced`, `SamplerCustom`, `SamplerCustomAdvanced`                             | `seed`, `control_after_generate`, `steps`, `cfg`, `denoise`, `sampler_name`, `scheduler` (those the node has) |
| `ib:pp:0`  | Positive prompt  | `String Literal`, `CLIPTextEncode`, `CLIPTextEncodeSDXL`, `CLIPTextEncodeFlux`, `CLIPTextEncodeSD3` | `text` (`string` for `String Literal`) |
| `ib:np:0`  | Negative prompt  | same as positive prompt                                                                              | `text` (`string` for `String Literal`) |

Rules:

- The marker may appear anywhere in the title and is case-insensitive, so `ib:cp:0`, `Main model ib:cp:0`
  and `IB:CP:0 - base` all work. It must be a separate word (`xib:cp:0` does not match).
- One title may carry several markers, e.g. `Text to Image ib:pp ib:smp ib:cp`.
- The `:<index>` part is optional (`ib:pp` is accepted). Indices are reserved for future multi-node support;
  currently the first node in the graph carrying a given marker type is used, so mark only one node per type.
- Mark the node that actually holds the prompt text. If the encoder's `text` is converted to an input fed by a
  `String Literal` node, mark the `String Literal` node.

What each marker is needed for and what happens without it:

| Marker | Used by | Fallback when absent |
|--------|---------|----------------------|
| `ib:cp` | Model exploration (switching checkpoints, restoring the original one afterwards); reading the model of a finished generation | **None for model exploration** — it fails with "No marked checkpoint node found". Reading generation info falls back to the first node of an accepted type. |
| `ib:smp` | Setting seed, `control_after_generate` and steps (batch generation, varying parameters, upscaling/hires); reading sampler parameters of a finished generation | The first `KSampler` node (for reading generation info: the first node of any accepted sampler type). |
| `ib:pp` | Writing the prompt (batch generation, varying parameters, applying image parameters); reading the prompt of a finished generation | The first `CLIPTextEncode` node in the graph. |
| `ib:np` | Writing/reading the negative prompt | The second `CLIPTextEncode` node in the graph. |

The `CLIPTextEncode` fallbacks depend on node creation order, which is easy to get wrong in anything but
the default workflow, so marking `ib:pp` and `ib:np` explicitly is recommended.

### Subgraphs

A marker can be put on a **subgraph node** instead of the nodes inside it. Image Bench then works through
the widgets promoted to the subgraph node: for each marker it looks for a promoted widget whose inner node
has an accepted type (for `ib:cp`, `ib:pp` and `ib:np` the promoted widget must also be the role's widget,
e.g. `text` of a `CLIPTextEncode`) and writes that promoted widget, which is the value ComfyUI actually queues.
Nested subgraphs are followed.

- Promote every widget Image Bench should drive. A sampler widget that is not promoted (e.g. `control_after_generate`,
  or `cfg` when only `seed` and `steps` are promoted) is written on the inner node, which changes the subgraph
  definition shared by all of its instances. A widget whose inner input is linked to something else is not written.
- If one subgraph node is marked both `ib:pp` and `ib:np`, the first promoted text widget is the positive prompt
  and the second one the negative prompt.
- Markers on nodes *inside* a subgraph are not searched; mark the subgraph node.
- Generation info of finished images is read from the inner nodes of the queued prompt
  (`/history` ids of the form `<subgraph node id>:<inner node id>`).

### Supporting Other Node Types

Accepted node types and the widget each one exposes are configured in `node_config.json`
(served as `/image-bench/node_config.json`). To support a custom loader, sampler or text node, add its
type to `nodeTypes` and map it to the relevant widget name in `widgetNames`:

```json
"checkpoint": {
  "marker": "cp",
  "nodeTypes": ["CheckpointLoaderSimple", "MyCustomLoader"],
  "widgetNames": {
    "CheckpointLoaderSimple": "ckpt_name",
    "MyCustomLoader": "model_name"
  }
}
```

For samplers, `widgetNames` names the *steps* widget; the other sampler widgets are looked up by their standard
names. `marker` changes the marker type of a role (e.g. `"marker": "model"` makes it `ib:model`).
The file is read when the ComfyUI page loads, so reload the page after editing it.
Model exploration offers the checkpoint list; a `UNETLoader` works only when its models have the same names.

## How It Works

### Image Capture

The extension intercepts ComfyUI's image generation events via `api.addEventListener("executed")`:

- Captures images as they're generated
- Extracts generation parameters from the workflow
- Sends image data to the popup window in real-time

### Parameter Modification (Future)

The extension includes a ComfyUIAdapter that can:

- Find nodes by type (KSampler, CheckpointLoaderSimple, etc.)
- Read/write node widget values
- Modify workflow parameters dynamically
- Queue prompts programmatically

Example:
```javascript
// Access the adapter
import { ComfyUIAdapter } from './adapters/ComfyUIAdapter.js';
const adapter = new ComfyUIAdapter(app, api);

// Modify parameters
adapter.setSeed(12345);
adapter.setSteps(30);
adapter.setCFG(7.5);
adapter.setModel('sd_xl_base_1.0.safetensors');

// Queue the prompt
adapter.queuePrompt();
```

## Architecture

```
comfyui-extension/
├── __init__.py                # Python backend
│   ├── PromptServer routes    # /image-bench/* endpoints
│   ├── WebSocket handler      # /image-bench/websocket
│   └── Config management      # config.json read/write
│
└── js/
    ├── index.html             # Built Vue app (popup interface)
    └── core.js # ComfyUI extension registration
        ├── Toolbar button
        ├── Event listeners (executed, execution_start, execution_error)
        └── WebSocket bridge
```

## Configuration

The extension creates a `config.json` file in the extension directory:

```json
{
  "repositionConfigPresetsDropdown": false,
  "automaticallyClearGeneratedImages": true,
  "defaultBatches": 100
}
```

## Differences from SD WebUI Version

| Feature | SD WebUI | ComfyUI |
|---------|----------|---------|
| UI Integration | Gradio callbacks | PromptServer routes |
| Image Capture | `on_image_saved` callback | `api.addEventListener("executed")` |
| Parameter Control | Direct DOM manipulation | Node widget manipulation |
| Batch Generation | UI batch count setting | Workflow queue management |
| Progress Tracking | DOM progress bar | WebSocket events |

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Build from Source

```bash
# Install dependencies
cd image-bench
npm install

# Build for ComfyUI
npm run build:comfy

# Copy to extension
cp -f dist/index.html ../comfyui-extension/js/
```

### Testing

1. Make changes to the code
2. Rebuild: `npm run build:comfy`
3. Copy to ComfyUI: `cp -f dist/index.html /path/to/ComfyUI/custom_nodes/image-bench/js/`
4. Restart ComfyUI
5. Check browser console for errors

### Debugging

- Python backend logs: Check ComfyUI console output
- JavaScript extension: Open browser DevTools → Console
- WebSocket: Monitor Network tab → WS filter

## Troubleshooting

### Button doesn't appear

- Check ComfyUI console for extension loading errors
- Verify `__init__.py` has no syntax errors
- Check that `WEB_DIRECTORY = "./js"` is set correctly

### Popup doesn't open

- Check browser popup blocker settings
- Verify `/image-bench/window` route returns HTML
- Check browser console for 404 errors

### Images don't appear in popup

- Verify WebSocket connection in Network tab
- Check that `api.addEventListener("executed")` is registered
- Ensure ComfyUI workflow includes SaveImage nodes
- Check browser console for JavaScript errors

### Workflow modification doesn't work

- Check that the target nodes carry the right markers (see [Node Markers](#node-markers))
- Verify node types match your workflow (KSampler, etc.)
- Check that widget names are correct
- Use `app.graph.nodes` to inspect available nodes
- Call `app.graph.setDirtyCanvas(true)` after modifications

## License

See repository root for license information.

## Credits

Part of the Image Bench project for Stable Diffusion image generation experimentation.
