import { computed } from 'vue'
import { defineStore } from 'pinia'
import { KIND_GENERATED } from "@/consts.js";
import { useImageStoreState } from "@/stores/composables/useImageStoreState.js";

/**
 * Store for generated images
 * Uses proper Pinia store pattern with composable for shared logic
 */
export const useGeneratedImagesStore = defineStore('generatedImages', () => {
  const state = useImageStoreState(KIND_GENERATED);

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
