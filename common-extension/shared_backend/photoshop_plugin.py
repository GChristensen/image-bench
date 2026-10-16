"""
The Photoshop UXP plugins supplied with the extension (Image Bench, Canny Edges): packaging one as a .ccx file and
installing it where the Creative Cloud app installs plugins (see photoshop-extension/uxp.ps1, which does the same
from a shell)
"""
import ctypes
import io
import json
import os
import shutil
import sys
import zipfile

_SHARED_DIR = os.path.dirname(os.path.abspath(__file__))

_REPOSITORY_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "..")

# Where the files of each plugin are: copied next to this module by the deploy, or the repository folder
# (the extension's shared directory is a symlink to common-extension/shared_backend)
PLUGIN_DIRS = {
    "image-bench": (os.path.join(_SHARED_DIR, "photoshop-plugin"), os.path.join(_REPOSITORY_DIR, "photoshop-extension")),
    "canny": (os.path.join(_SHARED_DIR, "photoshop-canny"), os.path.join(_REPOSITORY_DIR, "photoshop-canny")),
}
DEFAULT_PLUGIN = "image-bench"
# The plugin whose folder holds the installer script, which installs the others too
INSTALLER_PLUGIN = "image-bench"

# Development files that are not a part of the plugin
EXCLUDED_FILES = ("dist", "README.md", "uxp.ps1")


class PluginError(Exception):
    pass


def get_plugin_dir(plugin=DEFAULT_PLUGIN):
    """
    Args:
        plugin: A key of PLUGIN_DIRS
    """
    if plugin not in PLUGIN_DIRS:
        raise PluginError(f"Unknown Photoshop plugin: {plugin}")

    for path in PLUGIN_DIRS[plugin]:
        if os.path.isfile(os.path.join(path, "manifest.json")):
            return os.path.normpath(path)

    raise PluginError("The Photoshop plugin files are not found in the extension")


def read_manifest(plugin_dir):
    with open(os.path.join(plugin_dir, "manifest.json"), encoding="utf-8") as file:
        return json.load(file)


def get_plugin_files(plugin_dir):
    """Paths of the plugin files relative to its directory"""
    result = []

    for root, dirs, files in os.walk(plugin_dir):
        relative_root = os.path.relpath(root, plugin_dir)

        if relative_root == ".":
            dirs[:] = [d for d in dirs if d not in EXCLUDED_FILES and not d.startswith(".")]
            files = [f for f in files if f not in EXCLUDED_FILES]

        result += [os.path.normpath(os.path.join(relative_root, f)) for f in files if not f.startswith(".")]

    return result


def build_ccx(plugin=DEFAULT_PLUGIN):
    """
    Package the plugin as a .ccx file (a zip archive of the plugin files), installed by double-clicking it
    with the Creative Cloud app

    Returns:
        (file name, file content)
    """
    plugin_dir = get_plugin_dir(plugin)
    manifest = read_manifest(plugin_dir)
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in get_plugin_files(plugin_dir):
            archive.write(os.path.join(plugin_dir, path), path.replace(os.sep, "/"))

    return f"{manifest['id']}_{manifest['version']}.ccx", buffer.getvalue()


def get_install_locations():
    """
    The shared UXP plugin directory and the Photoshop plugin registry of the current user,
    or None on an unsupported platform
    """
    if sys.platform == "win32":
        common_files = os.environ.get("CommonProgramFiles", r"C:\Program Files\Common Files")
        return (os.path.join(common_files, "Adobe", "UXP", "Plugins", "External"),
                os.path.join(os.environ.get("APPDATA", ""), "Adobe", "UXP", "PluginsInfo", "v1", "PS.json"))

    if sys.platform == "darwin":
        return ("/Library/Application Support/Adobe/UXP/Plugins/External",
                os.path.expanduser("~/Library/Application Support/Adobe/UXP/PluginsInfo/v1/PS.json"))

    return None


def _read_registered_plugins(info_file):
    try:
        with open(info_file, encoding="utf-8-sig") as file:
            return [p for p in (json.load(file).get("plugins") or []) if p]
    except FileNotFoundError:
        return []


def _write_registered_plugins(info_file, plugins):
    os.makedirs(os.path.dirname(info_file), exist_ok=True)

    with open(info_file, "w", encoding="utf-8") as file:
        json.dump({"plugins": plugins}, file, indent=2)


def get_status(plugin=DEFAULT_PLUGIN):
    """The version of the supplied plugin, and the version installed on this computer (None if not installed)"""
    status = {"available": None, "installed": None, "supported": get_install_locations() is not None,
              "platform": sys.platform}

    try:
        manifest = read_manifest(get_plugin_dir(plugin))
        status["available"] = manifest["version"]
    except (PluginError, OSError, ValueError):
        return status

    if status["supported"]:
        _, info_file = get_install_locations()

        try:
            plugin = next((p for p in _read_registered_plugins(info_file) if p.get("pluginId") == manifest["id"]),
                          None)
            status["installed"] = plugin and plugin.get("versionString")
        except (OSError, ValueError):
            pass

    return status


def install(plugin=DEFAULT_PLUGIN):
    """
    Copy the plugin to the shared UXP plugin directory and register it for Photoshop, as the Creative Cloud
    app does. Photoshop loads it after a restart.

    Raises:
        PluginError: On an unsupported platform or without the plugin files
        PermissionError: If the shared plugin directory is not writable (it is in Program Files on Windows)
    """
    locations = get_install_locations()

    if not locations:
        raise PluginError(f"Installing the plugin is not supported on {sys.platform}")

    plugins_dir, info_file = locations
    plugin_dir = get_plugin_dir(plugin)
    manifest = read_manifest(plugin_dir)
    folder_name = f"{manifest['id']}_{manifest['version']}"
    target = os.path.join(plugins_dir, folder_name)

    # Fails early without write access, before anything is removed
    os.makedirs(target, exist_ok=True)

    for name in os.listdir(plugins_dir):
        if name.startswith(manifest["id"] + "_") and name != folder_name:
            shutil.rmtree(os.path.join(plugins_dir, name), ignore_errors=True)

    for path in get_plugin_files(plugin_dir):
        os.makedirs(os.path.dirname(os.path.join(target, path)), exist_ok=True)
        shutil.copyfile(os.path.join(plugin_dir, path), os.path.join(target, path))

    plugins = [p for p in _read_registered_plugins(info_file) if p.get("pluginId") != manifest["id"]]
    plugins.append({
        "hostMinVersion": manifest["host"]["minVersion"],
        "name": manifest["name"],
        "path": f"$localPlugins\\External\\{folder_name}" if sys.platform == "win32"
                else f"$localPlugins/External/{folder_name}",
        "pluginId": manifest["id"],
        "status": "enabled",
        "type": "uxp",
        "versionString": manifest["version"],
    })
    _write_registered_plugins(info_file, plugins)

    return manifest["version"]


def install_elevated(plugin=DEFAULT_PLUGIN):
    """
    Windows: run the installer script (uxp.ps1 deploy) for the plugin with administrator rights, which shows a UAC
    prompt on this computer. Returns without waiting for it.

    Returns:
        True if the script was started
    """
    if sys.platform != "win32":
        return False

    plugin_dir = get_plugin_dir(plugin)
    script = os.path.join(get_plugin_dir(INSTALLER_PLUGIN), "uxp.ps1")

    if not os.path.isfile(script):
        raise PluginError("The installer script uxp.ps1 is missing from the plugin files")

    arguments = f'-NoProfile -ExecutionPolicy Bypass -File "{script}" deploy -PluginDir "{plugin_dir}"'
    # ShellExecute returns a value greater than 32 on success; it is 5 (access denied) if the prompt is declined
    return ctypes.windll.shell32.ShellExecuteW(None, "runas", "powershell.exe", arguments, None, 0) > 32


def install_or_elevate(plugin=DEFAULT_PLUGIN):
    """
    Install the plugin, or start the elevated installer if this process may not write the shared plugin directory

    Returns:
        {"result": "installed", "version": ...} or {"result": "elevating"}

    Raises:
        PluginError: If the plugin could not be installed
    """
    try:
        return {"result": "installed", "version": install(plugin)}
    except PermissionError:
        if install_elevated(plugin):
            return {"result": "elevating"}

        plugins_dir, _ = get_install_locations()
        raise PluginError(f"No permission to write to {plugins_dir}. Run the host with administrator rights, "
                          "or install the downloaded .ccx file with the Creative Cloud app.")
