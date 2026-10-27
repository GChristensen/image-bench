import {computed, reactive} from "vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useControlNetSweepStore} from "@/stores/controlnetSweep.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";

/**
 * The run in progress, for its indicator on the tab that started it (App.vue): the ring around the tab icon, whose
 * middle click stops the run
 */

// Set by the Generate tab: a single image of its own is generated, a batch runs until stopped
export const generateRun = reactive({single: false, forever: false});

/**
 * @returns {import("vue").ComputedRef<null|{tabId: string, progress: number|null, completed: number, total: number,
 *   forever: boolean}>} progress is null while it is unknown (the ring spins)
 */
export function useActiveRun() {
  const generated = useGeneratedImagesStore();
  const explore = useExploreImagesStore();
  const upscaled = useUpscaledImagesStore();
  const sweep = useControlNetSweepStore();
  const sdWebUI = useSDWebUIStateStore();

  const ofStore = (tabId, store, forever = false) => ({tabId, forever,
    progress: forever ? null : store.generationProgress || 0,
    completed: store.generationCompleted || 0, total: store.generationTotal || 0});

  return computed(() => {
    if (explore.generationInProgress)
      return ofStore("explore-tab", explore);

    if (sweep.generationInProgress)
      return ofStore("controlnet-tab", sweep);

    if (upscaled.generationInProgress)
      return ofStore("upscaled-images-tab", upscaled);

    // Batches, variations and the generations of the image actions
    if (generated.generationInProgress)
      return ofStore("generate-tab", generated, generateRun.forever);

    // One image of the Generate tab, or a generation started in the host page
    if (generateRun.single || sdWebUI.busy)
      return {tabId: "generate-tab", progress: sdWebUI.live?.active ? sdWebUI.live.progress : null, completed: 0,
        total: 0, forever: false};

    return null;
  });
}
