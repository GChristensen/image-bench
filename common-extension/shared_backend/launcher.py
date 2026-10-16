"""
The /image-bench/app entry point of both hosts: Image Bench in the embedded mode, which loads the host UI in its own
iframe tab, so that the host page never has to be opened by hand
"""

import os

from . import persist

# The app in the embedded mode (image-bench/src/hostWindow.js)
APP_URL = "/image-bench/window?embedded"

# Opens the app as a popup window (a page cannot open one without a redirect)
LAUNCHER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "launcher.html")


def redirect_url(config_path):
    """
    The URL to redirect /image-bench/app to, or None to serve the launcher page
    :param config_path: The config.json of the extension
    """
    config = persist.read_json_file(config_path) or {}
    return APP_URL if config.get("openInTab") else None
