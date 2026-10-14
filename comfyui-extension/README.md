# Image Bench for ComfyUI

Image Bench extension for ComfyUI: systematic image generation experimentation and batch management
in a popup window that drives the workflow open in ComfyUI.

## Features

- 🎛️ **Generate tab**: edit the prompt, LoRAs, checkpoint, sampler, seed, size and more of the current workflow,
  generate one image with a live preview or a batch, set img2img / inpaint input images and edit model references
- 🧩 **ControlNet tab**: edit ControlNet units (model, weight, range, control image, mask) and run preprocessors
- 🔬 Model and LoRA exploration, batch generation, parameter sweeps
- 📊 Real-time image capture with generation parameters
- 💾 Image and concept trays for organizing generations
- 🖌️ Photoshop integration (inpaint images, references, ControlNet images and previews)
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
   # cp -rf common-extension/shared_frontend/* comfyui-extension/js/shared/
   ```

2. Copy the entire `comfyui-extension` folder to ComfyUI's custom_nodes directory:
   ```bash
   cp -r comfyui-extension /path/to/ComfyUI/custom_nodes/image-bench
   ```

3. Restart ComfyUI. ComfyUI loads extensions and custom nodes (the **Image Bench Prompt** node) only at startup.

### Method 2: Symlink (for development)

```bash
ln -s /path/to/image-bench/comfyui-extension /path/to/ComfyUI/custom_nodes/image-bench
```

### Optional dependencies

| Package | Needed for |
|---------|------------|
| [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | ControlNet preprocessors (`AIO_Preprocessor`): *Run preprocessor*, the preview, Pixel Perfect, Photoshop "preprocess". Without it the preprocessor controls are hidden. |
| [ComfyUI-Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) | ControlNet masks (`mask_optional` of its apply nodes). Without it the *Use Mask* option is hidden. |

## Usage

1. Start ComfyUI and open a workflow.
2. Mark the nodes Image Bench should drive (see [Quick Start](#quick-start-marking-a-workflow)).
3. Click the **🔬 Image Bench** button in the toolbar to open the popup window.
4. Generate from the popup, or queue in ComfyUI as usual: generated images appear in the popup either way.

## Quick Start: Marking a Workflow

An arbitrary workflow may contain several checkpoint loaders, samplers or text encoders, so Image Bench
cannot reliably guess which node it should drive. You tell it by adding a **marker** to the node's title
(right-click the node → *Title*, or double-click the title bar). For a typical text-to-image workflow:

1. Replace the positive `CLIPTextEncode` text with an **Image Bench Prompt** node (see
   [below](#image-bench-prompt-node)), or keep the encoder, and title it `ib:pp`.
2. Title the negative prompt encoder `ib:np`.
3. Title the sampler `ib:smp` (`KSampler`, or `SamplerCustomAdvanced` for Flux / Qwen style workflows).
4. Title the checkpoint (or `UNETLoader`, or a GGUF loader: `Unet Loader (GGUF)` of ComfyUI-GGUF, `GGUF Loader KJ` of
   KJNodes) `ib:cp`.
5. Optional:
   - img2img: title the `LoadImage` of the input image `ib:img`; inpaint: also title the mask loader `ib:mask`.
   - Hires. fix: title the second-pass sampler `ib:smp:1`, and an `If/Else Switch` choosing between the images of
     the two passes `ib:hr` (the Hires. fix checkbox).
   - Edit models: title the `LoadImage` nodes of the reference images `ib:ref:0`, `ib:ref:1`, ...
   - ControlNet: title each ControlNet apply node `ib:cn:0`, `ib:cn:1`, ...
   - LoRA exploration: title a `LoraLoader` `ib:lora`.

The Generate tab shows only the controls it found a node for, so a missing control usually means a missing marker.

## Node Markers

A marker has the form `ib:<type>` or `ib:<type>:<index>`:

| Marker | Node role | Accepted node types | Widgets used |
|--------|-----------|---------------------|--------------|
| `ib:cp` | Checkpoint / model loader | `CheckpointLoaderSimple`, `CheckpointLoader`, `unCLIPCheckpointLoader`, `UNETLoader`, `UnetLoaderGGUF` / `UnetLoaderGGUFAdvanced` (ComfyUI-GGUF), `GGUFLoaderKJ` (KJNodes) | `ckpt_name` (`unet_name` for `UNETLoader` and the ComfyUI-GGUF loaders, `model_name` for `GGUFLoaderKJ`) |
| `ib:smp` (`ib:smp:0`) | Sampler | `KSampler`, `KSamplerAdvanced`, `SamplerCustom`, `SamplerCustomAdvanced` | Its own widgets, and those of the nodes linked to it (see [Generation Parameters](#generation-parameters)) |
| `ib:smp:1` | Second-pass (Hires. fix) sampler | same as `ib:smp` | `steps`, `denoise` and the upscale nodes in front of it |
| `ib:hr` | Hires. fix switch | `ComfySwitchNode` (If/Else Switch), `ComfySoftSwitchNode`, `PrimitiveBoolean` | `switch` (`value` for `PrimitiveBoolean`); all marked nodes are set together |
| `ib:pp` | Positive prompt | `ImageBenchPrompt`, `String Literal`, `CLIPTextEncode`, `CLIPTextEncodeSDXL`, `CLIPTextEncodeFlux`, `CLIPTextEncodeSD3`, `TextEncodeQwenImage21` | `text` (`string` for `String Literal`, `prompt` for `TextEncodeQwenImage21`) |
| `ib:np` | Negative prompt | same as positive prompt | `text` (`string` for `String Literal`, `negative_prompt` for `TextEncodeQwenImage21`) |
| `ib:lora` | LoRA loader of LoRA exploration | `LoraLoader`, `LoraLoaderModelOnly` | `lora_name`, `strength_model`, `strength_clip` (those the node has) |
| `ib:img` | Input image (img2img, inpaint) | `LoadImage` | `image` |
| `ib:mask` | Inpaint mask | `LoadImageMask`, `LoadImage` (use its `MASK` output) | `image` |
| `ib:ref:N` | Reference image slot N of edit models | `LoadImage` | `image` |
| `ib:cn:N` | ControlNet unit N | `ControlNetApplyAdvanced`, `ControlNetApplySD3`, `ControlNetApply`, `ACN_AdvancedControlNetApply`, `ACN_AdvancedControlNetApply_v2` | `strength`, `start_percent`, `end_percent`, and the nodes linked to it (see [ControlNet Tab](#controlnet-tab)) |

Rules:

- The marker may appear anywhere in the title and is case-insensitive, so `ib:cp`, `Main model ib:cp:0`
  and `IB:CP:0 - base` all work. It must be a separate word (`xib:cp:0` does not match).
- One title may carry several markers, e.g. `Text to Image ib:pp ib:smp ib:cp`.
- The index is optional and means 0 when absent (`ib:smp` = `ib:smp:0`). It matters for `ib:smp` (0 is the main
  sampler, 1 the Hires. fix sampler), `ib:ref` and `ib:cn` (slot and unit numbers, ordered by index). For the other
  markers the first node in the graph carrying the marker is used, so mark only one node per type.
- Mark the node that actually holds the prompt text. If the encoder's `text` is converted to an input fed by a
  `String Literal` node, mark the `String Literal` node.
- A node holding both prompts in different widgets (`TextEncodeQwenImage21`) may carry both `ib:pp` and `ib:np`.
  Otherwise `ib:np` skips the node `ib:pp` resolved to.

What each marker is needed for and what happens without it:

| Marker | Used by | Fallback when absent |
|--------|---------|----------------------|
| `ib:cp` | Generate tab checkpoint list; model exploration (switching checkpoints, restoring the original one afterwards); reading the model of a finished generation | **None** — the Generate tab hides the checkpoint, model exploration fails with "No marked checkpoint node found". Reading generation info falls back to the first node of an accepted type. |
| `ib:smp` | Every sampler parameter of the Generate tab; seed, `control_after_generate` and steps for batch generation, varying parameters, upscaling/hires; reading sampler parameters of a finished generation | The first `KSampler` node (for reading generation info: the first node of any accepted sampler type). |
| `ib:smp:1` | Hires. fix group of the Generate tab (txt2img) | **None** — the group is hidden. |
| `ib:hr` | Hires. fix checkbox of the Generate tab; the Upscale action switches it on for its runs and restores it afterwards | **None** — the checkbox is hidden and the Hires. fix pass always runs; Upscale generates the image again as it is. |
| `ib:pp` | Generate tab prompt and LoRA list; writing the prompt in strategies; reading the prompt of a finished generation | The first `CLIPTextEncode` node in the graph. |
| `ib:np` | Generate tab negative prompt; writing/reading the negative prompt | The second `CLIPTextEncode` node in the graph. Without either, the Generate tab hides the negative prompt (e.g. Flux). |
| `ib:lora` | LoRA exploration: sets `lora_name` and both strengths to the LoRA's weight for each explored LoRA; the LoRA-free run sets the strengths to 0, which skips loading the LoRA. A bypassed or muted marked node is enabled during exploration. Its LoRA, strengths and mode are restored afterwards. The LoRA's activation text is appended to the prompt. | **None** — exploration with LoRAs selected is refused with an alert. |
| `ib:img` / `ib:mask` | The generation mode of the Generate tab and its Input / Mask panes; images from the Photoshop plugin | **None** — the Generate tab works in txt2img mode; images sent from Photoshop are saved and a message reports that no node is marked. See [Inpaint Images](#inpaint-images). |
| `ib:ref:N` | References panel of the Generate tab; Photoshop images sent to "New reference" | **None** — the References panel is hidden. |
| `ib:cn:N` | ControlNet tab; "Send to ControlNet"; Photoshop ControlNet targets | **None** — the ControlNet tab reports that no ControlNet node is marked. |

The `CLIPTextEncode` fallbacks depend on node creation order, which is easy to get wrong in anything but
the default workflow, so marking `ib:pp` and `ib:np` explicitly is recommended.

## Image Bench Prompt Node

In SD WebUI LoRAs travel in the prompt as `<lora:name:weight>` tags, and the LoRA list of the Generate tab checks a
LoRA by adding its tag to the prompt. Core ComfyUI ignores such tags, so the extension adds the
**Image Bench Prompt** node (category *Image Bench*):

| Input / output | Type | Description |
|----------------|------|-------------|
| `model` (input) | `MODEL` | The model the LoRAs are applied to |
| `clip` (optional input) | `CLIP` | The text encoder the LoRAs are applied to; leave unconnected for model-only LoRAs |
| `text` (widget) | `STRING` | The prompt, with `<lora:...>` tags anywhere in it |
| `model`, `clip` (outputs) | `MODEL`, `CLIP` | With the LoRAs applied |
| `text` (output) | `STRING` | The prompt without the tags and the separators they leave behind |

Wiring: `Load Checkpoint` → `model`/`clip` → **Image Bench Prompt** (titled `ib:pp`) → `model` to the sampler,
`clip` and `text` to a `CLIPTextEncode` whose `text` is converted to an input. Route the negative prompt encoder's
`clip` from the prompt node's `clip` output too, so that it uses the same CLIP.

Tag syntax (as in SD WebUI):

- `<lora:name>` — weight 1
- `<lora:name:0.8>` — weight 0.8 for both the model and the text encoder
- `<lora:name:0.5:1>` — text encoder 0.5, model 1

`name` is the LoRA path relative to the `loras` folder, with or without the extension, or just the file name
(`<lora:styles/ink.safetensors:0.7>`, `<lora:styles/ink:0.7>` and `<lora:ink:0.7>` all match). Unknown names are
logged in the ComfyUI console and skipped. LoRAs with both weights 0 are not loaded.

The Generate tab writes the tags for you; checking a LoRA there adds its tag (with the weight and activation text set
in the Explore tab, or the preferred weight and activation text of its Forge / A1111 sidecar `.json`).

## Generate Tab

The Generate tab mirrors the marked nodes both ways: while the tab is shown, it polls the workflow every 0.6 s and
shows what you change in ComfyUI; what you change in the popup is written to the node widgets at once.

### Generation mode

ComfyUI has no txt2img / img2img switch: the workflow is the mode. The tab derives it from the markers:

| Workflow has | Mode | Panes and fields |
|--------------|------|------------------|
| neither `ib:img` nor `ib:mask` | txt2img | Result; size; Hires. fix group if `ib:smp:1` is marked |
| `ib:img` | img2img | Result, Input; denoising strength |
| `ib:img` and `ib:mask` | inpaint | Result, Input, Mask; denoising strength |

Input images are uploaded, dropped or pasted onto the Input / Mask panes. They are saved to the ComfyUI `input`
directory as `image_bench_input_image.png` / `image_bench_input_mask.png` (overwritten each time) and selected in the
marked nodes. Masks may be white-on-black images or images that are transparent where masked; they are stored like
Photoshop masks (see [Inpaint Images](#inpaint-images)). The Mask pane shows the mask white on black.

### Generation Parameters

Sampler parameters are located through the sampler marked `ib:smp`, so both sampler styles work without further
markers:

| Field | `KSampler` / `KSamplerAdvanced` | `SamplerCustomAdvanced` |
|-------|---------------------------------|-------------------------|
| Seed | `seed` (`noise_seed`) | `RandomNoise.noise_seed` (input `noise`) |
| Steps | `steps` | `BasicScheduler.steps` (input `sigmas`) |
| CFG scale | `cfg` | `CFGGuider.cfg` (input `guider`) |
| Sampling method | `sampler_name` | `KSamplerSelect.sampler_name` (input `sampler`) |
| Schedule type | `scheduler` | `BasicScheduler.scheduler` |
| Denoising (img2img, inpaint) | `denoise` | `BasicScheduler.denoise` |
| Distilled CFG | `FluxGuidance.guidance` on the `positive` conditioning | `FluxGuidance.guidance` in front of the guider |
| Shift (when there is no `FluxGuidance`) | `ModelSamplingSD3` / `ModelSamplingAuraFlow` `.shift` along the `model` input | the same, in front of the guider |
| Width × height | `EmptyLatentImage`, `EmptySD3LatentImage`, `EmptyFlux2LatentImage`, ... linked to `latent_image`, or the `PrimitiveInt` nodes feeding its `width` / `height` | the same (Flux.2 workflows feed `Flux2Scheduler` from the same primitives) |

With `ib:smp:1` the Hires. fix group of txt2img edits its `steps` and `denoise` (or those of a `BasicScheduler` /
`Flux2Scheduler` and a `SplitSigmasDenoise` on its `sigmas`), the `scale_by` of the `LatentUpscaleBy` /
`ImageScaleBy` in front of it, and the upscaler: `UpscaleModelLoader.model_name`, else the `upscale_method` of the
scale node.

The Hires. fix checkbox needs a switch marked `ib:hr`. Use the core **If/Else Switch** (`ComfySwitchNode`): `on_false`
from the first pass image, `on_true` from the Hires. fix image, its output to the save node. Its inputs are lazy, so
the Hires. fix nodes do not run while it is off. (Bypassing the Hires. fix nodes instead would not pass the first pass
image on.)

Links are followed through Reroute nodes and into the subgraph a node is in. Where these nodes live is configured in
the `generation_params` section of `node_config.json` (see [Generation parameter locators](#generation-parameter-locators)),
so other node types can be added there. Every field whose node is not found is hidden.

The checkpoint, sampler, scheduler and upscaler lists are the choices of the workflow widgets, so a `UNETLoader`
lists the diffusion models and a GGUF loader the `.gguf` files. Model exploration (the Explore tab) lists the `checkpoints`
folder only, so with a `UNETLoader` or GGUF loader marked `ib:cp` it offers no usable models; switch them in the
Generate tab's model list instead.

### Seed

A seed of **−1** sets the seed widget's `control_after_generate` to `randomize`: the current seed is used for the next
image and a new one is picked after each queued prompt, as −1 generates with a random seed in SD WebUI. Any other
seed sets `control_after_generate` to `fixed`. A batch (more than one image) also sets the seed to −1. The reuse button
of the seed field takes the seed of the latest generated image.

### Generating

- **Generate** with 1 image queues the workflow as it is and shows the result in the tab, with the sampler's latent
  preview while it runs (enable previews in the ComfyUI settings). More images, or ∞, run a batch shown in the
  Generated tab.
- **Skip** interrupts the running prompt; ComfyUI continues with the queue, and a running batch with its next image.
- **Stop** clears the ComfyUI queue (including prompts queued from ComfyUI itself), interrupts the running prompt and
  stops the batch.

### References

Edit models that take reference images (Flux Kontext / Klein, Qwen Image Edit, ...) get them from `LoadImage`
nodes. Title them `ib:ref:0`, `ib:ref:1`, ... in the order the prompt refers to them (Image 1, Image 2, ...).
The References tab next to the LoRA list then shows the slots in use:

- An added image goes into the first unused slot, or replaces the last slot when all are used. Slot N is saved as
  `image_bench_reference_N.png` in the `input` directory.
- Removing an image bypasses its `LoadImage` together with the nodes that cannot run without it (e.g. a `VAEEncode`),
  up to a node that can pass its other input through (e.g. `ReferenceLatent` passes the conditioning) or that takes
  the image as an optional input (e.g. `image2` of `TextEncodeQwenImageEditPlus`). Adding an image enables them again.
  Check the bypassed nodes once on a new workflow.
- Slots inside a subgraph cannot be bypassed and are always in use.
- "Ps sends to → New reference" puts images from the Photoshop plugin into the slots.

### Not available in ComfyUI

The mode switch, Variations and the variation seed, UI presets, token counts, the WebUI prompt lock, the img2img
resize mode / mask mode / inpaint area / masked content options, and the reference *Use*, *Max side* and *Edit*
options have no ComfyUI counterpart and are hidden.

## ControlNet Tab

The ControlNet tab edits one unit at a time; unit N is the ControlNet apply node titled `ib:cn:N`. Starting from the
apply node, the unit's other nodes are found through its inputs:

| Field | Node | Widget |
|-------|------|--------|
| Enable | the apply node (unchecked = bypassed, which passes the conditioning through) | — |
| Control weight | the apply node | `strength` |
| Starting / ending step | the apply node | `start_percent` / `end_percent` |
| Model | `ControlNetLoader`, `DiffControlNetLoader` or an Advanced-ControlNet loader linked to `control_net` | `control_net_name` (`cnet`) |
| Control image | `LoadImage` linked to `image`, directly or through an `AIO_Preprocessor` | `image` |
| Preprocessor | an `AIO_Preprocessor` between the `LoadImage` and the apply node, if there is one | `preprocessor`, `resolution` |
| Use Mask / mask | `LoadImageMask` or `LoadImage` linked to `mask_optional` (Advanced-ControlNet apply nodes only; unchecked = bypassed) | `image` |

A typical unit:

```
Load ControlNet Model ──────────────────────────────┐
Load Image ──► AIO Aux Preprocessor (optional) ──► Apply ControlNet  ib:cn:0 ──► sampler
                                                   ▲ positive / negative
```

- **Control image**: upload, drop or paste it onto the Source pane, or use "Send to ControlNet" in the image lists.
  It is saved as `image_bench_cn_N_image.png` (`image_bench_cn_N_mask.png` for the mask) and the unit is enabled.
- **Preprocessor** (needs comfyui_controlnet_aux): with an `AIO_Preprocessor` in the unit, the preprocessor field is
  its widget and the workflow preprocesses the image at generation. Without one, the field only chooses the
  preprocessor of *Run preprocessor*, and the control image is used as it is.
- **Run preprocessor** runs `LoadImage → AIO_Preprocessor → PreviewImage` as a separate prompt at the front of the
  queue (your workflow is not run) and shows the result in the Preview pane, from where it can be copied, saved or
  sent to Photoshop. These prompts do not appear in the Generated tab.
- **Pixel Perfect** computes the preprocessor resolution from the control image and the latent size of the workflow
  (as SD WebUI does for "Crop and resize"); it also keeps the `resolution` of an `AIO_Preprocessor` in the unit up to
  date. Without it the resolution is 512.
- **Refresh models** reloads the model list. ComfyUI has no control types, so all preprocessors and models are listed.
- Not available in ComfyUI: the txt2img / img2img switch, control type, control mode, resize mode, the independent
  control image, Allow Preview (the preview is always kept) and clearing the control image (a `LoadImage` always has
  a file).

## Photoshop

The Image Bench Photoshop plugin sends the document image, the selection mask or a ControlNet image to
`/image-bench/photoshop/upload`. The backend saves it to the ComfyUI `input` directory and the page loads it into the
marked node:

| Plugin button (target) | File in `input` | Goes to |
|------------------------|-----------------|---------|
| Image (`input`) | `image_bench_photoshop_image.png` | `ib:img`, or a new reference (`ib:ref`) if the Generate tab routes images there ("Ps sends to", popup open) |
| Mask (`input`) | `image_bench_photoshop_mask.png` | `ib:mask` |
| ControlNet: preprocess (`cn_preprocess`) | `image_bench_photoshop_cn_image.png` | Control image of the unit shown in the ControlNet tab (unit 0 if the popup was not opened); the preprocessor runs and its result is placed back in Photoshop as a layer |
| ControlNet: image (`cn_image`) | `image_bench_photoshop_cn_image.png` | Control image of that unit, used without a preprocessor (the preprocessor is set to `none`) |
| ControlNet: mask (`cn_mask`) | `image_bench_photoshop_cn_mask.png` | Mask of that unit (Advanced-ControlNet apply nodes) |

Files are overwritten by the next image of the same kind; references are copied into their slot files.
"Send to Photoshop" in the popup places any image as a layer of the active Photoshop document.

### Inpaint Images

Image Bench only selects the file in the marked loader; what the workflow does with the image and the mask is up
to it (`VAEEncode` + `SetLatentNoiseMask`, `VAEEncodeForInpaint`, `InpaintModelConditioning`, `ImageCompositeMasked`...).
Mask files hold the mask in their color channels and its inverse in alpha, so `LoadImageMask` with any channel and
the `MASK` output of `LoadImage` both read it. Supported combinations:

| `ib:img` | `ib:mask` | Notes |
|----------|-----------|-------|
| `LoadImage` | `LoadImageMask` | The usual setup; any `channel` works. |
| `LoadImage` | another `LoadImage` | Use the `MASK` output of the mask node; its `IMAGE` output is the mask picture. |
| `LoadImage` | — | Image only (img2img). A sent mask has nowhere to go and is reported. |
| — | `LoadImageMask` or `LoadImage` | Mask only; the image comes from elsewhere in the workflow (the Generate tab stays in txt2img mode). |

- The mask never goes to the `ib:img` node: `ib:mask` skips the node the image is loaded into. A single `LoadImage`
  marked `ib:img ib:mask` therefore receives only the image (the mask is reported). Use the `MASK`
  output of the `ib:img` node only for a mask painted into the image's own alpha channel.
- In a subgraph node marked `ib:img ib:mask`, the image goes to the first promoted `LoadImage` `image` widget and
  the mask to the next promoted loader widget (a `LoadImageMask`, or a second `LoadImage`).
- A bypassed or muted marked node is updated but not enabled.
- Other loaders that pick a file from the `input` directory by name can be added to the `image` / `mask` sections
  of `node_config.json`.

Messages ("no node is marked", errors) appear in the popup, or as a ComfyUI toast when the popup is closed.

## Subgraphs

A marker can be put on a **subgraph node** instead of the nodes inside it. Image Bench then works through
the widgets promoted to the subgraph node: for each marker it looks for a promoted widget whose inner node
has an accepted type (for every marker except `ib:smp` the promoted widget must also be the role's widget,
e.g. `text` of a `CLIPTextEncode`) and writes that promoted widget, which is the value ComfyUI actually queues.
Nested subgraphs are followed.

- Promote every widget Image Bench should drive. A widget that is not promoted (e.g. `control_after_generate`,
  or `cfg` when only `seed` and `steps` are promoted) is written on the inner node, which changes the subgraph
  definition shared by all of its instances. A widget whose inner input is linked to something else is not written.
- Nodes linked to a marked node inside a subgraph (the `RandomNoise` of a `SamplerCustomAdvanced`, the loader of a
  ControlNet apply node) are found inside the subgraph, and links coming from the subgraph's inputs are followed out
  to the parent graph.
- If one subgraph node is marked both `ib:pp` and `ib:np`, the first promoted text widget is the positive prompt
  and the second one the negative prompt.
- Markers on nodes *inside* a subgraph are not searched; mark the subgraph node.
- Reference slots and ControlNet units inside a subgraph cannot be bypassed (removed / disabled).
- Generation info of finished images is read from the inner nodes of the queued prompt
  (`/history` ids of the form `<subgraph node id>:<inner node id>`).

## Configuration

### node_config.json

Accepted node types, widget names and parameter locations are configured in `node_config.json` in the extension
directory (served as `/image-bench/node_config.json`). The file is read when the ComfyUI page loads, so **reload the
page** after editing it. Support for custom nodes is added there, not in code.

#### Marker roles

The sections `checkpoint`, `sampler`, `positive_prompt`, `negative_prompt`, `lora`, `image`, `mask`, `reference` and
`hires_fix` share the same shape:

```json
"checkpoint": {
  "marker": "cp",
  "nodeTypes": ["CheckpointLoaderSimple", "UNETLoader", "MyCustomLoader"],
  "widgetNames": {
    "CheckpointLoaderSimple": "ckpt_name",
    "UNETLoader": "unet_name",
    "MyCustomLoader": "model_name"
  }
}
```

| Key | Meaning |
|-----|---------|
| `marker` | Marker type of the role (`"marker": "model"` makes it `ib:model`) |
| `nodeTypes` | Node types (class names, as shown in the node's *Properties Panel*) accepted for the role |
| `widgetNames` | The widget holding the role's value, per node type. For `sampler` it names the steps widget; the other sampler values come from `generation_params`. |

To support a custom loader or text node, add its type to `nodeTypes` and its widget to `widgetNames`.
LoRA strength widgets are looked up by the standard names `strength_model` / `strength_clip`.

#### ControlNet

```json
"controlnet": {
  "marker": "cn",
  "nodeTypes": ["ControlNetApplyAdvanced", "ACN_AdvancedControlNetApply", ...],
  "widgetNames": {"ControlNetApplyAdvanced": "strength", ...},
  "loaderTypes": {"ControlNetLoader": "control_net_name", "ControlNetLoaderAdvanced": "cnet", ...},
  "imageTypes": {"LoadImage": "image"},
  "maskTypes": {"LoadImageMask": "image", "LoadImage": "image"},
  "preprocessorTypes": ["AIO_Preprocessor"]
}
```

| Key | Meaning |
|-----|---------|
| `nodeTypes` / `widgetNames` | Apply node types and their weight widget; `start_percent` / `end_percent` are read by name |
| `loaderTypes` | Model loader types found through the `control_net` input, with their model widget |
| `imageTypes` | Image loader types found through the `image` input, with their file widget |
| `maskTypes` | Mask loader types found through the `mask_optional` input |
| `preprocessorTypes` | Preprocessor node types recognized between the image loader and the apply node (they need the `preprocessor` and `resolution` widgets of `AIO_Preprocessor`) |

#### Generation parameter locators

The `generation_params` section tells where each Generate tab parameter lives, relative to the sampler marked
`ib:smp` (or `ib:smp:1`). Each parameter has an ordered list of **locators**; the first one that finds an existing
widget wins:

```json
"seed": [
  {"widget": "seed"},
  {"widget": "noise_seed"},
  {"via": ["noise"], "types": ["RandomNoise"], "widget": "noise_seed"}
],
"shift": [
  {"via": ["model"], "deep": "model", "types": ["ModelSamplingSD3", "ModelSamplingAuraFlow"], "widget": "shift"}
],
"hiresScale": [
  {"role": "hiresSampler", "via": ["latent_image"], "deep": true, "types": ["LatentUpscaleBy", "ImageScaleBy"], "widget": "scale_by"}
]
```

| Locator key | Meaning |
|-------------|---------|
| `widget` | The widget holding the value (required) |
| `role` | Start node: `sampler` (`ib:smp`, default) or `hiresSampler` (`ib:smp:1`) |
| `via` | Input names followed one after another from the start node; without `via` the widget is on the start node itself |
| `types` | Accepted node types of the node reached; any type if absent |
| `deep` | If the node reached is not of `types`, keep walking upstream: `true` through any input, an input name through inputs of that name only (e.g. `"model"` walks the model chain through LoRA loaders). The nearest matching node wins; deep walks never pass another sampler. |

Parameters: `seed`, `steps`, `cfg`, `sampler`, `scheduler`, `denoise`, `guidance` (shown as Distilled CFG), `shift`
(shown when there is no `guidance`), `width`, `height`, `hiresSteps`, `hiresDenoise`, `hiresScale`, `hiresUpscaler`.
They are also used by batch generation, parameter sweeps and model exploration, and to read the parameters of finished
images from `/history`. Keys starting with `_` are comments.

Example: a custom noise node `MyNoise` with a `seed` widget feeding `SamplerCustomAdvanced`:

```json
"seed": [
  {"widget": "seed"},
  {"widget": "noise_seed"},
  {"via": ["noise"], "types": ["RandomNoise"], "widget": "noise_seed"},
  {"via": ["noise"], "types": ["MyNoise"], "widget": "seed"}
]
```

### config.json

The extension creates a `config.json` file with the popup settings (edited in the Settings tab):

```json
{
  "repositionConfigPresetsDropdown": false,
  "automaticallyClearGeneratedImages": true,
  "defaultBatches": 100
}
```

### Files written by the extension

| Location | Files |
|----------|-------|
| ComfyUI `input` directory | `image_bench_input_*.png` (Generate tab inputs), `image_bench_reference_N.png` (references), `image_bench_cn_N_*.png` (ControlNet units), `image_bench_photoshop_*.png` (Photoshop) — all overwritten in place |
| `store/` in the extension directory | Image and concept trays, explore presets, model hashes, Civitai lookups |

## Example Workflows

`example_workflows/` (listed in ComfyUI's template browser under this extension) contains workflows with every node
already marked. Each one has a note with the model's settings and download links.

Text-to-image with the Generate tab LoRA list (an **Image Bench Prompt** node marked `ib:pp`) and a bypassed
`ib:lora` loader for LoRA exploration:

| Workflow | Model | Sampler | Default settings | Negative prompt |
|----------|-------|---------|------------------|-----------------|
| `image_flux2_dev_lora.json` | FLUX.2 [dev] fp8 | `SamplerCustomAdvanced` + `Flux2Scheduler`, `FluxGuidance` | 28 steps, guidance 4, euler, 1024×1024 | — (embedded guidance) |
| `image_flux2_klein_9b_lora.json` | FLUX.2 [klein] 9B fp8, distilled (note: how to switch to the base model) | `SamplerCustomAdvanced` + `Flux2Scheduler`, `CFGGuider` | 4 steps, CFG 1, euler, 1024×1024 | — (zeroed) |
| `image_qwen_image_2_1_lora.json` | Qwen Image 2.1 int8 | `KSampler`, `TextEncodeQwenImage21` (`ib:np`) | 25 steps, CFG 1, euler / simple, 1248×832 | `negative_prompt` of the encoder (used only with CFG > 1) |
| `image_krea2_turbo_lora.json` | Krea 2 Turbo fp8 | `KSampler` | 8 steps, CFG 1, euler / simple, 1024×1024 | — (zeroed) |

The Flux.2 workflows set the size with **Width** / **Height** primitives shared by the latent and the scheduler, which
the Generate tab edits. Pick a LoRA in **Load LoRA** only if you enable it for a manual run.

FLUX.2 [dev], Qwen Image 2.1 and Ideogram 4 with every Generate tab feature that ComfyUI offers for them: the LoRA list,
Hires. fix or inpainting, and for the edit models FLUX.2 and Qwen four reference slots (`ib:ref:0`–`ib:ref:3`,
bypassed while empty) for the References panel:

| Workflow | Generate tab mode | Adds |
|----------|-------------------|------|
| `image_flux2_dev_full.json` | txt2img | References (scaled to 1 MP → `VAE Encode` → `Reference Latent` chain), Hires. fix (`ib:smp:1`: upscaler model, a `Flux2Scheduler` for the new size, denoising by `Split Sigmas Denoise`; `ib:hr` switch) |
| `image_flux2_dev_inpaint.json` | Inpaint | `ib:img` / `ib:mask` (Photoshop or the Input / Mask cells), `Differential Diffusion`, denoising by `Split Sigmas Denoise`, composite through the mask; references |
| `image_qwen_image_2_1_full.json` | txt2img | References (the `images` inputs of `Text Encode Qwen Image 2.1`), Hires. fix (`ib:smp:1`: upscaler model, a second `KSampler` at denoising 0.4; `ib:hr` switch) |
| `image_qwen_image_2_1_inpaint.json` | Inpaint | `ib:img` / `ib:mask`, `Differential Diffusion`, composite through the mask; references |
| `image_ideogram4_full.json` | txt2img | Ideogram 4: `Dual Model CFG Guider` (CFG scale) with the unconditional model, `CFG Override`, `Ideogram 4 Scheduler` (steps; its `mu` is the Shift field), Hires. fix as in the FLUX.2 workflow; no references or negative prompt (the model takes neither) |
| `image_ideogram4_inpaint.json` | Inpaint | Ideogram 4 with `ib:img` / `ib:mask`, `Differential Diffusion`, denoising by `Split Sigmas Denoise`, composite through the mask |

The Hires. fix pass upscales with an upscaler model (`Load Upscale Model`, the Upscaler list of the Generate tab;
`RealESRGAN_x4plus` by default, which must be installed in `models/upscale_models`) and resizes the result to the
first pass size × *Upscale by*. The **Hires. fix ib:hr** switch is the Hires. fix checkbox: generate drafts with it off,
then use **Upscale** on the ones you keep (see [Upscaling](#upscaling)).

ComfyUI has no ControlNet for these models, so the ControlNet tab shows no units with them; with FLUX.2 and Qwen a
pose or depth map can be given as a reference instead.

## Upscaling

The **Upscale** (U) and **Upscale with denoising** (D) buttons of the image cards, and **Upscale selected** of the trays,
generate images again with the Hires. fix pass of the open workflow, as WebUI does with its Hires. fix checkbox. The
results go to the **Upscaled** tab, which keeps them in `image-bench/upscaled` of the output directory.

- The workflow needs a Hires. fix sampler (`ib:smp:1`); without one the buttons report that it is missing. A switch
  marked `ib:hr` is turned on for the run and restored afterwards; without one the Hires. fix pass always runs.
- Each image is generated again from its parameters, as read from ComfyUI's history: prompt (with its LoRA tags),
  model, seed, steps, CFG, sampler, scheduler, size and Distilled CFG / Shift. Everything else, references included,
  comes from the open workflow, so upscale with the workflow the images were made with (or one with the same nodes).
- **Upscale with denoising** asks for denoising strengths and sets each one as the Hires. fix denoising.
- **Generate with steps** (G) generates an image again with each of a list of step counts, Hires. fix as it is set.
- The parameters of the workflow are restored when the run ends or is stopped.

Anima:

- `image_anima_lora.json`: a flat Anima text-to-image workflow with every node already marked
  (`ib:cp`, `ib:lora`, `ib:pp`, `ib:np`, `ib:smp`).
- `image_anima_inpaint.json`: Anima inpainting of a Photoshop selection. `Load Image ib:img` and
  `Load Image Mask ib:mask` receive the image and the mask from the Photoshop plugin; the mask, grown by 8 px,
  limits the re-noised latent area (`Set Latent Noise Mask`, `denoise` 0.9), and the result is pasted back
  into the original through the original selection (`Image Composite Masked`), so nothing outside it changes.
  Send the image and mask once before queueing, since the loaders refer to the files the plugin writes.

## How It Works

The popup never touches ComfyUI directly: it sends `postMessage` commands to the ComfyUI page, where
`js/core.js` runs them against `app.graph`, and receives generated images and state back.

- **Image capture**: `api.addEventListener("executed")` captures each output image; its parameters are read from
  `/history` (the queued prompt, so randomized seeds are exact).
- **Strategies** (batch, exploration, sweeps) from the shared frontend code call the `ComfyUIOperations` facade,
  which writes node widgets and queues with `app.queuePrompt()`.
- **Generate and ControlNet tabs**: small modules poll the workflow while their tab is shown and apply the popup's
  edits; each handles its own popup messages.

```
comfyui-extension/
├── __init__.py              # PromptServer routes (/image-bench/*), WebSocket, config
├── image_bench_nodes.py     # Image Bench Prompt node
├── node_config.json         # Marker roles, ControlNet nodes, generation parameter locators
└── js/
    ├── index.html           # Built Vue app (popup)
    ├── core.js              # Extension registration, toolbar button, events, message dispatch
    ├── workflow.js          # Markers, marker targets (incl. subgraphs), /history parameters
    ├── graph.js             # Following links upstream, bypass chains
    ├── params.js            # Generation parameters located through the sampler
    ├── facade/ComfyUIOperations.js  # Facade used by the strategies
    ├── mirror.js            # Generate tab mirror
    ├── generation.js        # Single generation, skip, stop
    ├── progress.js          # Busy state, progress, latent previews
    ├── references.js        # ib:ref slots
    ├── images.js            # Uploads, /view URLs, mask previews
    ├── controlnet.js        # ib:cn units, preprocessor runs
    └── shared/              # Copy of common-extension/shared_frontend (made by `just comfy`)
```

## Differences from SD WebUI Version

| Feature | SD WebUI | ComfyUI |
|---------|----------|---------|
| Finding the controls | Fixed Gradio element ids | Node markers and `node_config.json` |
| Image capture | `on_image_saved` callback | `api.addEventListener("executed")` |
| Parameter control | DOM manipulation | Node widget manipulation |
| Batch generation | UI batch count | One queued prompt per image |
| Generation mode | txt2img / img2img / Inpaint tabs | Derived from `ib:img` / `ib:mask` |
| LoRAs in the prompt | Built in | Image Bench Prompt node |
| References | Forge ImageStitch gallery | `ib:ref` LoadImage slots |
| ControlNet | Forge ControlNet Integrated units | `ib:cn` apply nodes; preprocessors via comfyui_controlnet_aux |
| Upscaling / hires of existing images | Hires. fix checkbox | `ib:smp:1` Hires. fix pass, `ib:hr` switch |

## Development

### Prerequisites

- Node.js 16+
- npm
- [just](https://github.com/casey/just)

### Build from Source

```bash
cd image-bench && npm install && cd ..
just comfy   # builds the popup and copies it and the shared frontend code into comfyui-extension/js
```

`js/shared/` is a copy, so changes to `common-extension/shared_frontend` reach ComfyUI only after `just comfy`.
Reload the ComfyUI page after a rebuild; restart ComfyUI after changing Python files.

### Debugging

- Python backend logs: ComfyUI console output
- JavaScript extension: browser DevTools → Console (`[Image Bench]` messages)
- WebSocket: DevTools Network tab → WS filter

## Troubleshooting

### Button doesn't appear

- Check the ComfyUI console for extension loading errors
- Verify `__init__.py` has no syntax errors and `WEB_DIRECTORY = "./js"` is set

### Popup doesn't open

- Check the browser popup blocker settings
- Verify the `/image-bench/window` route returns HTML

### Images don't appear in the popup

- The workflow must include an output node (`SaveImage` or `PreviewImage`)
- Verify the WebSocket connection in the Network tab
- Check the browser console for JavaScript errors

### A Generate tab control is missing

- The control's node is not found: check the markers (see [Node Markers](#node-markers)) and that the node type is
  listed in `node_config.json` (for sampler parameters, in `generation_params`)
- Inside a subgraph, the widget must be promoted to the marked subgraph node
- "Waiting for ComfyUI…" means the page did not answer: reload the ComfyUI page

### The LoRA list does nothing

- The positive prompt must be an **Image Bench Prompt** node marked `ib:pp`; a `CLIPTextEncode` receives the tags as
  text. Check the ComfyUI console for "LoRA ... is not found".
- If the node is missing from the node list, restart ComfyUI

### ControlNet

- "No ControlNet node is marked" — title the apply node `ib:cn:0`
- No preprocessor controls — install comfyui_controlnet_aux and restart ComfyUI
- No Use Mask — use an Advanced-ControlNet apply node with a mask loader linked to `mask_optional`

### Workflow modification doesn't work

- Check that the target nodes carry the right markers
- Check that the widget names in `node_config.json` match the node (DevTools: `app.graph.nodes`)
- Reload the page after editing `node_config.json`

## License

See repository root for license information.

## Credits

Part of the Image Bench project for Stable Diffusion image generation experimentation.
