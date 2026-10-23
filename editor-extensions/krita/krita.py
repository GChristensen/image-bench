"""
Krita plugin management from a shell (just krita-package / krita-deploy / krita-undeploy), through the packaging code
of the release downloads (editor-extensions/plugin_tools):
  package  - Build dist/image_bench_<version>.zip, importable with Tools › Scripts › Import Python Plugin from File
  deploy   - Copy the plugin to Krita's Python plugin folder and enable it in kritarc, as Krita's Python Plugin
             Manager does (Krita must be closed)
  undeploy - Remove the plugin installed by deploy
A development script: not shipped with the extension, which never installs a plugin itself.
"""
import os
import shutil
import subprocess
import sys

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(PLUGIN_DIR, ".."))

from plugin_tools import editor_plugins, krita_install  # noqa: E402
from plugin_tools.editor_plugins import PluginError  # noqa: E402


def is_krita_running():
    try:
        if sys.platform == "win32":
            output = subprocess.run(["tasklist", "/FI", "IMAGENAME eq krita.exe", "/NH"], capture_output=True,
                                    text=True, creationflags=subprocess.CREATE_NO_WINDOW).stdout
            return "krita.exe" in output.lower()

        return subprocess.run(["pgrep", "-x", "krita"], capture_output=True).returncode == 0
    except OSError:
        return False


def enable_plugin(kritarc, name=krita_install.PACKAGE_NAME):
    """
    Set enable_<name>=true in the [python] section of kritarc, editing the lines only:
    configparser would rewrite the Qt settings format
    """
    key = f"enable_{name}"

    try:
        with open(kritarc, encoding="utf-8", newline="") as file:
            text = file.read()
    except FileNotFoundError:
        text = ""

    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines()
    section_start = section_end = None

    for i, line in enumerate(lines):
        stripped = line.strip()

        if stripped.startswith("[") and stripped.endswith("]"):
            if section_start is not None and section_end is None:
                section_end = i

            if stripped == "[python]":
                section_start = i
        elif section_start is not None and section_end is None and stripped.split("=", 1)[0].strip() == key:
            lines[i] = f"{key}=true"
            break
    else:
        if section_start is None:
            lines += ([""] if lines and lines[-1].strip() else []) + ["[python]", f"{key}=true"]
        else:
            end = section_end if section_end is not None else len(lines)

            # Before the blank lines that end the section
            while end > section_start + 1 and not lines[end - 1].strip():
                end -= 1

            lines.insert(end, f"{key}=true")

    os.makedirs(os.path.dirname(kritarc), exist_ok=True)

    with open(kritarc, "w", encoding="utf-8", newline="") as file:
        file.write(newline.join(lines) + newline)


def deploy():
    """
    Copy the plugin into Krita's Python plugin folder and enable it. Krita writes kritarc when it exits,
    so it must not run meanwhile.

    Returns:
        The installed version

    Raises:
        PluginError: On an unsupported platform, or if Krita is running
    """
    locations = krita_install.get_install_locations()

    if not locations:
        raise PluginError(f"Installing the plugin is not supported on {sys.platform}")

    if is_krita_running():
        raise PluginError("Krita is running: close it and deploy again (Krita rewrites its settings when it exits).")

    plugins_dir, kritarc = locations
    shutil.rmtree(os.path.join(plugins_dir, krita_install.PACKAGE_NAME), ignore_errors=True)

    for path in editor_plugins.get_plugin_files(PLUGIN_DIR, krita_install.EXCLUDED_FILES):
        target = os.path.join(plugins_dir, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(os.path.join(PLUGIN_DIR, path), target)

    enable_plugin(kritarc)

    return editor_plugins.read_manifest(PLUGIN_DIR, krita_install)["version"]


def main(action):
    if action == "package":
        name, content = editor_plugins.package("krita")
        os.makedirs(os.path.join(PLUGIN_DIR, "dist"), exist_ok=True)

        with open(os.path.join(PLUGIN_DIR, "dist", name), "wb") as file:
            file.write(content)

        print(f"dist/{name}")
    elif action == "deploy":
        print(f"Installed {deploy()}")
    elif action == "undeploy":
        plugins_dir, _ = krita_install.get_install_locations()
        shutil.rmtree(os.path.join(plugins_dir, krita_install.PACKAGE_NAME), ignore_errors=True)

        try:
            os.remove(os.path.join(plugins_dir, krita_install.PACKAGE_NAME + ".desktop"))
        except FileNotFoundError:
            pass

        print("Removed")
    else:
        sys.exit(f"Unknown action: {action} (package, deploy or undeploy)")


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else "")
    except PluginError as e:
        sys.exit(str(e))
