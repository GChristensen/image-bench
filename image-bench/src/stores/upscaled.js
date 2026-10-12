import { computed } from 'vue'
import { defineStore } from 'pinia'
import { KIND_UPSCALED } from "@/consts.js";
import { useImageStoreState } from "@/stores/composables/useImageStoreState.js";
import { pickTagColor } from "@/stores/composables/tagColors.js";

/**
 * Store for upscaled images
 * Uses proper Pinia store pattern with composable for shared logic
 */
export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
  const state = useImageStoreState(KIND_UPSCALED);

  // Images are color-tagged by generation like in the trays
  function onSDEvent(e) {
    state.onSDEvent(e);

    if (e.type === "SAVED_IMAGE") {
      const images = state.images.value;
      const image = images.at(-1);
      image.tagColor = pickTagColor(images.slice(0, -1), image);
    }
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
