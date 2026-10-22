"""
Host restart addon of Image Bench, the ComfyUI entry (SD WebUI: scripts/image_bench_host_restart.py).
Serves /image-bench/host_restart for the Image Bench window and starts the restart sidecar if store/host_restart.json
names the start script. See README.md.
"""
import asyncio

from aiohttp import web
from server import PromptServer

from .image_bench_restart import get_store_dir, host_restart

# No nodes: the addon only adds routes
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

BASE_PATH = "/image-bench"


def get_host_server():
    """Port, network listening and TLS files of ComfyUI, which the restart sidecar takes over"""
    try:
        from comfy.cli_args import args
    except Exception:
        return host_restart.host_server(8188)

    addresses = [address.strip() for address in str(args.listen or "").split(",") if address.strip()]
    network = any(address not in ("127.0.0.1", "localhost", "::1") for address in addresses)
    return host_restart.host_server(args.port, network, getattr(args, "tls_certfile", None),
                                    getattr(args, "tls_keyfile", None))


host_restart.ensure_in_background(get_store_dir(), get_host_server())


@PromptServer.instance.routes.get(BASE_PATH + "/host_restart")
async def host_restart_handler(request):
    return web.json_response(await asyncio.to_thread(host_restart.info, get_store_dir(), get_host_server()),
                             headers={"Cache-Control": "no-store"})


# A restart asked by a window that does not reach the sidecar itself (another computer, a certificate not accepted)
@PromptServer.instance.routes.post(BASE_PATH + "/host_restart")
async def host_restart_post_handler(request):
    status, body = await asyncio.to_thread(host_restart.restart, get_store_dir(), get_host_server())
    return web.json_response(body, status=status)
