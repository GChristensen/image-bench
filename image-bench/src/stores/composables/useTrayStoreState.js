import { toRaw, triggerRef } from 'vue';
import { useImageStoreState } from './useImageStoreState.js';
import { pickTagColor } from './tagColors.js';
import { onBackendReconnected } from '@/backendStatus.js';

const PERSIST_DELAY = 500;

// Called with the kind of a tray after it was saved on the server (the Library tracks the unsaved changes)
const persistListeners = new Set();

/**
 * @param {(kind: string) => void} listener
 */
export function onTrayPersisted(listener) {
  persistListeners.add(listener);
}

/**
 * Composable for tray-specific store state and actions
 * Extends the base image store with persistence and color tagging
 * Uses debouncing for persist operations to reduce server load
 */
export function useTrayStoreState(kind) {
  const baseStore = useImageStoreState(kind);
  let persistTimer = null;
  let persisting = Promise.resolve();

  // Override init to load from server
  async function init() {
    const response = await fetch(`/image-bench/${kind}`);

    if (response.ok && response.headers.get('content-length') > 0) {
      const trayContent = await response.json();
      baseStore.images.value = trayContent.images;
    }
  }

  // Whether the last save failed (the backend was down): saved again when the backend is back
  let dirty = false;

  onBackendReconnected(() => dirty && !persistTimer && (persisting = _persistToServer()));

  // Internal persist function; a failed save leaves the tray dirty
  async function _persistToServer() {
    try {
      dirty = !await _sendToServer();
    } catch (error) {
      console.error(`[Image Bench] Failed to save the ${kind}:`, error);
      dirty = true;
    }
  }

  // Returns whether the server saved the tray
  async function _sendToServer() {
    const trayContent = { version: 1, images: [] };
    trayContent.images = [...baseStore.images.value];

    // The selection is not saved, but kept in the view (images arrive while upscaled ones are selected)
    const payload = JSON.stringify(trayContent, (key, value) => key === "selected" ? undefined : value);
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

      persistListeners.forEach(listener => listener(kind));
    }

    return response.ok;
  }

  // Debounced to reduce server calls
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persisting = _persistToServer();
    }, PERSIST_DELAY);
  }

  // Save a pending change at once (before a project is saved or opened)
  async function flush() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
      persisting = _persistToServer();
    }

    await persisting;

    if (dirty)
      throw new Error(`The ${kind.replace("_", " ")} could not be saved. Try again when the server is running.`);
  }

  // Images keep their original path in sourcePath after being copied to the tray directory
  // (a copy in another tray or the Compare tab has the same one)
  function findInTray(imageData) {
    const source = imageData.sourcePath || imageData.imagePath;

    return baseStore.images.value.find(i =>
      (i.sourcePath || i.imagePath) === source || i.imagePath === imageData.imagePath);
  }

  async function addImage(imageData) {
    const existing = findInTray(imageData);

    // An image added again brings its marking to the copy in the tray
    if (existing) {
      if (imageData.marking)
        syncMarking(imageData);
      return;
    }

    imageData = { ...imageData };
    // A selected image (e.g. dragged with others) does not arrive selected
    delete imageData.selected;

    imageData.tagColor = pickTagColor(baseStore.images.value, imageData);
    baseStore.images.value.push(imageData);
    await persist();
  }

  // A marking set or removed outside the trays goes to the copy of the image in the tray, if any
  function syncMarking(imageData) {
    const image = findInTray(imageData);

    if (!image || image.marking === imageData.marking)
      return;

    if (imageData.marking)
      image.marking = imageData.marking;
    else
      delete image.marking;

    persist();
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

  // Move images (dragged cards) before or after the target image, keeping their order
  function moveImages(images, target, after) {
    const moved = new Set(images.map(i => toRaw(i)));
    target = toRaw(target);

    if (moved.has(target))
      return;

    const all = baseStore.images.value;
    const rest = all.filter(i => !moved.has(toRaw(i)));
    const index = rest.findIndex(i => toRaw(i) === target);

    if (index < 0)
      return;

    rest.splice(after ? index + 1 : index, 0, ...all.filter(i => moved.has(toRaw(i))));
    baseStore.images.value = rest;
    persist();
  }

  return {
    ...baseStore,

    // Tray-specific actions
    init,
    addImage,
    moveImages,
    syncMarking,
    colorAndPersist,
    persist,
    flush,
    clear
  };
}
