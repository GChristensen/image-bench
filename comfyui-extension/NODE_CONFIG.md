# node_config.json

Accepted node types, widget names and parameter locations of Image Bench are configured in `node_config.json` in the
extension directory (served as `/image-bench/node_config.json`). The file is read when the ComfyUI page loads, so
**reload the page** after editing it. Support for custom nodes is added there, not in code.

## Your own additions

Updates of the extension replace `node_config.json`. Put your additions into `store/node_config.json` in the
extension directory instead, which updates keep: it is merged over the shipped file, so it holds only what changes.

- Objects are merged key by key, recursively.
- Other values (strings, numbers) of your file replace the shipped ones.
- Lists take your items first, then the shipped items that are not among them. An added node type needs only that
  type; a parameter locator of yours is tried before the shipped ones.

For example, a custom checkpoint loader:

```json
{
  "checkpoint": {
    "nodeTypes": ["MyCustomLoader"],
    "widgetNames": {"MyCustomLoader": "model_name"}
  }
}
```

The examples below show the shipped file; the same sections work in `store/node_config.json`.

## Marker roles

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

## ControlNet

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

## Generation parameter locators

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
| `widget` | The widget holding the value; a parameter whose locators have no widget is an **anchor**, only the start of others (`from`) |
| `role` | Start node: `sampler` (`ib:smp`, default) or `hiresSampler` (`ib:smp:1`) |
| `from` | Start at the node located for another parameter or anchor instead of a sampler |
| `values` | Choice labels of the Generate tab mapped to widget values, e.g. `{"Inpaint masked": false, "Inpaint not masked": true}`; the labels are also the choices offered |
| `via` | Input names followed one after another from the start node; without `via` the widget is on the start node itself |
| `types` | Accepted node types of the node reached; any type if absent |
| `deep` | If the node reached is not of `types`, keep walking upstream: `true` through any input, an input name through inputs of that name only (e.g. `"model"` walks the model chain through LoRA loaders). The nearest matching node wins; deep walks never pass another sampler. |

Parameters: `seed`, `steps`, `cfg`, `sampler`, `scheduler`, `denoise`, `guidance` (shown as Distilled CFG), `shift`
(shown when there is no `guidance`), `width`, `height`, `hiresSteps`, `hiresDenoise`, `hiresScale`, `hiresUpscaler`,
and the inpaint parameters `maskBlur`, `maskMode`, `inpaintArea`, `inpaintPadding`.
They are also used by batch generation, parameter sweeps and model exploration, and to read the parameters of finished
images from `/history`. Keys starting with `_` are comments.

The inpaint parameters start at the anchor `inpaintCrop`, the Inpaint Crop node
([ComfyUI-Inpaint-CropAndStitch](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch)) upstream of the sampler's
latent. The bundled inpaint workflows feed its `optional_context_mask` from a `GrowMask` (Only masked padding) and a
`SolidMask` (Inpaint area: value 0 Only masked, 1 Whole picture); the size of the Generate tab is its target size:

```json
"inpaintCrop": [{"via": ["latent_image"], "deep": true, "types": ["InpaintCropImproved"]}],
"maskMode": [{"from": "inpaintCrop", "widget": "mask_invert",
              "values": {"Inpaint masked": false, "Inpaint not masked": true}}],
"inpaintPadding": [{"from": "inpaintCrop", "via": ["optional_context_mask"], "deep": true, "types": ["GrowMask"],
                    "widget": "expand"}]
```

Example: a custom noise node `MyNoise` with a `seed` widget feeding `SamplerCustomAdvanced`:

```json
"seed": [
  {"widget": "seed"},
  {"widget": "noise_seed"},
  {"via": ["noise"], "types": ["RandomNoise"], "widget": "noise_seed"},
  {"via": ["noise"], "types": ["MyNoise"], "widget": "seed"}
]
```
