
## Encoder/VAE
- Text encoder: `Mistral-Small-3.2-24B-Instruct`
- VAE: `flux2-vae.safetensors`

## Recommended Defaults

``` text
steps:               28          (50 is pipeline default; 28 is BFL's stated good tradeoff)
guidance_scale:      2.5-4.0     (embedded guidance, not true CFG)
resolution:          1024x1024
scheduler:           FlowMatchEulerDiscreteScheduler (ComfyUI: native Flux2 nodes)
negative_prompt:     none (not supported on dev)
max_sequence_length: 512
```

## Resolution

- Default/best-tested: 1024x1024.
- Stated ceiling: image editing supported "up to 4MP".
- Per-side range roughly 256-1440px [?], aspect ratio range claimed 1:1 to 21:9 [?] — both from secondary sources, verify before relying on extreme ratios.
- Divisibility: no official statement; multiples of 16px is the safe community default (2x2 patchify over the VAE's spatial downsample), same convention as FLUX.1.
- Expect the usual flow-matching failure modes (composition collapse/duplication) far off native res, by analogy with FLUX.1 — not confirmed for FLUX.2 specifically [?].

## Prompting

- Style: natural language/descriptive prose, not booru tags — the encoder is an instruction-tuned 24B VLM, not a CLIP/T5 pairing [?].
- Token budget: 512 tokens (`max_sequence_length`); behavior past that is undocumented, assume truncation.
- Caption upsampling: set `caption_upsample_temperature` (BFL recommends 0.15) to have the model expand a terse prompt before encoding.
- Weighting syntax `(word:1.2)`: not documented, architecturally unlikely to be respected the way CLIP-based weighting is, since conditioning comes from an autoregressive LLM's hidden states [?].
- Negative prompts: not usable on dev at all. Usable on klein-base only.
- Text rendering: explicitly marketed strength — strong control over layout, logos, and typography.

Two example prompts:
1. "A weathered leather-bound notebook lying open on a rain-speckled café table, soft overcast daylight from a window on the left, shallow depth of field, the page reads 'August 19' in handwritten ink."
2. "Studio product photo of a matte black ceramic mug on a marble surface, three-point softbox lighting, subtle rim light, logo on the mug reads 'ATELIER', 45-degree angle, commercial photography style."

## Generation Modes

| Mode | Support |
|----|----|
| txt2img | native |
| img2img / reference editing | native, central to the model — single/multi-reference editing via the `image` argument; up to 10 reference images for dev, 4 for klein-9B-kv |
| inpaint | no dedicated checkpoint/pipeline parameter found [?] |
| outpaint | not documented [?] |
| instruct-edit | yes — this is the model's edit mode: natural-language instruction + reference image(s) in one forward pass |
| reference/identity | native multi-reference conditioning |

## ControlNet and Structural Control

Thin and early — a ~3-month-old architecture whose ecosystem hasn't caught up to FLUX.1's maturity.

- `alibaba-pai/FLUX.2-dev-Fun-Controlnet-Union` confirmed to exist: canny/hed/depth/pose/mlsd/scribble/gray, Union-style. Quality/reliability tier unverified — no independent benchmark or wide community consensus [?].

## Upscaling and High-Resolution Work

FLUX.2-specific guidance is sparse; most of this is carried over from general FLUX/flow-matching practice, not confirmed against FLUX.2 [?].

- Native ceiling: editing works "up to 4MP"; behavior generating natively far past that isn't documented.
- Two-pass hires-fix: no FLUX.2-specific values found. Starting point by analogy with FLUX.1: ~1.5x latent upscale, second-pass denoise 0.3-0.5, same steps/guidance as base pass — verify empirically.

