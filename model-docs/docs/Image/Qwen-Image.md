## Encoder/VAE
- Text encoder: `Qwen2.5-VL-7B`
- VAE: `qwen_image_vae.safetensors`

## Recommended Defaults (Qwen-Image-2512)

``` text
LoRA:            Qwen-Image-Lightning-8steps (strength 1.0)
Resolution:      1328x1328  (or nearest bucket below for your aspect ratio)
Steps:           8 (50 for base)
Sampler:         Euler
Scheduler:       FlowMatch, dynamic shifting, shift ~0.3-3 (use packaged workflow value)
CFG:             true_cfg_scale = 1.0 (4.0 for base)
Negative prompt: "" (unused at cfg=1.0)
Offload:         sequential CPU offload on the text encoder if VRAM is tight
```

## Variants

| Variant | Type | License | Size (approx) |
|----|----|----|----|
| Qwen-Image-2512 | t2i, realism update — pick over base for realism-leaning work | Apache 2.0 | ~41GB bf16 |
| Qwen-Image-Edit-2509 | edit, adds 1-3 image multi-reference blending | Apache 2.0 | ~41GB bf16 |
| Qwen-Image-Edit-2511 | edit, further quality pass over -2509 — pick unless you need -2509 behavior specifically | Apache 2.0 | ~41GB bf16 |
| Lightning 4/8-step | distill LoRA (ModelTC/lightx2v), cuts 40-50 steps to 4 or 8 | Apache 2.0 | 0.1-0.8GB |
| fp8_e4m3fn / fp8_scaled | post-quant DiT, near-bf16 quality — pick first on 16-24GB | Apache 2.0 | ~20-22GB |
| GGUF Q2_K .. Q8_0 | llama.cpp-style quant (city96/QuantStack) — Q4_K_M-Q6_K on 12-16GB, Q8_0 for closer-to-bf16 | Apache 2.0 | 7-22GB |
| Nunchaku int4/nvfp4 | SVDQuant 4-bit, needs the `nunchaku` runtime; fastest on compatible GPUs (compute cap ≥7.5) | Apache 2.0 | ~6-10GB |

Edit checkpoints are for instruction-based editing, not fresh t2i generation. A Lightning LoRA matches its base checkpoint (t2i or edit each have their own).

## Resolution

Official supported aspect-ratio buckets:

| Ratio | Pixels | Ratio | Pixels |
|-------|-----------|-------|-----------|
| 1:1 | 1328x1328 | 3:2 | 1584x1056 |
| 16:9 | 1664x928 | 2:3 | 1056x1584 |
| 9:16 | 928x1664 | 4:3 | 1472x1140 |
| 3:4 | 1140x1472 | | |

A secondary source lists 4:3/3:4 as 1472x1104 / 1104x1472 instead — the two disagree by ~36px [?], verify against the exact repo README before a production batch.

The diffusers default is 1024x1024 and works but is not one of the trained buckets. Requirement for multiples of 8/16/32/64 is not stated explicitly [?]. Composition collapse/duplication past roughly 1.5x the native bucket area is the generic MMDiT failure mode, not confirmed with Qwen-Image-specific test data.

## Parameters

| Variant | Steps | CFG kind | Value | Sampler/Sched |
|----|----|----|----|----|
| Base / 2512 | 50 | true_cfg_scale | 4.0 | Euler FlowMatch |
| Edit / -2509/2511 | 40 | true_cfg_scale | 4.0 | Euler FlowMatch |
| Lightning 8-step | 8 | true_cfg_scale | 1.0 | Euler FlowMatch |
| Lightning 4-step | 4 | true_cfg_scale | 1.0 | Euler FlowMatch |

- CFG is real classifier-free guidance (`true_cfg_scale`), NOT embedded/distilled guidance, for base/2512/Edit. The pipeline's `guidance_scale` argument is a documented **no-op** on this family — passing it does nothing; you must set `true_cfg_scale > 1` and supply a `negative_prompt` (even `" "` works) to get CFG at all. This is the single most common source of "why does my output ignore the negative prompt" reports.
- Negative prompt is supported and functional under true CFG; officially recommended as empty string when nothing specific to exclude.
- Sigma/timestep shift: scheduler default `shift=1.0` with `use_dynamic_shifting=True`, `base_shift=ln(3)`. Lightning LoRA workflows commonly override shift into the 0.3-3 range — treat the packaged Lightning workflow JSON as the source of truth over any generic default.

Known-good recipes:
- **Base/2512, quality**: 1328x1328, 50 steps, Euler, FlowMatch scheduler, `true_cfg_scale` 4.0, negative_prompt="", seed fixed for comparison runs.
- **Edit-2511**: same image resolution as source, 40 steps, `true_cfg_scale` 4.0, one to three reference images.
- **Lightning 8-step**: LoRA strength 1.0, 8 steps, `true_cfg_scale` 1.0, sigma shift 0.3-3 (use the packaged workflow's value).

## Prompting

- Style: natural language works well — the encoder is an LLM (Qwen2.5-VL), parsing full sentences/instructions, not just tag soup. Danbooru-style comma tags also work reasonably (some tagged data is in the training mix), but plain English description is the more reliable default.
- Token budget: 512 tokens; behavior past the limit not confirmed, assume truncation.
- Weighting syntax `(word:1.2)`-style emphasis is partially respected but needs stronger weights than SDXL-era habits, e.g. `(chibi:2)` rather than `(chibi:1.2)` — treat as unreliable/soft rather than a hard multiplier.
- Official "positive magic" quality suffixes (appended, not prepended): English `", Ultra HD, 4K, cinematic composition."`.
- Text rendering is the model's headline strength — legible multi-language (especially EN/CN) text in-image, including layout-aware text like posters/UI mockups. Degrades with very long strings or many separate text blocks.

Two example prompts:
- "A red ceramic mug on a wooden table next to a window, morning light, sign on the wall behind it reading 'OPEN', photorealistic, Ultra HD, 4K, cinematic composition."
- "Minimalist poster design, bold black title text 'FUTURE FESTIVAL' centered at top, small subtitle below reading '2026 · ALL WELCOME', abstract geometric shapes in orange and teal, flat vector style."

## Generation Modes

| Mode | Support |
|----|----|
| txt2img | native (`QwenImagePipeline`) |
| img2img | native (`QwenImageImg2ImgPipeline`), `strength` 0-1, 1.0 essentially discards the input image. Practical range for meaningful-but-guided variation: 0.4-0.7 |
| inpaint | native (`QwenImageInpaintPipeline`) plus the dedicated `InstantX/Qwen-Image-ControlNet-Inpainting` checkpoint for stronger mask adherence. Denoise 0.7-1.0 for full repaint of the masked region |
| outpaint | via the same ControlNet-Inpainting checkpoint, extend canvas + mask the new area |
| instruct-edit | native — the Edit / -2509 / -2511 checkpoints take an instruction plus reference image(s) directly, no extra weights needed |
| reference/identity | multi-image blending (1-3 refs) native to Edit-2509/2511 for person/product/scene composition. No dedicated standalone IP-Adapter-style weight file confirmed [?] |

## ControlNet and Structural Control

Usable ControlNets exist and are reasonably solid for the core types — not "barely supported."

Mechanism: transformer-block-copy conditioning (extra double-blocks copied from the pretrained DiT and trained from scratch), the Flux-ControlNet style — not classic UNet ControlNet, not T2I-Adapter.

- Canny, Soft Edge, Depth, Pose bundled in one union model, `InstantX/Qwen-Image-ControlNet-Union` (trained 50K steps, 1328x1328, bf16, batch 64).
- Inpaint/outpaint: `InstantX/Qwen-Image-ControlNet-Inpainting`, separate checkpoint, 65K steps, batch 128.
- A second official-ish union net exists for the 2512 line, `alibaba-pai/Qwen-Image-2512-Fun-Controlnet-Union` — not deeply verified [?].
- No tile ControlNet found — use Ultimate SD Upscale tiling instead.
- Preprocessors: Canny via OpenCV `cv2.Canny`, Soft Edge via AnylineDetector, Depth via Depth-Anything, Pose via DWPose.
- Strength/scale: Canny 0.8-1.0, Inpaint 0.9-0.95; other types not explicitly numbered — treat 0.8-1.0 as the working range and back off if you see rigid/artifact-y output.
- The Union model handles multiple control types from one loaded weight file. Interaction with Lightning's low step counts is untested — expect weaker adherence at 4-8 steps since ControlNet conditioning has fewer denoising steps to act on.
- Whether a base-model ControlNet loads correctly onto an Edit checkpoint (different dual VL+VAE conditioning path) is unconfirmed [?] — don't assume interchangeability without testing.

## Regional and Compositional Prompting

Working method: **EliGen** (DiffSynth-Studio) — entity-level regional attention control via arbitrary-shaped region masks + LoRA, built specifically for DiT-family models including Qwen-Image. No confirmation found of classic Forge Couple/Attention Couple/latent-couple working out of the box on Qwen-Image.

Generic SD regional tools are iffy here: they were largely built around CLIP's pooled-embedding structure, and Qwen-Image's single Qwen2.5-VL LLM encoder has a different embedding shape with no CLIP pooled vector to hook into — expect to need Qwen-Image-specific implementations (EliGen) rather than generic nodes. EliGen-style regional attention presumably needs true CFG to have a control signal to steer, so expect it to weaken on Lightning-distilled (CFG≈1) variants [?]. A more reliable fallback is inpaint-then-composite, or an Edit-2509/2511 multi-image pass, over forcing generic regional-prompting nodes onto this encoder.

## Upscaling and High-Resolution Work

Officially trained/tested only at the bucket resolutions above (~1.3-1.7MP). Community reports of single-pass generation up to ~60MP and edit up to ~17MP exist via a community tiling repo, not a native model capability claim — don't expect coherent single-pass output far past the trained buckets without such tooling [?].

- Hires-fix two-pass: latent upscale 1.3-1.5x, second pass denoise 0.3-0.5, same sampler/scheduler as base, steps can drop to ~60-70% of the first pass (generic pattern, not Qwen-Image-specific confirmed numbers) [?].
- Ultimate SD Upscale and tiled VAE decode work generically with the Qwen-Image nodes; no dedicated tile ControlNet exists, so expect visible seams on aggressive tiling without one.
- Standard ESRGAN-family upscalers (4x-UltraSharp, Remacri) work fine in pixel space pre- or post-diffusion refinement. No dedicated official refiner checkpoint exists for this family (unlike SDXL base+refiner) — an Edit checkpoint can serve as a self-refiner via img2img on its own output.
- Use `enable_vae_tiling()` / `enable_vae_slicing()` for VAE decode cost at high resolution.
- Suggested pipeline: base/2512 generate at native bucket → latent hires-fix pass (denoise ~0.35) → optional ESRGAN pixel-space upscale → tiled VAE decode if resolution is large.

## Quirks and Failure Modes

- Text garbling with long/many strings: blurry or mixed-up characters when rendering many separate text blocks or long strings in one image (open upstream issue).
- Periodic high-frequency grid artifacts at roughly the VAE patch-size period, more visible toward image center (open upstream issue).
- CFG sweet spot for text-heavy prompts: roughly 4.5-7; too high literalizes/distorts shapes and forces awkward glyphs, too low produces vague/incorrect text.
- The `guidance_scale` no-op trap: passing `guidance_scale` instead of `true_cfg_scale` silently does nothing — a common "why is my negative prompt ignored" misconfiguration.
- Lightning + true CFG left on: running a distilled checkpoint with CFG still enabled double-applies guidance and degrades output.
- Low GGUF quants on Edit variants: visible artifacts reported at Q2/Q4 specifically for Edit-2509 — prefer Q6_K+ for editing work if quality matters.
- Missing mmproj on GGUF text encoder: img2img/edit silently fails to use the image properly if the GGUF Qwen2.5-VL encoder's mmproj file isn't also downloaded and selected.
