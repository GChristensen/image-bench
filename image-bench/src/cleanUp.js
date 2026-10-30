import {clearViewsAndTrays, startBlankWorkspace} from "@/workspace.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useControlNetSweepStore} from "@/stores/controlnetSweep.js";
import {useProjectsStore} from "@/stores/projects.js";
import {clearWithUndo} from "@/undo.js";
import {dialog} from "@/dialogs/useDialog.js";
import {toast} from "@/toast.js";
import {HOST_NAME} from "@/host.js";

/**
 * The clean-up actions, the last group of the project chip's menu (ProjectChip.vue)
 */

// The views cleared by Clear generated images; Upscaled, Compare and the trays are kept
const GENERATED_VIEWS = "Generated and Explore tabs and the ControlNet sweep";

function clearGeneratedImages() {
  const stores = [useGeneratedImagesStore(), useExploreImagesStore(), useControlNetSweepStore()];

  if (!clearWithUndo(stores, `Cleared the ${GENERATED_VIEWS}. Output images stay on disk.`))
    toast("There are no generated images to clear.");
}

async function deleteOutputs() {
  if (await dialog.confirm(`Deletes all files and folders in the ${HOST_NAME} output folder and clears the `
      + "workspace. This cannot be undone.", {title: "Delete all output files", okText: "Delete files", danger: true})) {
    clearViewsAndTrays();
    setTimeout(() => fetch("/image-bench/clear_outputs_dir", {method: "POST"}), 500);
  }
}

/**
 * With a current project, starting a blank workspace is the chip's Close, after Save
 * @returns {Object[]} Context menu items (contextMenu.js), with their heading
 */
export function cleanUpItems() {
  const projects = useProjectsStore();

  return [
    {heading: "Clean up"},
    {icon: "broom", label: "Clear generated images",
     title: `Clears the ${GENERATED_VIEWS}, keeps Upscaled, Compare and the trays; output images stay on disk`,
     run: clearGeneratedImages},
    ...projects.hasCurrent ? [] : [
      {icon: "nuke", label: "Start a blank workspace", title: "Clears the workspace; output images stay on disk",
       run: () => startBlankWorkspace()}],
    {icon: "trash", label: "Delete all output files…", danger: true,
     title: `Deletes all files and folders in the ${HOST_NAME} output folder; cannot be undone`, run: deleteOutputs}
  ];
}
