import { ref } from 'vue';
import { addImage, isImageEvent } from '@/stores/utils.js';

export function useImageStoreState(kind) {
  const images = ref([]);
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
