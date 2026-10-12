import { computed } from 'vue'
import { defineStore } from 'pinia'
import { KIND_UPSCALED } from "@/consts.js";
import { useTrayStoreState } from "@/stores/composables/useTrayStoreState.js";

/**
 * Store for upscaled images
 * Persisted like the trays: the images are copied to image-bench/upscaled/ and kept across sessions
 */
export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
  const state = useTrayStoreState(KIND_UPSCALED);

  // Images are color-tagged by generation like in the trays, so batches need no separators
  function onSDEvent(e) {
    if (e.type === "BEGIN_PROCESSING")
      return;

    state.onSDEvent(e);

    if (e.type === "SAVED_IMAGE")
      state.colorAndPersist(state.images.value.at(-1));
  }

  // Getters
  const hasImages = computed(() => state.images.value.length > 0);
  const imageCount = computed(() => state.images.value.length);
  const isGenerating = computed(() => state.generationInProgress.value);

  return {
    // Expose state
    ...state,
    onSDEvent,

    // Expose getters
    hasImages,
    imageCount,
    isGenerating
  };
})
