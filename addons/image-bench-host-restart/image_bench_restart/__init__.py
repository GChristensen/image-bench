"""
Host restart addon of Image Bench: restarts a hung or crashed SD WebUI / ComfyUI from the Image Bench window.
host_restart.py is the backend side, host_supervisor.py the sidecar process and host_process.py the process tree
of the host. The host entries are ../__init__.py (ComfyUI) and ../scripts/image_bench_host_restart.py (SD WebUI).
"""
import os

ADDON_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The config file (host_restart.json, edited by hand), the sidecar's state and its log
STORE_DIR = os.path.join(ADDON_DIR, "store")


def get_store_dir():
    os.makedirs(STORE_DIR, exist_ok=True)
    return STORE_DIR
