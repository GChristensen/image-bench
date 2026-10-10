import { ref } from 'vue';
import { addImage, isImageEvent } from '@/stores/utils.js';

export function useImageStoreState(kind) {
  const images = ref([]);
  const generationInProgress = ref(false);
  const generationProgress = ref(0);
  // Completed/total images, when the strategy knows the number of images to generate
  const generationCompleted = ref(0);
  const generationTotal = ref(0);
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
      setProgress(e);
    } else if (e.type === 'GENERATION_FINISHED') {
      generationProgress.value = 100;
      generationInProgress.value = false;
    }
  }

  function setProgress(e) {
    generationProgress.value = e.progress;

    if (e.total) {
      generationCompleted.value = e.completed;
      generationTotal.value = e.total;
    }
  }

  function startingGeneration() {
    generationProgress.value = 0;
    generationCompleted.value = 0;
    generationTotal.value = 0;
    generationInProgress.value = true;
  }

  function clear() {
    images.value = [];
  }

  function resetProgress() {
    generationProgress.value = 0;
    generationCompleted.value = 0;
    generationTotal.value = 0;
    generationInProgress.value = false;
  }

  return {
    // State
    kind,
    images,
    generationInProgress,
    generationProgress,
    generationCompleted,
    generationTotal,
    applyPreset,
    
    // Actions
    init,
    clear,
    startingGeneration,
    onSDEvent,
    setProgress,
    resetProgress
  };
}
