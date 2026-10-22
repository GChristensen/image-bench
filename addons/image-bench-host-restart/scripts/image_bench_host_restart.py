"""
Host restart addon of Image Bench, the SD WebUI entry (ComfyUI: ../__init__.py).
Serves /image-bench/host_restart for the Image Bench window and starts the restart sidecar if store/host_restart.json
names the start script. See README.md.
"""
import os
import sys

import modules.script_callbacks as script_callbacks
import modules.shared as shared
from starlette.responses import JSONResponse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from image_bench_restart import get_store_dir, host_restart  # noqa: E402

BASE_PATH = "/image-bench"


def get_host_port():
    port = getattr(shared.cmd_opts, "port", None) or os.environ.get("GRADIO_SERVER_PORT")

    try:
        return int(port) if port else 7860
    except ValueError:
        return 7860


def get_host_server():
    """Port, network listening and TLS files of WebUI, which the restart sidecar takes over"""
    opts = shared.cmd_opts
    server_name = getattr(opts, "server_name", None)
    network = bool(getattr(opts, "listen", False)) or server_name not in (None, "", "127.0.0.1", "localhost")
    return host_restart.host_server(get_host_port(), network, getattr(opts, "tls_certfile", None),
                                    getattr(opts, "tls_keyfile", None))


def get_host_restart():
    """The restart settings and the sidecar address for the Image Bench window"""
    return JSONResponse(host_restart.info(get_store_dir(), get_host_server()), headers={"Cache-Control": "no-store"})


def post_host_restart():
    """Restart WebUI through the sidecar, for a window that does not reach the sidecar itself"""
    status, body = host_restart.restart(get_store_dir(), get_host_server())
    return JSONResponse(body, status_code=status)


def on_app_started(_, app):
    app.add_api_route(BASE_PATH + "/host_restart", get_host_restart, methods=["GET"])
    app.add_api_route(BASE_PATH + "/host_restart", post_host_restart, methods=["POST"])
    host_restart.ensure_in_background(get_store_dir(), get_host_server())


script_callbacks.on_app_started(on_app_started)
