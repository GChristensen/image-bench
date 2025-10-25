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
    └── image-bench-extension.js # ComfyUI extension registration
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

- Verify node types match your workflow (KSampler, etc.)
- Check that widget names are correct
- Use `app.graph.nodes` to inspect available nodes
- Call `app.graph.setDirtyCanvas(true)` after modifications

## License

See repository root for license information.

## Credits

Part of the Image Bench project for Stable Diffusion image generation experimentation.
