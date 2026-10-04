import { triggerRef } from 'vue';
import { useImageStoreState } from './useImageStoreState.js';
import { useDebounce } from '@/composables/useDebounce.js';

/**
 * Composable for tray-specific store state and actions
 * Extends the base image store with persistence and color tagging
 * Uses debouncing for persist operations to reduce server load
 */
export function useTrayStoreState(kind) {
  const baseStore = useImageStoreState(kind);
  const { debounce } = useDebounce();
  
  const colors = ["#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6",
    "#bfef45", "#fabed4", "#469990", "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000", "#ffd8b1"];

  // Override init to load from server
  async function init() {
    const response = await fetch(`/image-bench/${kind}`);

    if (response.ok && response.headers.get('content-length') > 0) {
      const trayContent = await response.json();
      baseStore.images.value = trayContent.images;
    }
  }

  // Internal persist function
  async function _persistToServer() {
    const trayContent = { version: 1, images: [] };
    trayContent.images = [...baseStore.images.value];
    trayContent.images.forEach(i => delete i.selected);

    const payload = JSON.stringify(trayContent);
    const response = await fetch(`/image-bench/${kind}`, { method: 'post', body: payload });

    // Update store with backend's modified data (contains updated paths after file copying)
    if (response.ok) {
      try {
        const updatedTray = await response.json();
        if (updatedTray && updatedTray.images) {
          baseStore.images.value = updatedTray.images;
          triggerRef(baseStore.images);
        }
      } catch (error) {
        console.error('[Image Bench] Failed to parse persist response:', error);
        // Continue anyway - persist succeeded even if parsing failed
      }
    }
  }

  // Debounced persist function to reduce server calls
  const persist = debounce(_persistToServer, 500);

  // Strategy generationId spans the whole Image Bench run (several ComfyUI prompts),
  // batchId identifies a single platform generation (including native Generate clicks)
  function getBatchKey(image) {
    return image.generationId || image.batchId;
  }

  // Images keep their original path in sourcePath after being copied to the tray directory
  function isInTray(imageData) {
    return baseStore.images.value.some(i =>
      (i.sourcePath || i.imagePath) === imageData.imagePath || i.imagePath === imageData.imagePath);
  }

  function pickColor(imageData) {
    const images = baseStore.images.value;
    const batchKey = getBatchKey(imageData);

    if (batchKey) {
      const batchImage = images.findLast(i => i.tagColor && getBatchKey(i) === batchKey);

      if (batchImage)
        return batchImage.tagColor;
    }

    const lastColorIndex = colors.indexOf(images.findLast(i => i.tagColor)?.tagColor);
    return colors[(lastColorIndex + 1) % colors.length];
  }

  async function addImage(imageData) {
    imageData = { ...imageData };

    if (!isInTray(imageData)) {
      imageData.tagColor = pickColor(imageData);
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
