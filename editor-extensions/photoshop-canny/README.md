# Canny Edges for Photoshop

A UXP plugin that computes Canny edges of the active document, as the WebUI extension
`canny-edges-webui` does (`cv2.GaussianBlur` + `cv2.Canny`), with no SD host needed. The edges are white on black,
ready to be sent to ControlNet as the control image (Image Bench plugin: **ControlNet › Image**).

- **Threshold 1 / Threshold 2** — the hysteresis thresholds (swapped if Threshold 1 is larger).
- **Blur** — the Gaussian blur kernel size applied first (1 = no blur).
- **Merged / Active layer** — the source: the visible image or the pixels of the active layer (transparent areas
  count as black). The source is read again when another document or layer is selected, on **Refresh** and before
  each apply.
- **Fast preview (approximate)** — the preview shows the full-size edges downscaled (the exact result; a threshold
  change reuses the gradients of the blur). Checked, it is computed from the image downscaled to 640 px with the blur
  scaled along: faster for large images, but its edges differ from those applied.
- **Selection only** — edges outside the selection are cleared.
- **As layer** — puts the edges into a layer named `Canny <t1>/<t2> b<blur>` above the active layer, in one
  history step. Applying again in the same document overwrites that layer. RGB and Grayscale documents of any depth.
- **As document** — opens the edges as a new RGB document.

The edge detection (`canny.js`) is a JavaScript port. It matches cv2 4.x pixel for pixel without blur and with blur
sizes up to 11. Larger blur sizes differ from cv2 by 1-2 levels after the blur, which moves a few edge pixels.

Requires Photoshop 2024 (25.0) or newer.

## Development and installation

The plugin is supplied with the Image Bench extension: the Photoshop chapter of its manual (Library tab) has
**Install** and **Download .ccx** for it. Otherwise, as for the Image Bench plugin (see `../photoshop/README.md`), with the `canny-*` recipes:
load `manifest.json` from this folder in UXP Developer Tool (developer mode: `just ps-enable`), or run
`just canny-package` (`dist/*.ccx`), `just canny-deploy` / `just canny-undeploy` (elevated shell).
