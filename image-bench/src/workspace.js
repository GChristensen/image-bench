import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useCompareStore} from "@/stores/compare.js";
import {useProjectsStore} from "@/stores/projects.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {ensureGenerationIdle} from "@/sdwebui.js";
import {dialog} from "@/dialogs/useDialog.js";
import {HOST_NAME, isWebUI} from "@/host.js";

/**
 * Clearing the workspace: the clean-up actions (ActionsModal.vue) and closing the current project (ProjectChip.vue)
 */

// The views that are not trays, as named in the confirmations
export const VIEWS = "Generated, Explore and Upscaled tabs";

export function clearViews() {
  useExploreImagesStore().clear();
  useGeneratedImagesStore().clear();
  useUpscaledImagesStore().clear();
}

export function clearViewsAndTrays() {
  clearViews();
  useImageTrayStore().clear();
  useConceptTrayStore().clear();
  useCompareStore().clear();
}

/**
 * Start a new piece of work, after a confirmation: no images, empty prompts, a random seed, and no current project,
 * so that the empty workspace is not taken for changes of the project it was. The other parameters are kept.
 * Unsaved changes of the current project may be saved first
 * @returns {Promise<boolean>} Whether the workspace was cleared
 */
export async function startBlankWorkspace() {
  const projects = useProjectsStore();

  await projects.loadCurrent();

  const name = projects.current.name;
  const project = !projects.hasCurrent ? ""
    : projects.unsaved ? ` The current project "${name}" is closed: its unsaved changes are lost unless you save them first.`
    : ` The current project "${name}" is closed (its saved state is kept).`;

  const answer = await dialog.confirm(`Removes all images from the ${VIEWS}, empties the image and concept trays and `
      + `the Compare tab, clears the prompts and sets a random seed in ${HOST_NAME}.${project} No files are deleted from disk.`,
    {title: projects.hasCurrent ? `Close ${name}` : "Start a blank workspace", okText: "Clear", danger: true,
     actions: projects.hasCurrent && projects.unsaved ? [{id: "save", label: "Save and clear"}] : []});

  if (!answer || !await ensureGenerationIdle())
    return false;

  if (answer === "save" && !await projects.save())
    return false;

  clearViewsAndTrays();
  useWebUIBridge().setWebUIParams({prompt: "", negativePrompt: "", seed: -1,
                                   ...(isWebUI ? {subseed: -1, subseedStrength: 0} : {})});

  if (projects.hasCurrent)
    await projects.close();

  return true;
}