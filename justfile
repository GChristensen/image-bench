# Machine-specific settings (deploy destinations) are read from .env
set dotenv-load

webui: (_docs "webui-extension")
    cd image-bench; npm run build:webui
    cp -f image-bench/dist/index.html webui-extension/scripts

comfy: (_docs "comfyui-extension")
    cd image-bench; npm run build:comfy
    cp -f image-bench/dist/index.html comfyui-extension/js
    mkdir -p comfyui-extension/js/shared
    cp -rf common-extension/shared_frontend/* comfyui-extension/js/shared/

# The model docs of the Library tab, copied into the default docs folder of the extension (docs.py:DOCS_DIR)
_docs ext:
    mkdir -p {{ext}}/model_docs
    cp -rf model-docs/docs/. {{ext}}/model_docs/

# Extension directories of the remote installs, set in .env (see .env.example)
webui_dest := env("WEBUI_DEST", "")
comfy_dest := env("COMFY_DEST", "")

# Build and copy the code files of the extension to the remote WebUI install (symlinked shared code included)
deploy-webui: (_require "WEBUI_DEST" webui_dest) webui (_deploy "webui-extension" webui_dest "*.js *.py *.css *.html default_snippets.json") (_deploy_docs webui_dest)

# Build and copy the code files of the extension and its workflows to the remote ComfyUI install
# (symlinked shared code included)
deploy-comfy: (_require "COMFY_DEST" comfy_dest) comfy (_deploy "comfyui-extension" comfy_dest "*.js *.py *.html node_config.json NODE_CONFIG.md default_snippets.json") (_deploy "comfyui-extension/workflows" (comfy_dest + "/workflows") "*.json") (_deploy_docs comfy_dest)

# The Host Restart addon (addons/image-bench-host-restart, installed by hand and never released), next to the
# extension of the remote install; its store/ (host_restart.json) is kept
deploy-restart-webui: (_require "WEBUI_DEST" webui_dest) (_deploy "addons/image-bench-host-restart" (webui_dest + "/../image-bench-host-restart") "*.py README.md")
deploy-restart-comfy: (_require "COMFY_DEST" comfy_dest) (_deploy "addons/image-bench-host-restart" (comfy_dest + "/../image-bench-host-restart") "*.py README.md")

# The model docs, into the default docs folder of the remote install
_deploy_docs dest: (_deploy "model-docs/docs" (dest + "/model_docs") "*")

# Checkouts of the build repositories (sd-webui-image-bench, comfyui-image-bench), set in .env
webui_release := env("WEBUI_RELEASE_REPO", "")
comfy_release := env("COMFY_RELEASE_REPO", "")

# Build and assemble the release tree into the checkout of the WebUI build repository (commit and push by hand)
release-webui: (_require "WEBUI_RELEASE_REPO" webui_release) webui
    python tools/assemble.py webui "{{webui_release}}"

# Build and assemble the release tree into the checkout of the ComfyUI build repository (bump the pyproject.toml version first)
release-comfy: (_require "COMFY_RELEASE_REPO" comfy_release) comfy
    python tools/assemble.py comfy "{{comfy_release}}"

publish-comfy: release-comfy
    cd ../image-bench-comfy; comfy node publish

# Package the editor plugins and upload them to the editor-plugins GitHub release (gh auth login first), then write
# image-bench/src/assets/editor-plugins.json, which the manual's download cards link; run it when a plugin version
# changes, before building the releases
plugins-release:
    python tools/plugins_release.py

# Check that every file of the Vue app with a middle click or Shift handler is named in src/gestures.js or
# src/shortcuts.js, the registries of the cheat sheet and the manual
check-gestures:
    python tools/check_gestures.py

_require name value:
    @{{ if value == "" { error(name + " is not set: copy .env.example to .env and set it") } else { "echo " + name + "=" + value } }}

# robocopy follows the directory symlinks and fails only with exit codes >= 8
_deploy src dest files:
    powershell.exe -NoProfile -Command 'robocopy {{src}} ("{{dest}}".Replace([char]47, [char]92)) {{files}} /S /XD store __pycache__ /NJH /NDL /NP; exit [int]($LASTEXITCODE -ge 8)'

# The GitHub Pages landing page (landing/): minified into the repo-root index.html; `npm install` in landing/ once.
# landing-media remakes landing/img from the sources in landing/images and landing/video (needs ffmpeg)
landing:
    cd landing; node build.mjs

landing-plain:
    cd landing; node build.mjs --plain

landing-media:
    cd landing; node media.mjs

test-webui:
    cd D:/ai/sd/webui; cmd //c start _start_webui

test-comfy:
    cd D:/ai/sd/comfyui; cmd //c start _run_nvidia_gpu.bat

ps := "powershell.exe -NoProfile -ExecutionPolicy Bypass -File editor-extensions/photoshop/uxp.ps1"

# Enable UXP developer mode for loading the Photoshop plugin from UXP Developer Tool (elevated shell)
ps-enable:
    {{ps}} enable

# Package the Photoshop plugin into editor-extensions/photoshop/dist/*.ccx
ps-package:
    {{ps}} package

# Install the Photoshop plugin without the Creative Cloud app (elevated shell)
ps-deploy:
    {{ps}} deploy

# Remove the Photoshop plugin installed by ps-deploy (elevated shell)
ps-undeploy:
    {{ps}} undeploy

canny := ps + " -PluginDir editor-extensions/photoshop-canny"

# Package the Canny Edges Photoshop plugin into editor-extensions/photoshop-canny/dist/*.ccx
canny-package:
    {{canny}} package

# Install the Canny Edges Photoshop plugin without the Creative Cloud app (elevated shell)
canny-deploy:
    {{canny}} deploy

# Remove the Canny Edges Photoshop plugin installed by canny-deploy (elevated shell)
canny-undeploy:
    {{canny}} undeploy

krita := "python editor-extensions/krita/krita.py"

# Package the Krita plugin into editor-extensions/krita/dist/*.zip
krita-package:
    {{krita}} package

# Install the Krita plugin into Krita's Python plugin folder and enable it (Krita closed)
krita-deploy:
    {{krita}} deploy

# Remove the Krita plugin installed by krita-deploy
krita-undeploy:
    {{krita}} undeploy

gimp := "python editor-extensions/gimp/gimp.py"

# Package the GIMP plugin into editor-extensions/gimp/dist/*.zip
gimp-package:
    {{gimp}} package

# Install the GIMP plugin into the plug-ins folder of GIMP3_DIRECTORY (.env) or the newest GIMP 3 profile
# (restart GIMP afterwards)
gimp-deploy:
    {{gimp}} deploy

# Remove the GIMP plugin installed by gimp-deploy
gimp-undeploy:
    {{gimp}} undeploy

# Package the diffusion-prompting Claude skill into skills/diffusion-prompting/dist/*.zip, with the model docs of
# model-docs/docs that its SKILL.md names as references
skill-diffusion-prompting:
    python skills/diffusion-prompting/build_skill.py

# Package the diffusion-prompting skill and upload it to the skills release of the GitHub repository (gh auth login
# first), replacing the previous upload
cskill-diffusion-prompting-release:
    python skills/diffusion-prompting/build_skill.py --release
