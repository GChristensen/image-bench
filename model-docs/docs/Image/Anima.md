
## Encoder/VAE
- Repos: HF [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima) · ComfyUI: same repo, `split_files/`
- Text encoder: `qwen_3_06b_base.safetensors`
- VAE: `qwen_image_vae.safetensors`

## Recommended Defaults (Anima-Base v1.0)
    steps           : 40
    cfg             : 4.5
    sampler         : er_sde
    scheduler       : normal
    shift           : unconfirmed
    resolution      : 1024x1024
    positive_prefix : masterpiece, best quality, score_7, safe,
    negative_prompt : worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration
    prompt_style    : tag/prose hybrid, [quality][count][character][series][@artist][tags]
    weighting       : (word:2) style — SDXL-habit (word:1.2) under-weights on this model

## Recommended Defaults (Turbo, official) :
    steps           : 10
    cfg             : 1.0
    sampler         : euler
    scheduler       : normal
    resolution      : 1024x1024
    negative_prompt : (optional, weak effect)

## Variants

| Variant   | Kind              | License    | Size     | Pick when                  |
|-----------|-------------------|------------|----------|----------------------------|
| Base v1.0 | foundation ckpt   | CC-Labs NC | unk\[?\] | flexibility, LoRA training |
| Aesthetic | curated fine-tune | CC-Labs NC | unk\[?\] | default look, less prompt  |
| Turbo     | distilled         | CC-Labs NC | unk\[?\] | speed, CFG-1, 8-12 steps   |
| Preview3  | dev snapshot      | CC-Labs NC | unk\[?\] | ControlNet-LLLite          |

## Resolution

- Officially supported range: 512x512 to 1536x1536 No official
  native/default resolution number or exact aspect-ratio bucket list was
  published in the sources.
- Above 1536px: community reports 2048x2048+ is reachable via a
  dedicated "Anima Highres LoRA" in Forge Neo rather than the base model
  alone.
- Hires-fix / two-pass: no official guidance found

## Parameters

| Setting | Base / Aesthetic           | Turbo |
|----|----------------------------|----|
| Steps | 30-50                      | 8-12  |
| CFG | 4-5, true CFG              | 1, distilled  |
| Sampler | er_sde (default)           | euler  |
| Sampler alt | euler_a, dpmpp_2m\_sde_gpu | \- |
| Scheduler | normal (assumed) \[?\]     | normal (assumed)\[?\] |
| Scheduler alt | beta57, for painterly look | \- |
| Shift | not documented \[?\]       | not documented \[?\] |
| Negative pr. | supported, useful          | weak/optional  |
| Clip skip | n/a (Qwen3 encoder)        | n/a  |


## Prompting

- Style: hybrid, tag-first with prose allowed . Structure per the
  official card:
  `[quality/meta/year/safety] [character count] [character] [series] [@artist] [general tags]`.
- Natural language works too — official guidance says mix tags and prose
  freely, and for "purity" of style use at least two full sentences
  describing the subject .
- Quality tags: two competing systems exist — human-scored
  (`masterpiece` … `worst  quality`) or aesthetic-model scored
  (`score_9` … `score_1`). Pick one system, don't mix them .
  Aesthetic variant: omit quality tags entirely, or use only
  "masterpiece, best quality," — avoid `score_*` tags on that variant
  .
- Artist tags: prefix with `@` (e.g. `@artistname`) — without the `@`
  the effect is weak .
- Tag formatting: lowercase, spaces not underscores .
- Two example prompts (Base recipe, tag/prose hybrid per official
  structure):
  1.  "masterpiece, best quality, score<sub>7</sub>, safe, 1girl, solo,
      @wlop, standing on a rain-soaked city street at night, neon
      reflections, holding a red umbrella, detailed folds in a long
      coat, looking back over shoulder"
  2.  "masterpiece, best quality, score<sub>7</sub>, safe, no humans,
      scenery, an old lighthouse on a cliff at dawn, dramatic clouds,
      painterly brushwork, wide shot, muted teal and orange palette"

## Generation modes

| Mode               | Support                 |
|--------------------|-------------------------|
| txt2img            | native             |
| img2img            | community workflow |
| inpaint            | community workflow |
| outpaint           | not documented     |
| instruct-edit      | community LoRA/IC  |
| reference/identity | not documented |

## Edit Modes

- Checkpoint: the base model (Anima Base v1.0) plus a community Edit LoRA trained on before/after
  pairs, e.g. Anima Edit v2.0 (Civitai). Edit quality depends mostly on the LoRA.
- Mechanism: Cosmos-Predict2 reference latent — the VAE latent of the input image conditions the
  generation; the Qwen3 text encoder does not see the image.

| Edit type              | Support    | Refs |
|------------------------|------------|------|
| Instruction edit       | Edit LoRA  | 1    |
| Attribute / color      | Edit LoRA  | 1    |
| Object removal         | Edit LoRA  | 1    |
| Outfit change          | Edit LoRA  | 1    |
| Expression change      | Edit LoRA  | 1    |
| Restyle (split screen) | workaround | 1    |

- References: one image.
- Prompt: quality tags, then the edits as short tag-like phrases, then the LoRA tag. No image
  index syntax.
- Output size: the size of the input image (e.g. 1024x1024), denoise 1.0.
- Settings: 30 steps, CFG 4, er_sde, simple, shift 3, Edit LoRA strength 1.0 (check the LoRA's
  card). Masks are not needed, but help when an edit is ignored.
- Forge Neo (2.27+): Settings › Stable Diffusion › [Anima] Enable Reference
  (`anima_do_reference`, worth adding to the Quicksettings), then generate from the img2img tab
  with the image as input; normal img2img is off while it is enabled. UI preset `anima`.
- Restyle workaround: join a solid-color canvas to the right of the image, mask it and add
  `(split screen, multiple views:1.2)`; it doubles the pixel count.
- Typical failures: large or structural changes do not happen, fingers and small prints break as
  in normal generation, photorealistic inputs edit poorly; reroll the seed before rewording.

Example edit prompts (append the edit LoRA, e.g. `<lora:AnimaEditV2:1>`):

```text
masterpiece, best quality, score_7, black hair, black eyes, <lora:AnimaEditV2:1>
masterpiece, best quality, score_7, delete her cat ears, <lora:AnimaEditV2:1>
masterpiece, best quality, score_7, t-shirt with a cat logo, <lora:AnimaEditV2:1>
masterpiece, best quality, score_7, smile, <lora:AnimaEditV2:1>
```

## ControlNet and Structural Control

Usable control exists, but it's thin and explicitly experimental — treat
this as "barely," not as a mature ControlNet ecosystem.

- Mechanism: ControlNet-LLLite, a lightweight LoRA-like
  local-conditioning module, ported to Anima's DiT by kohya-ss .
  This is **not** classic ControlNet, not ControlNet-Union, not a
  T2I-Adapter — it's the same LLLite design kohya previously shipped for
  SDXL, re-targeted at this architecture.
- Publisher: kohya-ss (`kohya-ss/Anima-LLLite`, node pack
  `kohya-ss/ComfyUI-Anima-LLLite`), plus at least one community mirror
  (Mooshie).