## Encoder/VAE
- Text encoder: `Qwen3-VL-4B`
- VAE: `qwen_image_vae.safetensors`

## Recommended Defaults (Krea 2 Turbo)
    Steps:      8
    CFG:        1.0
    Sampler:    euler
    Scheduler:  simple
    Denoise:    1.0
    Resolution: 1024x1024 (up to 2048x2048)
    Negative:   empty / minimal


## Recommended Defaults (Krea 2 Raw)
    Steps:      ~52
    CFG:        3.5
    Sampler:    [?] not documented — try euler/simple as a starting point, verify
    Resolution: 1024x1024

# Variants

| variant | what it is                                          | license | picks |
|----|-----------------------------------------------------|----|----|
| Raw | undistilled base, full-step (52-step recipe)                        | Krea 2 Comm. License  | LoRA/finetune train, max diversity  |
| Turbo | TDM-distilled, 8-step                               | Krea 2 Comm. License | fast local gen  |
| FP8 scaled | community fp8 quant of both                         | inherits above | fits 24GB w/ margin |
| GGUF (Q3-Q8) | community llama.cpp-style quant                     | inherits above | 8-12GB cards |
| NVFP4/INT8/MXFP8 | community quants on HF (mxfp8, nvfp4, int8_convrot) | inherits above | untested here, \[?\] |

Notes:

- No official "lightning/hyper/schnell/dev/pro/lite" split — Krea only
  ships Raw and Turbo. There is a "Krea 2 Identity Edit" LoRA/adapter
  (`conradlocke/krea2-identity-edit`) and community inpaint/outpaint
  adapters (`krea2-outpaint`, `krea2-anypaint`) — these are add-on
  LoRAs/adapters, not separate base checkpoints .
- Turbo is **not** guidance-distilled in the FLUX-schnell sense of
  "baked-in CFG embed" — it's TDM (Trajectory Distribution Matching)
  trajectory-distilled, and is run at CFG≈1.0 (effectively off).

## Resolution

- Training: progressive curriculum 256px -\> 512px -\> 1024px
- Native*practical output: designed and marketed for up to 2048x2048
  (2K); ComfyUI workflow examples use "megapixels" target of 2.0 for 2K
  output
- Exact aspect-ratio bucket list: \[?\] not published; workflows use a
  target-megapixel
  - aspect-ratio input rather than a fixed bucket table (DiT-style
    flexible framing)
- Multiples requirement: \[?\] not explicitly documented; DiT/RoPE
  designs of this kind typically want multiples of 16 or 32 — verify
  before relying on it
- Hires-fix / two-pass: no official guidance found

## Parameters

| variant | steps | CFG         | sampler | scheduler | shift/mu       | neg prompt   |
|---------|-------|-------------|---------|-----------|----------------|--------------|
| Raw     | ~52   | 3.5 (true CFG)  | \[?\]   | \[?\]     | \[?\]          | \[?\]        |
| Turbo   | 8     | 1.0-ish, effectively disabled    | euler   | simple    | mu=1.15 (official interface example)        | minimal/none - model is disabled for it     |

- CFG on Turbo is the single most important trap: "Krea 2 Turbo is
  distilled for CFG ≈ 1.0 — higher values (7, 15) degrade output" per
  hands-on ComfyUI testing . This is analogous to
  FLUX-schnell/turbo guidance collapse — do not bring SDXL-style CFG 7
  habits over.
- clip skip: not applicable — this is a single VLM-based text encoder,
  not a CLIP stack with layer-skip conventions

## Prompting

- Natural language prose is the primary/intended mode — Krea explicitly
  moved away from comma-separated tag clouds toward long descriptive
  prose (composition, lighting, materiality), especially at 2K
  /
- Effective token budget: ~512 tokens reliable; 640+ produces
  black/corrupted output in reported ComfyUI testing  — this reads
  as a hard failure, not graceful truncation, so stay well under 512 for
  safety margin
- Attention weighting syntax `(word:1.2)`: \[?\] not documented/tested —
  Qwen3-VL is a VLM-derived encoder, not classic CLIP, so classic
  emphasis syntax is not guaranteed to parse the same way. Verify
  empirically before relying on it.
- Negative prompts: minimal/no effect reported on Turbo (distilled,
  low/no CFG) ; presumably more meaningful on Raw at CFG 3.5 but
  not explicitly confirmed \[?\]
- Quality/trigger tokens: none documented — no magic keyword list found
  \[?\]
- Text rendering: not specifically benchmarked in sources found;
  Qwen-Image (sibling model, shares VAE/encoder family) is noted
  elsewhere as the strong text-renderer of this generation, with Krea 2
  positioned instead around aesthetic/style control  — don't assume
  Krea 2 inherits Qwen-Image's text-rendering strength
- What it reliably ignores: \[?\] no confirmed data

Two example prompts (style, not verified output — construct per the
prose guidance above):

1.  "A wide-angle photograph of a rain-slicked city street at night,
    neon signage reflected in puddles, a lone figure under a translucent
    umbrella, shot on 35mm film with visible grain and soft chromatic
    aberration at the edges."
2.  "Editorial illustration, gouache texture, a ceramic teapot and
    citrus fruit on a linen tablecloth, warm afternoon light from
    camera-left, flat graphic shadows, muted earth-tone palette."

## Generation modes

| Mode               | Support                 |
|--------------------|-------------------------|
| txt2img            | native                  |
| img2img            | native                  |
| inpaint            | handled via community adapters |
| outpaint           | semi-reliable   |
| instruct-edit      | community "Krea 2 Identity Edit" LoRA |
| reference/identity | native — up to 4 style reference images or a moodboard <br/>each with an independent  strength slider   |

## ControlNet and Structural Control

Usable structural control exists but is thin and LoRA-based, not classic
ControlNet.

## Upscaling and High-Resolution Work

No reliable information found.

