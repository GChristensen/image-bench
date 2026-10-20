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
deploy-webui: (_require "WEBUI_DEST" webui_dest) webui (_deploy "webui-extension" webui_dest "*.js *.py *.css *.html default_snippets.json") (_deploy_docs webui_dest) (_deploy_editors webui_dest)

# Build and copy the code files of the extension and its workflows to the remote ComfyUI install
# (symlinked shared code included)
deploy-comfy: (_require "COMFY_DEST" comfy_dest) comfy (_deploy "comfyui-extension" comfy_dest "*.js *.py *.html node_config.json NODE_CONFIG.md default_snippets.json") (_deploy "comfyui-extension/workflows" (comfy_dest + "/workflows") "*.json") (_deploy_docs comfy_dest) (_deploy_editors comfy_dest)

# The model docs, into the default docs folder of the remote install
_deploy_docs dest: (_deploy "model-docs/docs" (dest + "/model_docs") "*")

# The editor plugins, supplied with the extension for installing them from the manual (Library tab)
_deploy_editors dest: (_deploy "editor-extensions/photoshop" (dest + "/image_bench_shared/editor-extensions/photoshop") "index.js index.html manifest.json") (_deploy "editor-extensions/photoshop-canny" (dest + "/image_bench_shared/editor-extensions/photoshop-canny") "*.js index.html manifest.json") (_deploy "editor-extensions/krita" (dest + "/image_bench_shared/editor-extensions/krita") "*.py *.desktop manifest.json") (_deploy "editor-extensions/gimp" (dest + "/image_bench_shared/editor-extensions/gimp") "*.py manifest.json")

# Checkouts of the build repositories (sd-webui-image-bench, comfyui-image-bench), set in .env
webui_release := env("WEBUI_RELEASE_REPO", "")
comfy_release := env("COMFY_RELEASE_REPO", "")

# Build and assemble the release tree into the checkout of the WebUI build repository (commit and push by hand)
release-webui: (_require "WEBUI_RELEASE_REPO" webui_release) webui
    python tools/assemble.py webui "{{webui_release}}"

# Build and assemble the release tree into the checkout of the ComfyUI build repository (bump the pyproject.toml version first)
release-comfy: (_require "COMFY_RELEASE_REPO" comfy_release) comfy
    python tools/assemble.py comfy "{{comfy_release}}"

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
