
## Encoder/VAE
- Text encoder: `qwen_3_8b` (`qwen_3_4b` for the klein 4b)
- VAE: `flux2-vae.safetensors`

## Recommended Defaults (Klein 9b Turbo)

``` text
steps:           4
guidance_scale:  1.0   # no-op on distilled, harmless to leave at default
sampler:         euler
scheduler:       flow-match / normal
resolution:      1024x1024
negative_prompt: none (no-op on distilled variant)
max_sequence_length: 512
```

``` text
klein-9b-kv (multi-reference edit):
steps=4, no guidance_scale param exposed, pass 1-10 reference images
(community default workflows cap at 5)
```

## Recommended Defaults (Klein 9b Base)
``` text
steps:           20–30 (max 50)
guidance_scale:  3.5–5.0 (use 4.0)
sampler:         euler
scheduler:       simple
resolution:      1024x1024
negative_prompt: none (no-op on distilled variant)
max_sequence_length: 512
```

## Recommended Defaults (Klein 4b)

``` text
klein-4B / klein-9B (distilled, txt2img):
  steps=4, guidance_scale=1.0 (ignored anyway), sampler=euler,
  scheduler=normal/flow-match, negative prompt: don't bother, it's a no-op
  resolution=1024x1024

klein-base-4B / klein-base-9B (fine-tuning or when you need true CFG):
  steps=30-50, guidance_scale=4.0, sampler=euler,
  scheduler=normal/flow-match, negative prompt: "" or real negatives both work
  resolution=1024x1024
```

## Variants

| Variant       | What it is                      | License       | 
|---------------|---------------------------------|---------------|
| klein-4B      | 4-step timestep-distilled       | Apache 2.0    |
| klein-base-4B | Undistilled, ~50-step, for FT   | Apache 2.0    |
| klein-9B      | 4-step timestep-distilled       | FLUX Non-Comm |
| klein-base-9B | Undistilled, ~50-step, for FT   | FLUX Non-Comm |
| klein-9b-kv   | klein-9B + KV-cached ref images | FLUX Non-Comm |
| \*-fp8        | Official BFL+NVIDIA fp8 quant   | per base var  |
| \*-nvfp4      | Official BFL+NVIDIA nvfp4 quant | per base var  |
| \*-GGUF       | Community (unsloth, QuantStack) | per base var  |


## Resolution

| Item                    | Value                                    | 
|-------------------------|------------------------------------------|
| Demo/default resolution | 1024x1024                                | 
| Official bucket list    | Not published                            |
| Multiple-of requirement | Not stated; DiT+pixel-shuffle VAE likely <br> wants /16 or /32, unconfirmed            | 
| Native training res     | Unknown                                  | 

No official aspect-ratio bucket table exists yet for klein. Community
reports use standard SDXL-style buckets (1024x1024, 1152x896, 896x1152,
1216x832, 832x1216, 1344x768, 768x1344) successfully, but this is
inference by analogy, not confirmed by BFL \[?\]. Behavior off-spec
(duplication vs. mush at extreme AR): not documented, verify
empirically.


Notes:

- 9b-kv is specifically for **fast** multi-reference editing: caches K/V
  of the reference-image tokens on step 1 and reuses them on later steps
  instead of recomputing, cutting per-step cost when editing with a
  reference image.

## Prompting

- Style: natural language, not booru tags — Qwen3 is a text-only LLM
  encoder, it reads prose, not tag soup , consistent with FLUX.1's
  prompting style.
- Token budget: 512 tokens (max_sequence_length) ;
  behavior past that is truncation, not chunking (standard diffusers
  text-encoder behavior) .
- Weighting syntax (word:1.2): not natively supported by the pipeline
  API; would require a community prompt-weighting wrapper — no evidence
  one exists yet for klein specifically \[?\].
- Negative prompts: no-op on distilled variants, functional on base
  variants.
- Text rendering: BFL markets klein as strong at in-image text; specific
  benchmark numbers not found — treat as \[?\] until you test it.
- caption_upsample_temperature param exists (recommended
  0.15) for the \[dev\] Mistral pipeline to auto-expand short prompts
  — klein's pipeline signature does not expose this param, it's
  dev-only .

Two example prompts (untested by me, standard FLUX-style structure):

- "A weathered brass telescope on a ship's wooden railing at golden
  hour, ocean fog in the background, shallow depth of field,
  photorealistic"
- "Flat vector illustration of a fox reading a book under a lamp, warm
  color palette, clean line art, poster composition"

## Generation modes

| Mode                | Support                               |
|---------------------|---------------------------------------|
| txt2img             | Native, all variants                  |
| img2img             | Native (image param accepts input)    |
| Single-image edit   | Native, unified in same checkpoint    |
| Multi-reference gen | Native, up to ~10 refs (5 in default community workflows)                  |
| Inpaint             | Not a dedicated mode in the pipeline  |
| Outpaint            | Not documented                        |
| Instruct-edit       | Yes — prompt-driven single-image edit |
| Reference/identity  | Yes — the multi-reference mode itself |

No dedicated inpainting checkpoint found (unlike FLUX.1-Fill). Denoise
ranges for img2img/edit: not published by BFL; community reports
0.7–0.85 for reference-guided edits on one third-party doc \[?\] —
verify, that source also had the CFG-range inconsistency noted.

## ControlNet and Structural Control

Usable, but **barely** — coverage
is thin and community-only. No official BFL ControlNet for klein.

- Mechanism: classic separate ControlNet-style side-network,
  community-trained, not a BFL-shipped Union/ProMax model .
- Known publishers: individual Civitai/HF community authors; a
  depth+openpose ControlNet workflow for klein-9B surfaced ~May 2026,
  plus a separate lineart/depth/pose 3-in-1 ComfyUI workflow .
  Quality tier: unverified, early/experimental — do not expect
  FLUX.1/SDXL-tier ControlNet maturity.
- A LoRA-based reference/depth control exists (community: "refcontrol"
  klein-9B reference-depth LoRA) — LoRA-based control, not classic
  ControlNet .
- For \[dev\] (32B, different transformer, NOT usable on klein) there's
  a more mature Alibaba-PAI Union ControlNet
  (canny/hed/depth/pose/mlsd/scribble/gray) — do not attempt to load
  this on klein, wrong architecture .
- Strength/step-range recommendations, preprocessor versions, stacking
  behavior, VRAM-per-control-model: not documented anywhere found —
  \[?\] across the board.
- Given the 4-step distilled default, expect heavy over-conditioning at
  typical ControlNet strengths (0.6-1.0) built for 20-50-step models —
  no verified guidance exists, budget time to tune down
  strength/step-range yourself.

Bottom line: if structural control is a hard requirement today, FLUX.1
or SDXL still have far more mature ControlNet ecosystems than klein does
right now.