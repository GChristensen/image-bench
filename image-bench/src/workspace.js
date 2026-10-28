import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useCompareStore} from "@/stores/compare.js";
import {useControlNetSweepStore} from "@/stores/controlnetSweep.js";
import {useProjectsStore} from "@/stores/projects.js";
import {usePromptHistoryStore} from "@/stores/promptHistory.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {ensureGenerationIdle} from "@/sdwebui.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {HOST_NAME, isWebUI} from "@/host.js";

/**
 * Clearing the workspace: the clean-up actions of the project chip's menu (cleanUp.js)
 */

// The views that are not trays, as named in the confirmations
export const VIEWS = "Generated, Explore and Upscaled tabs and the ControlNet sweep";

// Key used by webui-extension/javascript/persistence.js; the popup shares the WebUI origin
const GENERATION_PARAMS_KEY = "image-bench-generation-params";

/**
 * Clear the prompts of both tabs in the parameters WebUI restores on a page reload, keeping the other parameters
 * (the seeds are not saved there)
 */
function clearSavedPrompts() {
  const storage = useLocalStorage();
  const params = storage.getJsonItem(GENERATION_PARAMS_KEY);

  if (!params)
    return;

  for (const tab of ["txt2img", "img2img"])
    if (params[tab])
      Object.assign(params[tab], {prompt: "", negativePrompt: ""});

  storage.setJsonItem(GENERATION_PARAMS_KEY, params);
}

export function clearViewsAndTrays() {
  useExploreImagesStore().clear();
  useGeneratedImagesStore().clear();
  useUpscaledImagesStore().clear();
  useControlNetSweepStore().clear();
  useImageTrayStore().clear();
  useConceptTrayStore().clear();
  useCompareStore().clear();
}

/**
 * Start a new piece of work, after a confirmation: no images, empty prompts, a random seed, and no current project,
 * so that the empty workspace is not taken for changes of the project it was. The other parameters are kept.
 * Unsaved changes of the current project may be saved first
 * @param {{keepParams?: boolean}} options - keepParams: keep the prompts and the seed (a new start in the Generate
 *   tab, ProjectCube.vue)
 * @returns {Promise<boolean>} Whether the workspace was cleared
 */
export async function startBlankWorkspace({keepParams = false} = {}) {
  const projects = useProjectsStore();

  await projects.loadCurrent();

  const name = projects.current.name;
  const project = !projects.hasCurrent ? ""
    : projects.unsaved ? ` The current project "${name}" is closed: its unsaved changes are lost unless you save them first.`
    : ` The current project "${name}" is closed (its saved state is kept).`;

  const params = keepParams ? "clears the prompt history (the prompts and parameters are kept)"
    : `clears the prompts and their history and sets a random seed in ${HOST_NAME}`;

  const answer = await dialog.confirm(`Removes all images from the ${VIEWS}, empties the image and concept trays and `
      + `the Compare tab, ${params}.${project} No files are deleted from disk.`,
    {title: projects.hasCurrent ? `Close ${name}` : "Start a blank workspace", okText: "Clear", danger: true,
     actions: projects.hasCurrent && projects.unsaved ? [{id: "save", label: "Save and clear"}] : []});

  if (!answer || !await ensureGenerationIdle())
    return false;

  if (answer === "save" && !await projects.save())
    return false;

  clearViewsAndTrays();
  usePromptHistoryStore().clear();

  if (!keepParams) {
    useWebUIBridge().setWebUIParams({prompt: "", negativePrompt: "", seed: -1,
                                     ...(isWebUI ? {subseed: -1, subseedStrength: 0} : {})});

    if (isWebUI)
      clearSavedPrompts();
  }

  if (projects.hasCurrent)
    await projects.close();

  return true;
}