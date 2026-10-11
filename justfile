webui:
    cd image-bench; npm run build:webui
    cp -f image-bench/dist/index.html webui-extension/scripts

comfy:
    cd image-bench; npm run build:comfy
    cp -f image-bench/dist/index.html comfyui-extension/js
    cp -rf common-extension/shared_frontend/* comfyui-extension/js/shared/

# Forward slashes, converted by PowerShell: the shell passes \\ of a UNC path to it as \
webui_dest := '//RTX/A/software/ai/sd/webui-neo/extensions/image-bench'
comfy_dest := '//RTX/A/software/ai/sd/comfyui/ComfyUI/custom_nodes/image-bench'

# Build and copy the code files of the extension to the remote WebUI install (symlinked shared code included)
deploy-webui: webui (_deploy "webui-extension" webui_dest "*.js *.py *.css *.html") (_deploy_ps webui_dest)

# Build and copy the code files of the extension to the remote ComfyUI install (symlinked shared code included)
deploy-comfy: comfy (_deploy "comfyui-extension" comfy_dest "*.js *.py *.html node_config.json") (_deploy_ps comfy_dest)

# The Photoshop plugin, supplied with the extension for installing it from the Manual tab
_deploy_ps dest: (_deploy "photoshop-extension" (dest + "/shared/photoshop-plugin") "index.js index.html manifest.json uxp.ps1")

# robocopy follows the directory symlinks and fails only with exit codes >= 8
_deploy src dest files:
    powershell.exe -NoProfile -Command 'robocopy {{src}} ("{{dest}}".Replace([char]47, [char]92)) {{files}} /S /XD store __pycache__ example_workflows /NJH /NDL /NP; exit [int]($LASTEXITCODE -ge 8)'

test-webui:
    cd D:/ai/sd/webui; cmd //c start _start_webui

test-comfy:
    cd D:/ai/sd/comfyui; cmd //c start _run_nvidia_gpu.bat

ps := "powershell.exe -NoProfile -ExecutionPolicy Bypass -File photoshop-extension/uxp.ps1"

# Enable UXP developer mode for loading the Photoshop plugin from UXP Developer Tool (elevated shell)
ps-enable:
    {{ps}} enable

# Package the Photoshop plugin into photoshop-extension/dist/*.ccx
ps-package:
    {{ps}} package

# Install the Photoshop plugin without the Creative Cloud app (elevated shell)
ps-deploy:
    {{ps}} deploy

# Remove the Photoshop plugin installed by ps-deploy (elevated shell)
ps-undeploy:
    {{ps}} undeploy
