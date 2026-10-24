# Before / after: prompt improvement examples

Each example shows a typical weak prompt, the rewrite, and what changed and why.
Settings come from the model's reference file in `references/`. Values marked
`[?]` are unverified there.

---

## 1. SDXL base — vague subject to directed image

**Before**
```
beautiful woman in a library, masterpiece, best quality, 8k, ultra detailed
```
CFG 12, 768x768.

**After**
```
cinematic medium shot of a woman in a red wool dress reading by a tall arched
window, old library with towering bookshelves, warm late-afternoon sunlight from
the left, (dust motes in light beams:1.2), shallow depth of field, muted brown
and amber palette, film photography
```
Negative:
```
lowres, blurry, extra fingers, deformed hands, watermark, text, oversaturated
```
Settings:
```
steps: 30   cfg: 6.5   sampler: DPM++ 2M   scheduler: Karras
resolution: 832x1216 (portrait bucket)   clip_skip: 1
```

**What changed**
- Shot size, light direction, and palette are now choices, not left to the model.
- Removed quality spam: base SDXL wasn't trained around it, and it can hurt.
- CFG 12 burns SDXL; 5–8 is the working range.
- 768x768 is below SDXL's practical minimum and off-bucket, so faces turn to mush.
  832x1216 is an official bucket and suits a tall portrait.
- One weight on the detail that carries the mood, not on everything.

---

## 2. SDXL Lightning — base-model settings on a distilled checkpoint

**Before**: a good prompt, but the output looks fried.
```
steps: 30   cfg: 7   sampler: DPM++ 2M Karras   long negative prompt
```

**After**: same prompt, settings fixed.
```
steps: 8   cfg: 1.5-2.0   sampler: DPM++ SDE   scheduler: Karras
resolution: 1024x1024   negative: short or empty (little effect at low CFG)
```

**What changed**
- This is the most common "SDXL is broken" report. CFG 6–8 on Turbo, Lightning
  or Hyper burns the image. Check the variant before blaming the prompt.

---

## 3. Anima Base — prose and SDXL habits to Anima's tag order

**Before**
```
a girl with silver hair standing in the rain in a city at night, (umbrella:1.2),
score_9, masterpiece, best quality, artist wlop
```

**After**
```
masterpiece, best quality, safe, 1girl, solo, @wlop, silver hair, blue eyes,
standing on a rain-soaked city street at night, neon reflections, holding a red
umbrella, (looking back:2), long coat with detailed folds, wide shot
```
Negative:
```
worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration
```
Settings:
```
steps: 40   cfg: 4.5   sampler: er_sde   scheduler: normal   resolution: 1024x1024
```

**What changed**
- Anima's order: quality/meta/safety → character count → character → series →
  `@artist` → general tags.
- Two quality systems were mixed (`score_9` plus `masterpiece`). Pick one.
- The artist needs the `@` prefix, or the effect is weak.
- `(word:1.2)` under-weights on Anima. Use about `(word:2)` for a real push.
- Tags are lowercase with spaces. Check spellings in
  `references/anima-1.0-danbooru-tag.csv`.

---

## 4. FLUX.1-dev — tag soup and negatives to prose

**Before**
```
fisherman, old man, dock, fog, dawn, lantern, (cinematic:1.3), masterpiece, 8k
```
Negative: `blurry, bad hands, ugly`. KSampler CFG 7.

**After**
```
A weathered old fisherman in an oilskin coat stands at the end of a fog-covered
wooden dock at dawn, holding a lit brass lantern at chest height. The lantern's
warm glow lights his face from below against the cold blue fog. Medium shot from
slightly below eye level, shallow depth of field, shot on 35mm film with soft grain.
```
Settings:
```
steps: 28   cfg (KSampler): 1.0   FluxGuidance: 3.5
sampler: euler   scheduler: simple   resolution: 1216x832
```

**What changed**
- T5-XXL reads sentences. Tag stacks under-use it and come out flatter.
- Dropped the negative prompt: dev has no working negative channel.
- KSampler CFG above 1.0 applies guidance twice → burnt, oversaturated output.
  Guidance goes in FluxGuidance (3.5).
- Weighting and quality tags removed: unreliable on Flux.
- Light source and direction stated ("from below", warm vs. cold) give the mood.

---

## 5. Z-Image Turbo — mixed styles and an ignored negative

**Before**
```
photorealistic anime girl portrait, studio ghibli style, hyperrealistic skin, 8k
```
Negative: `bad hands, extra fingers`. CFG 4.

**After**
```
A photorealistic close-up portrait of a young woman with short black hair in a
yellow raincoat, standing under a bus-stop shelter in light rain, soft overcast
daylight, raindrops on the shelter glass behind her, shallow depth of field,
natural skin texture, muted teal and yellow palette
```
Settings:
```
steps: 9   cfg: 1.0   sampler: res_multistep   scheduler: simple
resolution: 896x1152 (all sides multiples of 64)   negative: none
```

**What changed**
- Photoreal + anime in one prompt gives uncanny blends on Z-Image. Pick one.
  Offer an anime version as a separate variation.
- Turbo is distilled: negatives do nothing and CFG above 1 adds artifacts.
  For negatives, use Z-Image Base (40 steps, CFG 4).
- Hands are a known Turbo weakness, so the framing keeps them out of shot.

---

## 6. Qwen-Image 2512 — getting legible poster text

**Before**
```
poster for a music festival with the title and date, colorful
```
Settings: `guidance_scale=4.0`, negative `blurry text`.

**After**
```
Minimalist concert poster, bold black title text "FUTURE FESTIVAL" centered at
the top, smaller subtitle below reading "2026 · ALL WELCOME", abstract geometric
shapes in orange and teal filling the lower two thirds, generous margins, flat
vector style, Ultra HD, 4K, cinematic composition.
```
Settings:
```
steps: 50   true_cfg_scale: 4.0   negative_prompt: " "
sampler: euler   scheduler: FlowMatch   resolution: 1056x1584 (2:3 bucket)
```

**What changed**
- The exact text goes in quotes, with position and relative size.
- Qwen-Image's own quality suffix goes at the end, not the start.
- `guidance_scale` is a silent no-op on this family. CFG only applies with
  `true_cfg_scale` > 1 and a negative prompt (even `" "`).
- Kept to two text blocks: many separate text blocks garble.

---

## 7. Qwen-Image-2.1 — transparent asset

**Before**
```
cute cartoon fox sticker, transparent background, png
```

**After**
```
This is an RGBA image with transparency. A cute cartoon fox sitting upright with
its tail curled around its paws, thick clean white outline, flat cel shading in
orange and cream, friendly half-closed eyes, sticker style. The image has alpha
channel and the background is transparent.
```
Settings:
```
steps: 25   cfg: 1.0   sampler: euler   scheduler: simple
resolution: 1024x1024   negative: none (ignored at cfg 1.0)
```

**What changed**
- Qwen-Image-2.1 needs the documented RGBA wrapper sentences. "transparent
  background, png" alone doesn't trigger it.
- Order follows the reference: subject → pose → style.
- KSampler's default CFG of 8 must be set to 1.0.

---

## 8. Ideogram 4 — free text to structured JSON

**Before**
```
retro diner poster that says OPEN LATE, orange and teal, vector
```

**After** (key names illustrative — check the official prompting guide `[?]`)
```json
{
  "description": "retro American diner poster, a chrome diner at night under a starry sky",
  "style": "flat vector illustration, warm orange and teal palette, no gradients",
  "palette": ["#E8622C", "#1F7A72", "#F4E3C1"],
  "elements": [
    {"type": "text", "content": "OPEN LATE", "bbox": [100, 60, 900, 220]},
    {"type": "text", "content": "EST. 1958", "bbox": [350, 860, 650, 930]}
  ]
}
```
Settings:
```
steps: 48 (V4_QUALITY_48)   guidance: 7.0 for steps 1-45, 3.0 for 46-48
sampler: euler   scheduler: Ideogram4Scheduler   resolution: 1024x1536
```

**What changed**
- Ideogram 4 was trained on JSON captions. Layout, text, and palette control are
  much more precise in JSON.
- Text regions get explicit bounding boxes (0–1000 coordinates). Kept to two
  regions, well under the ~25-word limit.
- JSON prompts also trip the built-in safety filter less often than free text.

---

## 9. Krea 2 Turbo — an over-long prompt producing black images

**Before**: an ~700-token prompt listing every object in the room, CFG 7.

**After**: the three things that matter, in prose, well under 512 tokens.
```
A wide-angle photograph of a rain-slicked city street at night, neon signage
reflected in puddles, a lone figure under a translucent umbrella in the left
third of the frame, shot on 35mm film with visible grain and soft chromatic
aberration at the edges.
```
Settings:
```
steps: 8   cfg: 1.0   sampler: euler   scheduler: simple
resolution: 1344x768 class, or 2 MP target for 2K   negative: empty
```

**What changed**
- Prompts of 640+ tokens are reported to produce black or corrupted output on
  Krea 2. This is a hard failure, not truncation.
- Turbo is distilled for CFG ≈ 1. CFG 7 degrades output.
- Composition stated (subject in the left third, wide angle) instead of
  listing more objects.

---

## 10. WAN 2.2 T2V-A14B — still-image prompt to video prompt

**Before**
```
woman in red raincoat, city street at night, neon, rain, cinematic
```
81 frames at 1280x720 with a Lightning LoRA, CFG 5 → static slideshow.

**After**
```
A woman in a red raincoat walks briskly down a rain-slicked city street at night,
neon signs reflecting in the puddles around her. The camera tracks alongside her
in a smooth dolly shot at eye level, slightly low angle. Rain falls steadily,
lit by streetlights; her breath fogs faintly in the cold air. Soft cinematic
lighting, shallow depth of field, muted blue-and-red palette, photorealistic.
```
Negative: WAN's default negative prompt (see reference).
Settings (Lightning):
```
steps: 4 high-noise + 4 low-noise, matching Lightning LoRA on each expert
cfg: 1.0   sampler: euler   shift: ~5
resolution: 1280x720   frames: 81 (4n+1)   fps: 16
```

**What changed**
- Order is subject → action → camera → lighting/style, at ~70 words (sweet spot
  80–120).
- The action ("walks briskly") and the camera move ("tracks alongside, dolly")
  are what make it a video.
- CFG above 1 with a distilled LoRA is the number-one slideshow cause.
- For a hero shot, drop Lightning: 40–50 steps, CFG 4.5–5, unipc, shift 3–5.

---

## 11. MiniMax H3 — negative-prompt habits in a model without negatives

**Before**
```
fisherman on a dock, golden hour
negative: zoom, camera shake, music, blurry
```

**After**
```
A weathered fisherman on a wooden dock at golden hour, mending a net with slow
deliberate hand movements. Camera: slow push-in at medium speed, staying at eye
level, steady with no shake. The subject stays centered and the framing stays
tight on his hands and face. Lighting: warm rim light from the low sun, soft haze.
Audio: creaking wood, distant gulls, quiet water lapping, no music.
```
Settings:
```
steps: 50   cfg: 1.0   shift (video): 12.0   shift (audio): 3.0
resolution: 768x1344 or 1344x768   frames: 90 (17n+5, ~3.75 s)   fps: 24
```

**What changed**
- H3 is CFG-distilled with no negative channel. Exclusions become positive
  constraints ("steady with no shake", "framing stays tight").
- The camera move has a direction, speed, and height, as MiniMax's guidance asks.
- Audio is written into the prompt, because it is generated in the same pass.

---

## 12. LTX-2.5 distilled — dialogue clip

**Before**
```
man talking to camera in a kitchen
```
97 frames, 540x960.

**After**
```
A middle-aged chef in a white apron stands behind a steel counter in a busy
restaurant kitchen, looking into the camera and smiling. He says in English:
"Tonight's special is slow-roasted lamb." Static medium shot at eye level, warm
overhead practical lights, steam rising from pans behind him, shallow depth of
field. Audio: his voice clear and close, soft kitchen clatter in the background.
```
Negative:
```
blurry, low quality, static, no movement, lip-sync mismatch
```
Settings:
```
steps: 8 (stage 1) + 4 (stage 2), predefined sigmas   cfg: 1.0
resolution: 544x960 stage 1 (sides /32), 2x in stage 2
frames: 121 (8n+1)   fps: 24   flow shift: not published — sweep 1/3/5
```

**What changed**
- 97 frames breaks LTX's 8n+1 rule, and 540 isn't divisible by 32. Both fixed.
- Subject → action → camera → lighting/style, with the spoken line in quotes so
  the audio stream can lip-sync it.
- The official prompt enhancer helps short prompts a lot. Writing the detail
  out does the same job when the enhancer isn't in the workflow.

---

## 13. Translation — SDXL tags to FLUX.2-klein

**Before (SDXL)**
```
1girl, red dress, (library:1.2), bookshelves, window light, cinematic, masterpiece
negative: lowres, bad anatomy, blurry
```

**After (klein-9B distilled)**
```
A young woman in a red dress reads a leather-bound book in a quiet old library,
seated in a window seat with tall bookshelves receding behind her. Soft afternoon
light falls across her from the window on the left, catching dust in the air.
Medium shot at eye level, shallow depth of field, warm muted palette, cinematic
photograph.
```
Settings:
```
steps: 4   guidance: 1.0   sampler: euler   resolution: 832x1216
negative: none (no-op on distilled klein)
```

**What changed**
- Rebuilt from the intent instead of swapping syntax: tags became sentences, and
  the weight became a stated relationship ("tall bookshelves receding behind her").
- The negative prompt was dropped: it does nothing on distilled klein.
  klein-base runs true CFG (guidance 4.0, 20–30 steps) if negatives are needed.
- `[?]` klein has no official bucket list. 832x1216 is borrowed from SDXL-style
  buckets that the community reports work.
