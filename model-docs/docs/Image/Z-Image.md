## Encoder/VAE
- Text encoder: `qwen_3_4b`
- VAE: `ae.safetensors`

## Recommended Defaults (Turbo):
    steps:           9
    cfg:             1.0 (KSampler CFG field; guidance itself is baked in / disabled)
    sampler:         res_multistep
    scheduler:       simple
    resolution:      1024x1024
    negative_prompt: (none — unused)

## Recommended Defaults (Base):
    steps:           40
    cfg:             4.0
    sampler:         euler
    scheduler:       normal
    resolution:      1024x1024
    negative_prompt: "blurry, low quality, distorted"

## Variants
| Variant               | What It Is             | License    | Steps | Pick When          |
|-----------------------|-------------------------|------------|-------|---------------------|
| Z-Image-Turbo         | DMD-distilled, no CFG   | Apache 2.0 | 8     | Default / speed     |
| Z-Image (Base)        | Non-distilled, CFG      | Apache 2.0 | 30-50 | Quality / LoRA base |
| Z-Image-Omni-Base [?] | Pretrain only, no SFT   | Apache 2.0 | 50    | Research / finetune |
| Z-Image-Edit [?]      | Instruct edit           | Unreleased | n/a   | Not out (08-2026)   |


## Resolution

- Native/default resolution: 1024x1024.

- Documented "1K tier" bucket set, all divisible by 64:

      1024x1024 (1:1)   1152x896 (9:7)   896x1152 (7:9)
      1152x864 (4:3)    864x1152 (3:4)   1248x832 (3:2)
      832x1248 (2:3)    1280x720 (16:9)  720x1280 (9:16)
      1344x576 (21:9)   576x1344 (9:21)

- A "2K tier" (e.g. 2048x2048, 2048x1152) is also referenced by
  community sources \[?\] — unconfirmed whether this is officially
  trained-for or just works acceptably.

- Alignment requirement: multiples of 64  (stricter than the usual
  /8; going off-grid risks border artifacts).

## Parameters

| Setting | Turbo                         | Base |
|----|-------------------------------|----|
| Steps | 8-9 (9 steps = 8 DiT forwards) | 30-50 |
| Guidance/CFG | 0.0 — distilled, no true CFG  | 3-5, true CFG |
| Sampler | res_multistep           | not documented, try euler \[?\] |
| Scheduler | simple                        | not documented \[?\] |
| Shift | not documented / default \[?\] | not documented \[?\] |
| Negative prompt | not supported                 | supported  |
| Clip skip | n/a (Qwen3 encoder, no CLIP)  | n/a |

## Prompting

- Style: natural language, not booru tags — Qwen3-4B is an LLM-derived
  encoder and responds to descriptive sentences, not tag soup .
- Token budget: effective limit ~1536 on the encoder's axis-0 ;
  behavior past that is unconfirmed (truncation vs. degraded attention
  due to the low rope<sub>theta</sub>) \[?\].
- Weighting syntax \`(word:1.2)\`: not confirmed supported — Qwen3 is
  not a CLIP encoder and most UIs' weighting syntax targets CLIP-style
  tokenizers; treat as unsupported until verified in your UI \[?\].
- Negative prompts: Turbo — no effect (guidance removed by distillation)
  . Base — functional, true CFG .
- Bilingual: renders English and Chinese text reliably; this is a stated
  strength .
- Conflicting style instructions in one prompt (e.g. "photorealistic" +
  "anime") produce uncanny-valley blending rather than picking one
  .
- Two example prompts:
  1.  "A photorealistic close-up portrait of an elderly fisherman
      mending a net on a wooden dock at golden hour, weathered skin,
      soft rim light, shallow depth of field"
  2.  "Flat vector poster design, bold sans-serif text reading 'OPEN
      LATE', warm orange and teal palette, retro diner illustration, no
      gradients"

## Generation Modes

| Mode               | Support              |
|--------------------|----------------------|
| txt2img            | native          |
| img2img            | native          |
| inpaint            | community hack  |
| outpaint           | community hack  |
| instruct-edit      | not supported \[?\]  |
| reference/identity | not supported   |

- img2img: denoise 0.4-0.7 .
- inpaint: no dedicated inpaint checkpoint exists; use a Differential
  Diffusion node, denoise 0.6-0.8 .
- outpaint: community workflow via crop+stitch, reusing the img2img
  mechanism .
- instruct-edit: unsupported because Z-Image-Edit is unreleased as of
  2026-08-19 \[?\].
- reference/identity: no official IP-Adapter exists; LoRA training is
  the identity- transfer route instead (sec. 12) .

Inpainting caveat: because there's no inpaint-trained checkpoint, high
denoise (0.9+) breaks coherence at mask edges — the model wasn't trained
to understand masked context at high noise, unlike SDXL-inpainting or
FLUX-Fill . Fine detail (hair, skin texture) at mask boundaries is
a known weak point .

## ControlNet and Structural Control

Usable ControlNets exist, but coverage is narrow — one union model, not
a spread of single-purpose community nets like SDXL has.

- Publisher: Alibaba PAI
  (`alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union`, also a "-2.1"
  revision) .
- Mechanism: ControlNet-Union style — one model, multiple conditions via
  a selector, added on 6 blocks, trained from scratch .
- Control types: Canny, HED, Depth, Pose, MLSD . Also supports an
  inpainting mode .
- Quality tier: single official-adjacent source (PAI, Alibaba-internal
  team, not Tongyi- MAI itself) — treat as the only credible option, no
  competing implementations found .
- Strength: controlcontext_scale 0.65-0.80 is the documented
  sweet spot; higher values over-condition (rigid, loses the Turbo
  model's texture quality) .
- Training res: 1328px, bf16, batch 64, lr 2e-5, text-dropout 0.10 —
  informative for judging why quality may dip off that resolution, not
  settings you set at inference .
- Preprocessor/annotator versions: not documented by PAI; assume
  standard ControlNet-aux nodes (canny/HED/depth-anything/DWPose) work
  but verify per node pack \[?\].
- Stacking multiple conditions simultaneously: not documented either way
  \[?\].
- VRAM cost per loaded control model: not documented \[?\] — budget
  ~2-3GB extra based on typical DiT ControlNet-union sizes, unverified
  \[?\].
- Loading a Flux ControlNet against Z-Image, or vice versa: will not
  work — different backbone despite the shared VAE.

## Quirks and failure modes

- Anatomy: hands, extra fingers/limbs, and messy/asymmetrical pupils are
  reported more common on Turbo than on comparable models; negative
  prompts help but Turbo doesn't support them, so this is largely
  unmitigated on Turbo specifically . Base (with working negative
  prompts) should be less affected but unverified \[?\].
- Prompt-detail tradeoff: above ~0.55 img2img denoise with heavily
  descriptive prompts, the model prioritizes mood/atmosphere over
  anatomical correctness — hands and any embedded text are the first
  things to degrade.
- CFG misuse: setting CFG meaningfully above 1.0 on Turbo (treating it
  like a normal guidance-scale model) introduces artifacts — this is the
  single most common "why does my output look broken" misconfiguration
  reported.
- Text-encoder mismatch: swapping in a CLIP or other non-Qwen3 encoder
  silently breaks prompt comprehension rather than erroring — an easy
  trap when reusing workflow templates from other DiT models.
- Missing text-encoder download: a commonly reported first-run failure —
  users load the diffusion model and VAE but forget the separate
  Qwen3-4B download.
- Style conflicts: mixed style instructions in one prompt (e.g.
  photorealistic + anime) blend into uncanny-valley output rather than
  the model picking one.
- SageAttention 3 specifically reported to corrupt output on this model
  in at least one open GitHub issue — treat attention-backend swaps as
  something to A/B test, not assume safe.
