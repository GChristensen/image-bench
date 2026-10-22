"""
GIMP plugin management from a shell (just gimp-package / gimp-deploy / gimp-undeploy), through the same backend
code as the install card of the Image Bench manual:
  package  - Build dist/image_bench_gimp_<version>.zip, to unpack into the plug-ins folder of GIMP
  deploy   - Copy the plugin to the plug-ins folder of the GIMP 3 profile: GIMP3_DIRECTORY (e.g. from .env, for
             GIMP Portable's Data/GimpAppData), else the newest GIMP/3.x folder; restart GIMP afterwards
  undeploy - Remove the plugin installed by deploy
A development script: not shipped with the extension, which never installs a plugin itself.
"""
import os
import shutil
import stat
import sys

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(PLUGIN_DIR, "..", "..", "common-extension"))

from shared_backend import editor_plugins, gimp_install  # noqa: E402
from shared_backend.editor_plugins import PluginError  # noqa: E402


def deploy():
    """
    Copy the plugin into the plug-ins folder of the GIMP 3 profile (see gimp_install.get_plugins_dir). GIMP finds new
    plug-ins when it starts, so it is restarted afterwards; it need not be closed meanwhile.

    Returns:
        The installed version

    Raises:
        PluginError: On an unsupported platform, or if GIMP 3 has never run
    """
    plugins_dir = gimp_install.get_plugins_dir()

    if plugins_dir is None:
        raise PluginError(f"Installing the plugin is not supported on {sys.platform}")

    if not plugins_dir:
        raise PluginError("No GIMP 3 settings folder was found: start GIMP 3 once and deploy again.")

    shutil.rmtree(os.path.join(plugins_dir, gimp_install.PACKAGE_NAME), ignore_errors=True)

    for path in editor_plugins.get_plugin_files(PLUGIN_DIR, gimp_install.EXCLUDED_FILES):
        target = os.path.join(plugins_dir, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(os.path.join(PLUGIN_DIR, path), target)

    # GIMP runs only executable plug-in files outside Windows
    main_file = os.path.join(plugins_dir, gimp_install.PACKAGE_NAME, gimp_install.PACKAGE_NAME + ".py")
    os.chmod(main_file, os.stat(main_file).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return editor_plugins.read_manifest(PLUGIN_DIR, gimp_install)["version"]


def main(action):
    if action == "package":
        name, content = editor_plugins.package("gimp")
        os.makedirs(os.path.join(PLUGIN_DIR, "dist"), exist_ok=True)

        with open(os.path.join(PLUGIN_DIR, "dist", name), "wb") as file:
            file.write(content)

        print(f"dist/{name}")
    elif action == "deploy":
        print(f"Installed {deploy()} into {gimp_install.get_plugins_dir()}")
    elif action == "undeploy":
        plugins_dir = gimp_install.get_plugins_dir()

        if plugins_dir:
            shutil.rmtree(os.path.join(plugins_dir, gimp_install.PACKAGE_NAME), ignore_errors=True)

        print("Removed")
    else:
        sys.exit(f"Unknown action: {action} (package, deploy or undeploy)")


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else "")
    except PluginError as e:
        sys.exit(str(e))
