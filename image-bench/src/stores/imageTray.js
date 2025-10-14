import { computed } from 'vue'
import { defineStore } from 'pinia'
import { KIND_IMAGE_TRAY } from "@/consts.js";
import { useTrayStoreState } from "@/stores/composables/useTrayStoreState.js";

/**
 * Store for image tray
 * Uses proper Pinia store pattern with composable for shared logic
 */
export const useImageTrayStore = defineStore('imageTray', () => {
  const state = useTrayStoreState(KIND_IMAGE_TRAY);

  // Getters
  const hasImages = computed(() => state.images.value.length > 0);
  const imageCount = computed(() => state.images.value.length);
  const selectedCount = computed(() => state.images.value.filter(i => i.selected).length);

  return {
    // Expose state
    ...state,
    
    // Expose getters
    hasImages,
    imageCount,
    selectedCount
  };
});
