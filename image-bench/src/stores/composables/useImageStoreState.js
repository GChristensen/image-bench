import { ref, shallowRef, triggerRef } from 'vue';
import { addImage, isImageEvent } from '@/stores/utils.js';

/**
 * Composable for shared image store state and actions
 * Replaces the factory pattern with proper composable pattern
 * Uses shallowRef for images array to optimize performance with large lists
 */
export function useImageStoreState(kind) {
  // State - using shallowRef for performance with large arrays
  const images = shallowRef([]);
  const generationInProgress = ref(false);
  const generationProgress = ref(0);
  const applyPreset = ref(null);

  // Actions
  async function init() {
    // Base implementation - can be overridden
  }

  function onSDEvent(e) {
    if (isImageEvent(e)) {
      if (e.hasOwnProperty('progress')) {
        generationProgress.value = e.progress;
        delete e.progress;
      }

      addImage(e, images);
      // Note: triggerRef is now called inside addImage utility
    } else if (e.type === 'GENERATION_PROGRESS') {
      generationProgress.value = e.progress;
    } else if (e.type === 'GENERATION_FINISHED') {
      generationProgress.value = 100;
      generationInProgress.value = false;
    }
  }

  function startingGeneration() {
    generationProgress.value = 0;
    generationInProgress.value = true;
  }

  function clear() {
    images.value = [];
    // Trigger reactivity for shallowRef
    triggerRef(images);
  }

  function resetProgress() {
    generationProgress.value = 0;
    generationInProgress.value = false;
  }

  return {
    // State
    kind,
    images,
    generationInProgress,
    generationProgress,
    applyPreset,
    
    // Actions
    init,
    clear,
    startingGeneration,
    onSDEvent,
    resetProgress
  };
}
