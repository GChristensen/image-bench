import { triggerRef } from 'vue';
import { useImageStoreState } from './useImageStoreState.js';
import { useDebounce } from '@/composables/useDebounce.js';
import { pickTagColor } from './tagColors.js';

/**
 * Composable for tray-specific store state and actions
 * Extends the base image store with persistence and color tagging
 * Uses debouncing for persist operations to reduce server load
 */
export function useTrayStoreState(kind) {
  const baseStore = useImageStoreState(kind);
  const { debounce } = useDebounce();

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

    // Update the sent images with backend's modified data (contains updated paths after file copying);
    // they are updated in place, so images added or removed while saving are kept as they are
    if (response.ok) {
      try {
        const updatedTray = await response.json();
        if (updatedTray?.images?.length === trayContent.images.length) {
          trayContent.images.forEach((image, index) => Object.assign(image, updatedTray.images[index]));
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

  // Images keep their original path in sourcePath after being copied to the tray directory
  function isInTray(imageData) {
    return baseStore.images.value.some(i =>
      (i.sourcePath || i.imagePath) === imageData.imagePath || i.imagePath === imageData.imagePath);
  }

  async function addImage(imageData) {
    imageData = { ...imageData };

    if (!isInTray(imageData)) {
      imageData.tagColor = pickTagColor(baseStore.images.value, imageData);
      baseStore.images.value.push(imageData);
      await persist();
    }
  }

  // Color-tag and save an image already added to the images (e.g. by onSDEvent)
  async function colorAndPersist(image) {
    const images = baseStore.images.value;
    image.tagColor = pickTagColor(images.slice(0, images.indexOf(image)), image);
    await persist();
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
    colorAndPersist,
    persist,
    clear
  };
}
