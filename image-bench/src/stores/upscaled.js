import { computed } from 'vue'
import { defineStore } from 'pinia'
import { KIND_UPSCALED } from "@/consts.js";
import { useImageStoreState } from "@/stores/composables/useImageStoreState.js";

/**
 * Store for upscaled images
 * Uses proper Pinia store pattern with composable for shared logic
 */
export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
  const state = useImageStoreState(KIND_UPSCALED);

  // Getters
  const hasImages = computed(() => state.images.value.length > 0);
  const imageCount = computed(() => state.images.value.length);
  const isGenerating = computed(() => state.generationInProgress.value);

  return {
    // Expose state
    ...state,
    
    // Expose getters
    hasImages,
    imageCount,
    isGenerating
  };
})
