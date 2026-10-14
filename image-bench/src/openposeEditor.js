/**
 * sd-webui-openpose-editor, which edits the poses of openpose previews in the ControlNet tab (WebUI only).
 * Forge serves it at /openpose_editor_index when the extension is installed.
 */
import {dialog} from "@/dialogs/useDialog.js";

export const OPENPOSE_EDITOR_URL = "/openpose_editor_index";
export const OPENPOSE_EDITOR_REPOSITORY = "https://github.com/fabiencomte/sd-webui-openpose-editor";

// Installing the extension requires a WebUI restart, so a found editor stays found
let installed = false;

/**
 * Whether WebUI serves the editor; if not, offers to open the page of the extension
 * @returns {Promise<boolean>}
 */
export async function ensureOpenposeEditor() {
  if (!installed) {
    try {
      installed = (await fetch(OPENPOSE_EDITOR_URL, {cache: "no-store"})).ok;
    } catch (e) {
      console.error("[Image Bench] Unable to check the OpenPose editor:", e);
    }
  }

  if (!installed && await dialog.confirm(
    "The OpenPose editor is not installed in WebUI.\n\n"
    + `Install sd-webui-openpose-editor in Extensions › Install from URL with ${OPENPOSE_EDITOR_REPOSITORY} and restart WebUI.`,
    {title: "OpenPose editor", okText: "Open its page"}))
    window.open(OPENPOSE_EDITOR_REPOSITORY, "_blank", "noopener");

  return installed;
}
