"""
Publishing the editor plugins (just plugins-release): package each plugin of editor_plugins.PLUGINS into
editor-extensions/plugin_tools/dist/, upload the packages to the editor-plugins release of the GitHub repository
(created if missing; assets of the same name are replaced) and write image-bench/src/assets/editor-plugins.json,
from which the download cards of the manual (PluginCard.vue) link the assets:
python tools/plugins_release.py [--package-only]

The extension does not ship the plugins, so a plugin version is downloadable only after this has run. Needs the
GitHub CLI, signed in (gh auth login). With --package-only the packages are built but neither uploaded nor listed.
"""
import json
import os
import subprocess
import sys

REPOSITORY_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

sys.path.insert(0, os.path.join(REPOSITORY_DIR, "editor-extensions"))

from plugin_tools import editor_plugins  # noqa: E402

GITHUB_REPOSITORY = "GChristensen/image-bench"
RELEASE_TAG = "editor-plugins"
RELEASE_TITLE = "Editor plugins"
RELEASE_NOTES = ("The Image Bench plugins for Photoshop, Krita and GIMP. Install them as the Editors chapter of the "
                 "Image Bench manual (Library tab) describes.")

DIST_DIR = os.path.join(REPOSITORY_DIR, "editor-extensions", "plugin_tools", "dist")
PLUGIN_LIST = os.path.join(REPOSITORY_DIR, "image-bench", "src", "assets", "editor-plugins.json")


def package_all():
    """Package every plugin into DIST_DIR: {plugin: {version, file}} and the package paths"""
    os.makedirs(DIST_DIR, exist_ok=True)
    plugins, paths = {}, []

    for plugin in editor_plugins.PLUGINS:
        name, content = editor_plugins.package(plugin)
        path = os.path.join(DIST_DIR, name)

        with open(path, "wb") as file:
            file.write(content)

        plugins[plugin] = {"version": editor_plugins.get_manifest(plugin)["version"], "file": name}
        paths.append(path)
        print(f"{plugin}: {name}")

    return plugins, paths


def gh(*args, check=True):
    return subprocess.run(["gh", *args, "--repo", GITHUB_REPOSITORY], check=check)


def upload(paths):
    if gh("release", "view", RELEASE_TAG, check=False).returncode != 0:
        gh("release", "create", RELEASE_TAG, "--title", RELEASE_TITLE, "--notes", RELEASE_NOTES, "--latest=false")

    gh("release", "upload", RELEASE_TAG, *paths, "--clobber")


def main(package_only=False):
    plugins, paths = package_all()

    if package_only:
        return

    upload(paths)

    with open(PLUGIN_LIST, "w", encoding="utf-8", newline="\n") as file:
        json.dump(plugins, file, indent=2)
        file.write("\n")

    print(f"Uploaded to the {RELEASE_TAG} release and wrote {os.path.relpath(PLUGIN_LIST, REPOSITORY_DIR)}: "
          "rebuild the app (just webui / just comfy)")


if __name__ == "__main__":
    try:
        main("--package-only" in sys.argv[1:])
    except (editor_plugins.PluginError, subprocess.CalledProcessError, OSError) as e:
        sys.exit(str(e))
