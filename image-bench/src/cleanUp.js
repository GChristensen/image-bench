import {clearViewsAndTrays, startBlankWorkspace, VIEWS} from "@/workspace.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useControlNetSweepStore} from "@/stores/controlnetSweep.js";
import {useProjectsStore} from "@/stores/projects.js";
import {clearWithUndo} from "@/undo.js";
import {dialog} from "@/dialogs/useDialog.js";
import {toast} from "@/toast.js";
import {HOST_NAME} from "@/host.js";

/**
 * The clean-up actions, the last group of the project chip's menu (ProjectChip.vue)
 */

function clearGeneratedImages() {
  const stores = [useGeneratedImagesStore(), useExploreImagesStore(), useUpscaledImagesStore(),
    useControlNetSweepStore()];

  if (!clearWithUndo(stores, `Cleared the ${VIEWS}. The files stay on disk.`))
    toast("There are no generated images to clear.");
}

async function deleteOutputs() {
  if (await dialog.confirm(`Permanently deletes every file and folder in the ${HOST_NAME} outputs directory, `
      + `including the images of the trays, the Compare tab and the Upscaled tab, and empties all tabs and trays. `
      + "This cannot be undone.", {title: "Delete all output files", okText: "Delete files", danger: true})) {
    clearViewsAndTrays();
    setTimeout(() => fetch("/image-bench/clear_outputs_dir", {method: "POST"}), 500);
  }
}

/**
 * @returns {Object[]} Context menu items (contextMenu.js), with their heading
 */
export function cleanUpItems() {
  const projects = useProjectsStore();

  return [
    {heading: "Clean up"},
    {icon: "broom", label: "Clear generated images", title: `Removes all images of the ${VIEWS}; trays, prompts `
      + "and parameters are kept, files stay on disk (Undo in the notice)", run: clearGeneratedImages},
    {icon: "nuke", label: projects.hasCurrent ? "Close and start a blank workspace" : "Start a blank workspace",
     title: "Clears all images, trays and prompts, randomizes the seed and closes the project; files stay on disk",
     run: () => startBlankWorkspace()},
    {icon: "trash", label: "Delete all output files…", danger: true,
     title: `Deletes the ${HOST_NAME} outputs directory; cannot be undone`, run: deleteOutputs}
  ];
}
