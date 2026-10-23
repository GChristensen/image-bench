"""
The Photoshop UXP plugins (editor-extensions/photoshop, photoshop-canny): their package. They are installed from the
downloaded .ccx file, or in development with editor-extensions/photoshop/uxp.ps1 deploy
"""

MANIFEST = "manifest.json"

PACKAGE_EXTENSION = ".ccx"

# Development files that are not a part of the plugin
EXCLUDED_FILES = ("dist", "README.md", "uxp.ps1")
