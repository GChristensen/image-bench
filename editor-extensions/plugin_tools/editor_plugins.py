"""
Packaging the editor plugins (editor-extensions/) for their downloads, the assets of the editor-plugins GitHub release
(tools/plugins_release.py) linked from the manual. The editor-specific parts are in the installer modules
(uxp_install for Photoshop, krita_install for Krita, gimp_install for GIMP), which provide the PACKAGE_EXTENSION of
the download, MANIFEST (the path of manifest.json in the plugin folder) and EXCLUDED_FILES (development files that
are not a part of the plugin). Development code, never shipped with the extension: the plugins are installed from the
downloads, or in development by the scripts of their folders (editor-extensions/krita/krita.py, gimp/gimp.py deploy,
photoshop/uxp.ps1)
"""
import importlib
import io
import json
import os
import zipfile

# Folder of the plugin folders
EDITOR_EXTENSIONS_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# The plugins by their name (PluginCard of the manual, editor-plugins.json): their folder in editor-extensions/ and their installer module
PLUGINS = {
    "image-bench": {"dir": "photoshop", "installer": "uxp_install"},
    "canny": {"dir": "photoshop-canny", "installer": "uxp_install"},
    "krita": {"dir": "krita", "installer": "krita_install"},
    "gimp": {"dir": "gimp", "installer": "gimp_install"},
}
DEFAULT_PLUGIN = "image-bench"


class PluginError(Exception):
    pass


def _get_plugin(plugin):
    if plugin not in PLUGINS:
        raise PluginError(f"Unknown editor plugin: {plugin}")

    return PLUGINS[plugin], importlib.import_module("." + PLUGINS[plugin]["installer"], __package__)


def get_plugin_dir(plugin=DEFAULT_PLUGIN):
    """
    Args:
        plugin: A key of PLUGINS
    """
    info, installer = _get_plugin(plugin)
    path = os.path.join(EDITOR_EXTENSIONS_DIR, info["dir"])

    if not os.path.isfile(os.path.join(path, installer.MANIFEST)):
        raise PluginError(f"The manifest of the editor plugin is missing: {os.path.join(path, installer.MANIFEST)}")

    return path


def read_manifest(plugin_dir, installer):
    with open(os.path.join(plugin_dir, installer.MANIFEST), encoding="utf-8") as file:
        return json.load(file)


def get_manifest(plugin=DEFAULT_PLUGIN):
    """The manifest.json of the plugin"""
    return read_manifest(get_plugin_dir(plugin), _get_plugin(plugin)[1])


def get_plugin_files(plugin_dir, excluded=()):
    """Paths of the plugin files relative to its directory, without the excluded top-level files and folders"""
    result = []

    for root, dirs, files in os.walk(plugin_dir):
        relative_root = os.path.relpath(root, plugin_dir)
        dirs[:] = [d for d in dirs if d != "__pycache__" and not d.startswith(".")
                   and not (relative_root == "." and d in excluded)]

        if relative_root == ".":
            files = [f for f in files if f not in excluded]

        result += [os.path.normpath(os.path.join(relative_root, f)) for f in files
                   if not f.startswith(".") and not f.endswith(".pyc")]

    return result


def _load(plugin):
    """The plugin's installer module, folder, files and manifest"""
    _, installer = _get_plugin(plugin)
    plugin_dir = get_plugin_dir(plugin)
    return installer, plugin_dir, get_plugin_files(plugin_dir, installer.EXCLUDED_FILES), \
        read_manifest(plugin_dir, installer)


def package(plugin=DEFAULT_PLUGIN):
    """
    Package the plugin as a zip archive of its files: a .ccx file installed by double-clicking it with
    the Creative Cloud app, or a .zip file imported in Krita (Tools › Scripts › Import Python Plugin from File)

    Returns:
        (file name, file content)
    """
    installer, plugin_dir, files, manifest = _load(plugin)
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(os.path.join(plugin_dir, path), path.replace(os.sep, "/"))

    return f"{manifest['id']}_{manifest['version']}{installer.PACKAGE_EXTENSION}", buffer.getvalue()
