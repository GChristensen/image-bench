import { useImageStoreState } from './useImageStoreState.js';

/**
 * Composable for tray-specific store state and actions
 * Extends the base image store with persistence and color tagging
 */
export function useTrayStoreState(kind) {
  const baseStore = useImageStoreState(kind);
  
  const colors = ["#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6",
    "#bfef45", "#fabed4", "#469990", "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000", "#ffd8b1"];
  let currentColor = 0;

  // Override init to load from server
  async function init() {
    const response = await fetch(`/image-bench/${kind}`);

    if (response.ok && response.headers.get('content-length') > 0) {
      const trayContent = await response.json();
      baseStore.images.value = trayContent.images;
    }
  }

  async function persist() {
    const trayContent = { version: 1, images: [] };
    trayContent.images = [...baseStore.images.value];
    trayContent.images.forEach(i => delete i.selected);

    const payload = JSON.stringify(trayContent);
    await fetch(`/image-bench/${kind}`, { method: 'post', body: payload });
  }

  async function addImage(imageData) {
    imageData = { ...imageData };

    if (!baseStore.images.value.some(i => i.imagePath === imageData.imagePath)) {
      const prevImage = baseStore.images.value.at(-1);
      let color = colors[currentColor];

      if (prevImage) {
        const changeColor = !imageData.generationId || !prevImage.generationId
          || imageData.generationId !== prevImage.generationId;

        if (changeColor) {
          color = colors[++currentColor % colors.length];
        }
      }

      imageData.tagColor = color;
      baseStore.images.value.push(imageData);
      await persist();
    }
  }

  async function clear() {
    baseStore.images.value = [];
    await persist();
  }

  return {
    ...baseStore,
    
    // Tray-specific actions
    init,
    addImage,
    persist,
    clear
  };
}
