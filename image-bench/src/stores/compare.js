import { computed, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { KIND_COMPARE } from "@/consts.js";
import { useTrayStoreState } from "@/stores/composables/useTrayStoreState.js";

/**
 * Images of the Compare tab, saved like the trays. Images sent from Photoshop are added to the store file
 * by the backend and arrive as COMPARE_IMAGE while the popup is open.
 */
export const useCompareStore = defineStore('compare', () => {
  const state = useTrayStoreState(KIND_COMPARE);

  const imageCount = computed(() => state.images.value.length);

  // Move an image to another position in the sequence
  function moveImage(from, to) {
    const images = state.images.value;

    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length)
      return;

    const [image] = images.splice(from, 1);
    images.splice(to, 0, image);
    state.persist();
  }

  function removeImage(image) {
    image = toRaw(image);
    state.images.value = state.images.value.filter(i => toRaw(i) !== image);
    state.persist();
  }

  function removeImages(predicate) {
    state.images.value = state.images.value.filter(image => !predicate(image));
    state.persist();
  }

  // Images uploaded or sent from Photoshop are already in the compare directory
  function onSDEvent(e) {
    if (e.type === "COMPARE_IMAGE" && e.image)
      state.addImage(e.image);
  }

  return {
    ...state,
    imageCount,
    moveImage,
    removeImage,
    removeImages,
    onSDEvent
  };
});
