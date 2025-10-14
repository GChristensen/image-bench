webui:
    cd image-bench; npm run build:webui
    cp -f image-bench/dist/index.html webui-extension/scripts

comfy:
    cd image-bench; npm run build:comfy
    cp -f image-bench/dist/index.html comfyui-extension/js

test-comfy:
    cd D:/ai/sd/comfyui; cmd //c start _run_nvidia_gpu.bat