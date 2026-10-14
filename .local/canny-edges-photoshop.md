# Canny Edges for Photoshop (plan, not started)

Goal: move the processing of the classic WebUI extension `D:\dev\sd\canny-edges-webui`
(`scripts/main.py`) into a **standalone Photoshop UXP plugin**. Edges are computed from a
Photoshop image and stay in Photoshop (new layer / document). No SD host needed.

## What the original does

```python
if blur > 1:
    img = cv2.GaussianBlur(img, (blur, blur), sigmaX=0, sigmaY=0)
edges = cv2.Canny(img, th1, th2)      # img is RGB (3 channels), not grayscale
```

Sliders: Threshold 1 (1..255, default 100), Threshold 2 (1..255, default 200),
Blur (1..21, step 2, default 1 = off). Live re-render on every change.

## Decisions made

- **Plain JS port** of GaussianBlur + Canny inside the plugin (no opencv.js/WASM, no hybrid
  C++ plugin, no Python helper). Target: visually identical to cv2, not bit-exact.
- Do not read OpenCV source; verify by diffing against cv2 instead (optional step).
- Separate plugin, sibling of `photoshop-extension/` (e.g. `photoshop-canny/`), independent of
  Image Bench. Hand-off to ControlNet happens via the existing Image Bench plugin (`cn_image`).

## OpenCV details to reproduce

- GaussianBlur, sigma=0: `sigma = 0.3*((k-1)*0.5 - 1) + 0.8`, separable kernel, normalized,
  border `BORDER_REFLECT_101` (`dcb|abcdefgh|gfe`). Applied per channel.
  (cv2 uses fixed-point kernels for 8-bit -> ±1 differences are acceptable.)
- Canny defaults: Sobel aperture 3, `L2gradient=false` -> magnitude `|dx| + |dy|`.
- Multi-channel input: per pixel take dx/dy of the channel with the largest magnitude.
- If th1 > th2, swap (low = min, high = max).
- Non-max suppression in 4 directions (tan 22.5° = 0.4142 bucket test as in OpenCV),
  pixel is a candidate if `mag > low`, strong if `mag > high`; hysteresis with 8-connectivity
  (stack-based). Output 0/255, single channel.

## Plugin design

Files (mirror `photoshop-extension/` layout): `manifest.json` (manifestVersion 5,
host PS minVersion 25.0.0, new id e.g. `image-bench.canny`, one panel entrypoint,
`localFileSystem: plugin`, no network needed), `index.html`, `index.js`, `canny.js`.

Panel: Threshold 1, Threshold 2, Blur sliders; source = active layer / merged image
(toggle); live preview `<img>`; buttons **Apply as layer**, **Apply as document**;
option "Selection only" (later).

Flow:
1. Read pixels: reuse the pattern of `photoshop-extension/index.js:readPixels`
   (`imaging.getPixels({documentID, layerID?, colorSpace: "RGB", targetSize?})` inside
   `core.executeAsModal`, dispose `imageData` after `getData()`).
   Cache the source buffer; re-read only on Refresh / document change.
2. Preview: read with `targetSize` ~640 px, run canny on change (debounce ~50 ms),
   `imaging.createImageDataFromBuffer(gray->RGB, {width, height, components: 3,
   colorSpace: "RGB"})` -> `imaging.encodeImageData({imageData, base64: true})` ->
   `img.src = "data:image/jpeg;base64," + b64`.
3. Apply as layer: full-res read, canny, create pixel layer named `Canny t1/t2 bN`
   (reuse/overwrite it on re-apply), `imaging.putPixels({layerID, imageData})`,
   all in one history step (`executeAsModal` + `hostControl.suspendHistory`).
   Edges white on black, gray copied to R, G, B.
4. Apply as document: `app.documents.add({width, height, resolution, mode: "RGBColorMode"})`
   then putPixels as above.
5. Note: blur kernel size relative to resolution — preview at reduced size will look
   blurrier/less detailed than full res. Either scale the blur for preview or accept it.

## Build / deploy

- Reuse `photoshop-extension/uxp.ps1` (parametrize by plugin folder if it hardcodes paths)
  and add `just` recipes analogous to `ps-enable / ps-package / ps-deploy / ps-undeploy`
  (justfile lines ~39-55), e.g. `canny-package`, `canny-deploy`.
- Test via UXP Developer Tool (load `manifest.json`), console for errors.

## Optional verification

Python in the WebUI venv (`D:/ai/sd/webui`, has cv2): run `cv2.Canny` with the same
params on a test image, diff against the PNG exported from the plugin, report % differing
pixels. Only if the result looks off.

## Steps when resuming

1. Read `photoshop-extension/index.js`, `index.html`, `uxp.ps1`, justfile PS recipes.
2. Write `canny.js` (blur + canny, typed arrays) and the panel.
3. Add just recipes; user tests in Photoshop and reports console errors.
4. Polish: selection-only, reuse layer, preview blur scaling.

Budget note: estimated as one medium session (~30-60 tool calls); risk is debugging
round-trips since Claude cannot run Photoshop.
