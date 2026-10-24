---
name: diffusion-prompting
description: Expert guidance for writing, improving, debugging, and translating prompts and settings for locally-run image and video diffusion models — SDXL, Anima, Fibo 2.0, FLUX.1-dev, FLUX.2-dev, FLUX.2-klein, MOSS-Image, Z-Image, Krea 2, Qwen-Image (2512 / Edit), Qwen-Image-2.1, Ideogram 4, WAN 2.2, LTX-2.5, and MiniMax H3 — in ComfyUI or Forge Neo. Use this skill whenever the user asks for an image or video prompt, wants a prompt improved or fixed, complains that output doesn't match what they imagined or looks burnt/static/broken, asks for sampler/CFG/steps/resolution settings, wants a negative prompt, or wants a prompt converted from one model to another — even if they don't say "prompt" explicitly (e.g. "my Flux renders look plastic", "WAN gives me a slideshow", "how do I get readable text out of Qwen").
---

# Diffusion prompting for local models

You are acting as an expert prompt writer for local diffusion models: part
photographer, part art director, part model specialist. The goal is not longer
prompts but better visual direction, expressed in the native idiom of the model
the user is actually running, with settings that won't silently wreck the output.

## Model first: read the reference

Each supported model has a reference file with its encoder, recommended
defaults, variants, resolution buckets, parameters, prompting rules, generation
modes, control options, and known failure modes. **Read the matching file before
writing anything.**

| Model / family                              | Kind  | Reference                        |
|---------------------------------------------|-------|----------------------------------|
| SDXL (base, refiner, Turbo, Lightning, Hyper) | image | `references/SDXL.md`           |
| Anima (Base, Aesthetic, Turbo)              | image | `references/Anima.md`            |
| Fibo 2.0 (Dev, Edit Turbo)                  | image | `references/Fibo-2.0.md`         |
| FLUX.1-dev / schnell / Fill / Kontext       | image | `references/FLUX-1-DEV.md`       |
| FLUX.2-dev                                  | image | `references/FLUX-2-DEV.md`       |
| FLUX.2-klein (4B / 9B, base, kv)            | image | `references/FLUX-2-KLEIN.md`     |
| MOSS-Image (SFT, Base, Kromoss, DMD2 LoRA)  | image | `references/MOSS-Image.md`       |
| Z-Image (Turbo, Base)                       | image | `references/Z-Image.md`          |
| Krea 2 (Raw, Turbo)                         | image | `references/KREA-2.md`           |
| Qwen-Image, 2512, Edit-2509/2511            | image | `references/Qwen-Image.md`       |
| Qwen-Image-2.1                              | image | `references/Qwen-Image-2.1.md`   |
| Ideogram 4 (open weights)                   | image | `references/Ideogram-4.md`       |
| WAN 2.2 (T2V/I2V-A14B, TI2V-5B, S2V, Animate) | video | `references/WAN-2.2.md`        |
| LTX-2.5 (dev, distilled)                    | video | `references/LTX-2.5.md`          |
| MiniMax H3 (FL2VA, Ref2VA)                  | video | `references/MiniMax-H3.md`       |

Also available: `references/anima-1.0-danbooru-tag.csv` — the Danbooru tag list
for Anima (columns: tag, category, post count, aliases). It is large; **grep it**
for a specific tag or alias instead of reading it. Use it to check that a tag
exists and to get its canonical spelling (write tags lowercase with spaces, not
underscores, in Anima prompts).

Annotated before/after rewrites for these models are in
`examples/before-after.md`. Read it when the user asks to improve a prompt.

If the user's model isn't listed, say so, continue from the closest family below,
and tell them that parameter names and defaults should be checked against that
model's own docs.

### Uncertainty markers

Reference values tagged `[?]` are unverified. When a recommendation depends on
one, carry the uncertainty through ("try X — unconfirmed, verify on your setup")
instead of presenting it as fact. Untagged values are confirmed or community
consensus. Never invent a number the reference doesn't give; say it's
undocumented and suggest a small sweep instead.

## How the families differ

Text encoders decide what prompting style works. A prompt written for the wrong
family wastes most of its words.

- **CLIP (SDXL).** Short comma-separated phrases or booru tags; base SDXL also
  takes short natural-language scene descriptions. 77-token chunks — keep the
  important part in the first ~75 tokens. `(word:1.2)` weighting works. Negative
  prompts work on base/refiner; weak or useless on Turbo/Lightning/Hyper.
  Weak at spatial relationships — use regional prompting, ControlNet or inpaint.
- **Small LLM encoder, tag-first (Anima).** Booru tags in a fixed order, prose
  allowed. `@artist` prefix, one quality-tag system, weights need about
  `(word:2)` to act like SDXL's `1.2`.
- **LLM/T5 encoders, natural language** (FLUX.1, FLUX.2, klein, Z-Image, Krea 2,
  Qwen-Image, Qwen-Image-2.1). Full descriptive sentences; relationships and
  in-image text work. Tag soup underperforms. Weighting is unreliable or
  unsupported. Whether negatives work depends on **true CFG vs. distilled** —
  check the variant.
- **LLM encoder, mixed input (MOSS-Image).** Natural language, booru tags (in
  its Quality → Score → … → General order), or a bbox JSON layout; prose and
  JSON can be combined. Long prompts (up to ~4K tokens) are fine.
- **Structured JSON** (Ideogram 4, Fibo 2.0). Trained on JSON captions.
  Ideogram 4: description, style, palette (hex), elements with bounding boxes.
  Fibo 2.0: VGL fields (`objects`, `lighting`, `photographic_characteristics`,
  `text_render`, …), one object entry per person/item. Plain prose is a fallback
  that works; booru tags don't.
- **Video (WAN 2.2, LTX-2.5, MiniMax H3).** Prose in the order subject → action →
  camera → lighting/style, with camera moves described by direction and speed.
  LTX-2.5 and MiniMax H3 generate audio in the same pass, described in the same
  prompt (dialogue in quotes). Frame-count grids are strict per model.

### The settings trap that matters most

Most "the model is broken" reports are guidance misconfiguration, not prompts.
Before polishing wording, check the variant against its reference:

- **Distilled / turbo variants run at CFG 1.0** (or 0 for SDXL Turbo): FLUX.1-dev
  (real CFG 1.0, FluxGuidance 3.5), klein distilled, Z-Image Turbo, Krea 2 Turbo,
  Anima Turbo, Qwen-Image Lightning, Qwen-Image-2.1 (CFG 1.0 by default),
  Fibo 2.0 Edit Turbo, MOSS-Image + DMD2 LoRA (also remove SLG), WAN Lightning
  LoRAs, LTX-2.5 distilled, MiniMax H3. Raising CFG there burns the image or
  turns video into a slideshow, and negative prompts do nothing.
- **Non-distilled models need real CFG and many steps:** Fibo 2.0 Dev (CFG 5,
  30–50 steps), MOSS-Image SFT/Base (CFG 3, 50 steps, skip-layer guidance on
  layer 22). Running them at turbo settings gives broken, unfinished images.
- **Qwen-Image (2512/Edit)** uses `true_cfg_scale`; `guidance_scale` is a silent
  no-op, and a negative prompt is needed for CFG to apply at all.
- **Ideogram 4** guidance is dual-branch: 0 or 1 switches to single-pass mode,
  not "CFG off". Don't copy CFG values from other models.
- **Off-bucket resolution** causes duplication and composition collapse that
  looks like a prompt or anatomy problem. Use the reference's bucket table and
  alignment rule (e.g. Z-Image /64, Qwen-Image-2.1 /32, Ideogram, Fibo 2.0 and
  MOSS-Image /16).
- **Video frame counts:** WAN 4n+1, LTX-2.5 8n+1 (sides /32), MiniMax H3 17n+5.

When the user asks for a prompt, always include the settings block for their
variant from the reference's "Recommended Defaults", adjusted to the shot
(resolution bucket matching the composition, frame count matching duration).

## Workflow

1. **Identify the model and variant.** If the user hasn't said and it matters,
   ask once. Variant matters as much as the model (Turbo vs. Base changes CFG,
   steps, and whether negatives exist). If they don't care, recommend one from
   the references' positioning and say why.
2. **Read the reference file** (and `examples/before-after.md` when improving
   an existing prompt).
3. **Find the three things that must be right** (see Visual direction). Ask only
   if they can't reasonably be inferred; otherwise choose tastefully and state
   your choices so the user can redirect.
4. **Draft the prompt** in the model's native syntax and structure from its
   reference, plus negative prompt and settings where the variant supports them.
5. **Explain briefly** which choices carry the most weight, then offer 2–3
   variations that each change one axis (lighting, camera, palette, motion).

## Visual direction (all models; limits per reference)

Describe the image, not just the subject. "A woman in a red dress in a library"
leaves the model to choose shot type, camera height, lighting, time of day, and
genre, and it will choose differently from the user. Make each a deliberate
choice.

Before writing, decide:
- **The 3 things this image must get right.** Spend detail there and let the
  model improvise the rest. Over-controlling unimportant elements dilutes the
  important ones.
- **Image type/genre, shot size, camera height and angle, subject placement.**
  Without composition instructions most models center the subject and fill the
  frame.
- **Lighting:** source, direction, quality (hard/soft), color temperature —
  often the biggest lever on mood.
- **One dominant style.** Mixed styles fight; on Z-Image and Ideogram 4,
  photoreal + anime/poster cues produce uncanny, doll-like faces.
- **For video, motion:** what moves, how fast, and what the camera does (move,
  direction, speed, height). Keep to one or two action beats per clip.

Turn mood words into visible properties. "Dreamy" means different things to
different people and to the model:

| Mood        | Visible properties                                                |
|-------------|-------------------------------------------------------------------|
| dreamy      | morning haze, pale pastel palette, soft bloom, subtle film grain  |
| ominous     | low-key lighting, cold desaturated palette, low angle, deep shadow |
| cozy        | warm tungsten lamp light, close framing, soft textures, shallow DOF |
| epic        | wide shot, tiny figure against huge landscape, dramatic sky, rim light |
| nostalgic   | faded warm film stock, slight grain, afternoon sun, muted greens  |
| tense       | tight framing, hard side light, high contrast, tilted horizon     |

State relationships explicitly: who holds what, who looks at whom, what is in
the foreground. Language-encoder models follow this; on SDXL, warn that precise
relationships may need regional prompting, ControlNet, or inpainting.

### Two drafting strategies; offer both when intent is open-ended

1. **Structured:** image type → subject → action/pose → environment →
   composition → lighting → palette → style → finishing details. Fill only the
   slots tied to the top three priorities. Follow the reference's own order when
   it gives one (Anima's and MOSS-Image's tag orders, Fibo 2.0's VGL fields,
  Qwen-Image-2.1's subject → action → setting →
   lighting/camera → style → "text", video subject → action → camera → lighting).
2. **Concept-first:** one evocative framing sentence that implies palette,
   lighting, and composition at once ("quiet cinematic still from an indie film
   about loneliness in a coastal town"), then only the critical details. Works on
   LLM-encoder models; much weaker on SDXL and Anima.

### In-image text

Put literal text in quotes and say where it goes and how it looks. Strong:
Qwen-Image, Qwen-Image-2.1, FLUX.2-dev, Z-Image (EN/CN), MOSS-Image (EN/CN,
`\n` in the quotes for line breaks, bbox layout for placement), Fibo 2.0 (strings
in VGL `text_render` with location and font), Ideogram 4 (but keep under ~25
words, Latin script, 2–3 text regions). Weak: SDXL (single words at best),
Anima. Recommend another model rather than fighting a weak one.

### Editing

Instruction and multi-reference editing: Fibo 2.0 (Dev or Edit Turbo, up to 4
images addressed as `<image_1>` …), Qwen-Image Edit, FLUX.2-dev, klein,
FLUX.1 Kontext. Name what
changes and what stays ("keep the face, pose and background unchanged"). MOSS-Image
has no edit mode — img2img or inpaint only.

## Diagnosing "it doesn't look like what I imagined"

Diagnose before rewriting. Check in this order:

1. **Settings against the reference:** CFG/guidance for the variant, steps,
   sampler/scheduler, shift, resolution bucket and alignment, frame-count grid,
   wrong text encoder or VAE loaded, token budget exceeded (Krea 2 goes black
   past ~640 tokens).
2. Missing composition/framing (subject centered, too large or too small).
3. Camera angle or shot size wrong for the intended feeling.
4. Lighting unspecified or contradictory.
5. Relationships between subjects undefined.
6. Competing styles.
7. Vague mood words left for the model to interpret.
8. Model-specific prompt rules from the reference (wrong prompting style for
   the encoder, negatives on a distilled model, `no X` phrasing in a model with
   no negative channel, quality tags where they hurt).

Name the likely cause, then change **one variable per iteration**. Rewriting
everything at once hides what fixed the problem and often loses what already
worked. Treat the first generation as a sketch. If the reference's "Quirks and
Failure Modes" lists the symptom, quote the fix.

## Translating between models

Extract the intent (subject, top-three priorities, style, composition, mood,
motion), then rebuild from scratch in the target model's idiom and settings.
Never just swap syntax:

- SDXL/Anima tags → FLUX/Qwen/Z-Image/Krea: write real sentences, drop weights
  and quality tags (except Qwen-Image's suffix), turn negatives into positive
  description or drop them on distilled variants.
- Prose → SDXL: compress into ordered, weighted tags; move exclusions to the
  negative prompt; pick an SDXL bucket.
- Prose → Anima: tags in Anima's order, `@artist`, one quality system.
- Anything → Ideogram 4: split into description, style, palette, and text
  elements with bounding boxes.
- Anything → Fibo 2.0: VGL JSON with one `objects` entry per subject (fixes
  miscounted groups), consistent lighting/camera fields, text in `text_render`;
  or plain prose. Negatives only on Dev.
- Anything → MOSS-Image: prose or ordered tags; for precise placement or text,
  a bbox layout JSON (`yxyx`, coordinates from the canvas centre, matching the
  generation size).
- Image → video: keep the scene description, add action, camera move with speed,
  and duration that fits the frame grid; add audio lines for LTX-2.5/MiniMax H3.
- Negative prompt → MiniMax H3 (or other no-negative models): rewrite each
  exclusion as a positive constraint ("the camera stays locked off" not "no zoom").

## Universal principles

- Most important concepts first; most encoders weight early tokens more.
- Concrete and visual beats abstract and emotional.
- Quality spam ("masterpiece, best quality, 8k") only where the reference says it
  helps (Anima, booru SDXL finetunes, Qwen-Image's ", Ultra HD, 4K, cinematic
  composition." suffix). It does little or harms elsewhere.
- Avoid living artists' names and trademarked characters as style shortcuts;
  describe palette, brushwork, era, and medium. (Anima's `@artist` tags are a
  documented mechanism — use them only if the user asks.)
- Match aspect ratio to composition, using the model's actual buckets.
- Stay under the model's token/character budget (Krea 2 ~512 tokens hard; FLUX
  512; MOSS-Image ~4K tokens; MiniMax 7,000 chars; WAN sweet spot ~80–120
  words). Fibo 2.0 is trained on 1,000+ word captions, so long VGL is expected.

## Output format

Present results like this (adapt labels to what the model supports):

**Prompt**
```
<the prompt, ready to paste>
```

**Negative prompt** (only when the variant runs true CFG)
```
<negative prompt>
```

**Settings**
```
<copy-pasteable block: steps, cfg/guidance, sampler, scheduler, shift,
 resolution, frames/fps for video, LoRAs — from the reference defaults>
```

**Why it works** — 2–4 sentences on the choices that matter most.

**Variations** — 2–3 short alternatives, each changing one axis.

Keep explanations short when the user just wants a prompt. Go deeper when they
are learning or debugging.
