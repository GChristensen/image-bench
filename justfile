webui:
    cd image-bench; npm run build:webui
    cp -f image-bench/dist/index.html webui-extension/scripts

comfy:
    cd image-bench; npm run build:comfy
    cp -f image-bench/dist/index.html comfyui-extension/js
    cp -rf common-extension/shared_frontend/* comfyui-extension/js/shared/

test-webui:
    cd D:/ai/sd/webui; cmd //c start _start_webui

test-comfy:
    cd D:/ai/sd/comfyui; cmd //c start _run_nvidia_gpu.bat