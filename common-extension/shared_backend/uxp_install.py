"""
Installing a Photoshop UXP plugin (editor-extensions/photoshop, photoshop-canny) where the Creative Cloud app
installs plugins (see editor-extensions/photoshop/uxp.ps1, which does the same from a shell)
"""
import ctypes
import json
import os
import shutil
import sys

from .editor_plugins import PluginError

MANIFEST = "manifest.json"

PACKAGE_EXTENSION = ".ccx"

# Development files that are not a part of the plugin
EXCLUDED_FILES = ("dist", "README.md", "uxp.ps1")

# Folder (a sibling of the plugin folders in editor-extensions/) of the installer script, which installs them all
INSTALLER_DIR = "photoshop"


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


def get_status(manifest):
    """The version of the plugin installed on this computer (None if not installed)"""
    status = {"installed": None, "supported": get_install_locations() is not None, "platform": sys.platform}

    if manifest and status["supported"]:
        _, info_file = get_install_locations()

        try:
            plugin = next((p for p in _read_registered_plugins(info_file) if p.get("pluginId") == manifest["id"]),
                          None)
            status["installed"] = plugin and plugin.get("versionString")
        except (OSError, ValueError):
            pass

    return status


def install(plugin_dir, files, manifest):
    """
    Copy the plugin to the shared UXP plugin directory and register it for Photoshop, as the Creative Cloud
    app does. Photoshop loads it after a restart.

    Raises:
        PluginError: On an unsupported platform
        PermissionError: If the shared plugin directory is not writable (it is in Program Files on Windows)
    """
    locations = get_install_locations()

    if not locations:
        raise PluginError(f"Installing the plugin is not supported on {sys.platform}")

    plugins_dir, info_file = locations
    folder_name = f"{manifest['id']}_{manifest['version']}"
    target = os.path.join(plugins_dir, folder_name)

    # Fails early without write access, before anything is removed
    os.makedirs(target, exist_ok=True)

    for name in os.listdir(plugins_dir):
        if name.startswith(manifest["id"] + "_") and name != folder_name:
            shutil.rmtree(os.path.join(plugins_dir, name), ignore_errors=True)

    for path in files:
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


def install_elevated(plugin_dir):
    """
    Windows: run the installer script (uxp.ps1 deploy) for the plugin with administrator rights, which shows a UAC
    prompt on this computer. Returns without waiting for it.

    Returns:
        True if the script was started
    """
    if sys.platform != "win32":
        return False

    script = os.path.join(os.path.dirname(plugin_dir), INSTALLER_DIR, "uxp.ps1")

    if not os.path.isfile(script):
        raise PluginError("The installer script uxp.ps1 is missing from the plugin files")

    arguments = f'-NoProfile -ExecutionPolicy Bypass -File "{script}" deploy -PluginDir "{plugin_dir}"'
    # ShellExecute returns a value greater than 32 on success; it is 5 (access denied) if the prompt is declined
    return ctypes.windll.shell32.ShellExecuteW(None, "runas", "powershell.exe", arguments, None, 0) > 32


def install_or_elevate(plugin_dir, files, manifest):
    """
    Install the plugin, or start the elevated installer if this process may not write the shared plugin directory

    Returns:
        {"result": "installed", "version": ...} or {"result": "elevating"}

    Raises:
        PluginError: If the plugin could not be installed
    """
    try:
        return {"result": "installed", "version": install(plugin_dir, files, manifest)}
    except PermissionError:
        if install_elevated(plugin_dir):
            return {"result": "elevating"}

        plugins_dir, _ = get_install_locations()
        raise PluginError(f"No permission to write to {plugins_dir}. Run the host with administrator rights, "
                          "or install the downloaded .ccx file with the Creative Cloud app.")
