import {computed, reactive, watch} from "vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useControlNetSweepStore} from "@/stores/controlnetSweep.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {isWebUI} from "@/host.js";
import {jobProgress, pollJobProgress} from "@/jobProgress.js";

/**
 * The run in progress, for its indicator on the tab that started it (App.vue): the ring around the tab icon, whose
 * middle click stops the run
 */

// Set by the Generate tab: a single image of its own is generated, a batch of its own runs (batch), until stopped
// (forever)
export const generateRun = reactive({single: false, batch: false, forever: false});

/**
 * @returns {import("vue").ComputedRef<null|{tabId: string, progress: number|null, image: number|null,
 *   completed: number, total: number, forever: boolean, multi: boolean}>} progress (of the run) is null while it is
 *   unknown (the ring spins), image is the progress of the image being generated (null while unknown), multi tells
 *   a run of several images from a single one
 */
export function useActiveRun() {
  const generated = useGeneratedImagesStore();
  const explore = useExploreImagesStore();
  const upscaled = useUpscaledImagesStore();
  const sweep = useControlNetSweepStore();
  const sdWebUI = useSDWebUIStateStore();

  const liveImage = () => sdWebUI.live?.active ? sdWebUI.live.progress : null;

  // A batch of the Generate tab is one WebUI job of all its images: its progress is polled from the server
  const webUIBatch = () => isWebUI && generated.generationInProgress && generateRun.batch && !generateRun.forever;
  watch(webUIBatch, pollJobProgress, {immediate: true});

  // The strategies report the progress per finished image; the progress of the image being generated is blended in,
  // so that the run moves smoothly (max: some strategies already include it)
  function ofStore(tabId, store, forever = false, job = false) {
    const image = job ? jobProgress.value?.image ?? null : liveImage();
    const completed = store.generationCompleted || 0;
    const total = store.generationTotal || 0;
    let progress = store.generationProgress || 0;

    if (job && jobProgress.value)
      progress = Math.max(progress, jobProgress.value.overall);
    else if (total > 0 && image !== null)
      progress = Math.min(100, Math.max(progress, (completed + image / 100) / total * 100));

    // A run of one image (e.g. one upscale) shows no image progress apart from the run's
    return {tabId, forever, multi: forever || total !== 1, image, completed, total,
      progress: forever ? null : progress};
  }

  // The progress of a run never goes back (events out of order, an image counted before the next one starts)
  let last = null;

  function forward(run) {
    // Another run: of another tab, kind or number of images, or counted from the start again
    const same = last && run && last.tabId === run.tabId && last.multi === run.multi && last.total === run.total
      && run.completed >= last.completed;

    if (same && last.progress !== null && run.progress !== null && run.progress < last.progress)
      run = {...run, progress: last.progress};

    last = run && {tabId: run.tabId, multi: run.multi, total: run.total, completed: run.completed,
      progress: run.progress};
    return run;
  }

  return computed(() => forward(currentRun()));

  function currentRun() {
    if (explore.generationInProgress)
      return ofStore("explore-tab", explore);

    if (sweep.generationInProgress)
      return ofStore("controlnet-tab", sweep);

    if (upscaled.generationInProgress)
      return ofStore("upscaled-images-tab", upscaled);

    // Batches, variations and the generations of the image actions
    if (generated.generationInProgress)
      return ofStore("generate-tab", generated, generateRun.forever, webUIBatch());

    // One image of the Generate tab, or a generation started in the host page
    if (generateRun.single || sdWebUI.busy)
      return {tabId: "generate-tab", progress: liveImage(), image: liveImage(), completed: 0, total: 0,
        forever: false, multi: false};

    return null;
  }
}

/**
 * The run in progress if the tab started it, else null
 * @param {string} tabId
 */
export function useTabRun(tabId) {
  const run = useActiveRun();
  return computed(() => run.value?.tabId === tabId ? run.value : null);
}
