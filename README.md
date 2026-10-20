# Image Bench

Image Bench automates the repetitive micro-tasks of working with ComfyUI. See more at the [extension site](https://github.com/GChristensen/image-bench).

This is the development repository. Please do not try to install the extension from it.

## Installation repositories

### Forge Neo

https://github.com/GChristensen/sd-webui-image-bench

### ComfyUI

https://github.com/GChristensen/comfyui-image-bench

## Building

Builds require [just](https://github.com/casey/just) and Node.js (run `npm install` in `image-bench/` once).
From the repository root, `just webui` or `just comfy` builds the Vue app into the corresponding extension folder.
The hosts serve the built page, so rebuild after every change. See the `justfile` for the release,
deploy and editor plugin recipes.

## Q&A

**Q: Do you accept issues, feature or pull requests for this project?**<br>
A: No. This software is distributed in the hope that it will be useful, but is provided 'as is' without warranty of any kind. You know.

**Q: There is an annoying bug!**<br>
A: Unfortunately, the author currently does not have the resources to provide free tech support. Please fix any issues using your favorite coding agent.

**Q: The host backend prints something about tensor shape in the console, nothing is working!**<br>
A: Something may have gotten messed up in the host UI (e.g., an incorrect VAE, text encoder, or image dimensions). 
Please try to get the host UI working first, or try resetting it.

**Q: It doesn't work at all!**<br>
A: It may be incompatible with your setup. Sometimes this happens. Please use logs and your best judgement to understand why exactly. 