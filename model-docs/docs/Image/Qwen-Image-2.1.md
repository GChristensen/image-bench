## Encoder/VAE
- Text encoder: `qwen3vl_8b_int8_convrot.safetensors` (bf16: `qwen3vl_8b_bf16.safetensors`)
  - ComfyUI: `CLIPLoader`, type = `qwen_image`
- VAE: `qwen_image_2.1_vae_bf16.safetensors` (64-ch, 16×, RGBA)
- Diffusion model: `qwen_image_2.1_int8_convrot.safetensors` (bf16: `qwen_image_2.1_bf16.safetensors`)
- Source: `Comfy-Org/Qwen-Image-2.1`
- Nothing from Qwen-Image 1.x / 2512 / Edit-2511 is reusable (different DiT, encoder and VAE)

## Recommended Defaults (Base, ComfyUI)

``` text
steps:           25 (40 for finals)
cfg:             1.0   # true CFG is OFF; never leave KSampler default of 8
sampler:         euler
scheduler:       simple
resolution:      1248x832 drafts / 2048x2048 finals
negative_prompt: none (ignored at cfg 1.0)
denoise:         1.0
```

## Recommended Defaults (Base, diffusers)

``` text
pipeline:        QwenImage21Pipeline
steps:           40
true_cfg_scale:  1.0   # >1 needs a negative prompt and doubles compute
scheduler:       pipeline default (flow-match, dynamic shift)
resolution:      2048x2048
negative_prompt: none
offload:         enable_model_cpu_offload() on 24 GB with bf16
```

## Recommended Defaults (Viggle Turbo v0.2.1)

``` text
lora:            Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors
lora_strength:   1.0   # load via "Viggle Turbo LoRA (unmerged)" node, not stock loader
steps:           6
sigmas:          1.0, 0.9375, 0.875, 0.75, 0.5, 0.25   # "Viggle Turbo Sigmas" node
cfg:             1.0   # BasicGuider, no CFG
sampler:         euler
negative_prompt: none
resolution:      1024x1024 (2K not validated)
```

## Recommended Defaults (GGUF)

``` text
loader:          Unet Loader (GGUF), leejet/ComfyUI-GGUF fork
quant:           Q8_0 on 24 GB, Q4_K_M on 12–16 GB
everything else: same as Base, ComfyUI
```

## Variants

| Variant              | What it is                   | License       |
|----------------------|------------------------------|---------------|
| base bf16            | Full precision, 7B DiT       | Qwen Research |
| base int8_convrot    | Comfy-Org quant, 7.3 GB      | Qwen Research |
| Unsloth int8 / FP8   | Quant for diffusers          | Qwen Research |
| \*-GGUF              | Community quants             | Qwen Research |
| viggle-turbo v0.2.1  | 6-step DMD distill LoRA      | Qwen Research |
| Fun-Controlnet-Union | ControlNet branch, 7.0 GB    | Qwen Research |
| PE-T2I / PE-I2I      | Prompt rewriter LLMs (9B)    | \[?\]         |

Qwen Research License = non-commercial only.

## Resolution

| Ratio | Native 2K   | ~1 MP draft |
|-------|-------------|-------------|
| 1:1   | 2048x2048   | 1024x1024   |
| 4:3   | 2400x1792   | 1152x864    |
| 3:4   | 1792x2400   | 864x1152    |
| 3:2   | 2528x1696   | 1248x832    |
| 2:3   | 1696x2528   | 832x1248    |
| 16:9  | 2752x1536   | 1536x864    |
| 9:16  | 1536x2752   | 864x1536    |

- Multiple of 32.
- Practical min ~1024² area; above the 2K presets untested \[?\].
- ComfyUI Resolution Selector: 4.0 MP ≈ 2048², 1.0 MP ≈ 1024².
- Edit output follows the **first** reference's aspect ratio in ComfyUI (last in diffusers).

Notes:

- On RTX 3090 + 32 GB RAM use the int8 pair (~17 GB). The bf16 pair (~31.7 GB) will thrash RAM.
- FP8 gives no speedup on Ampere (memory only); int8 is the better format for a 3090.
- Prefix KV cache is on by default. Same seed with cache on/off gives different images.
- Old city96 GGUF loader fails with "Unknown model architecture!" — use the leejet fork.
- Old Qwen-Image Lightning LoRAs do not work on 2.1.

## Prompting

- Style: long natural-language descriptions, not booru tags.
- Structure: subject → action/pose → setting → lighting/camera → style → literal text in "quotes".
- Optional prompt enhancer: PE-T2I / PE-I2I via `TextGenerate` node (needs NVIDIA driver ≥ 580).
- Token budget: no documented cap; truncation behavior unknown \[?\].
- Weighting syntax (word:1.2): unreliable with an LLM encoder \[?\].
- Negative prompts: no-op at cfg 1.0.
- Text rendering: strong — posters, infographics, dense small text.
- Transparency (RGBA): wrap the prompt as
  "This is an RGBA image with transparency. <description>. The image has alpha channel and the
  background is transparent."
- Edit prompts address references as `<image1>`, `<image2>`, … in slot order.

Two example prompts:

- "Clean flat vector infographic titled "FROM CHERRY TO CUP" showing five numbered steps left to
  right, each with an icon and a one-word label: 1 Harvest, 2 Process, 3 Roast, 4 Grind, 5 Brew.
  Earthy palette, generous white space, all labels crisp and legible."
- "Street portrait on a brownstone stoop at golden hour. A man in denim-on-denim sits on the
  steps, elbows on knees, gold rings catching the light. Warm brick background softly out of
  focus. Shot on 85mm at f/1.8, natural skin texture."

## Generation modes

| Mode               | Support                            |
|--------------------|------------------------------------|
| txt2img            | Native                             |
| txt2img RGBA       | Native                             |
| img2img            | Via denoise < 1 \[?\]              |
| Inpaint            | Native (mask / circle + prompt)    |
| Outpaint           | Via edit instruction \[?\]         |
| Instruct-edit      | Native, same checkpoint            |
| Multi-reference    | Native, up to 10 refs              |
| Reference/identity | Native (people / products)         |
| Background removal | Native (edit template)             |

- No dedicated inpaint checkpoint; Fun-Controlnet-Union has an inpaint mode.
- Reference limits differ by frontend: Qwen 10, ComfyUI node 16 slots, vLLM 4, turbo LoRA ≤3.
- img2img denoise not published; start at 0.2–0.35 for refinement, 0.35–0.6 for restyle \[?\].
  For "change X" tasks use instruct-edit instead.
- Background removal prompt: "Remove the background, and output a PNG image".

## ControlNet and Structural Control

One ControlNet exists, and today it runs **outside** ComfyUI only.

- Model: `alibaba-pai/Qwen-Image-2.1-Fun-Controlnet-Union` (~7.0 GB, control branch only).
- Mechanism: ControlNet-Union side branch (16 control blocks on every 2nd DiT block).
- Conditions: canny, depth, grayscale, HED, lineart, MLSD, pose (DWPose), scribble + inpaint.
- Not available: tile, normal, segmentation.
- Runtime: VideoX-Fun scripts; config must be `config/qwenimage21/qwenimage21_control.yaml`
  or control weights are silently dropped.
- ComfyUI support: requested (issue #16518), not merged.
- Strength: `control_context_scale` 1.0 (expected); lower loosens, 0.0 disables.
- Control map must match the output canvas, sides multiples of 16.
- On a 3090 expect CPU offload (+7 GB on top of DiT + encoder) \[?\].
- Stacking, step ranges, turbo interaction: undocumented \[?\].
- Old Qwen-Image ControlNets (InstantX, DiffSynth) do not load — wrong architecture.

Bottom line: inside ComfyUI today, the only structural workaround is passing a pose/depth image
as a reference ("follow the pose in `<image1>`") \[?\]. If ControlNet is a hard requirement,
Qwen-Image-2512, FLUX.1 or SDXL have far more mature ecosystems.
