import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_TRAY} from "@/consts.js";
import {createImageStore} from "@/stores/imageStore.js";

export const useImageTrayStore = defineStore('imageTray', () => {
  const _store = createImageStore(KIND_TRAY);

  _store.applyPreset = ref();

  async function init() {
    const response = await fetch("/image-bench/image_tray");

    if (response.ok && response.headers.get("content-length") > 0) {
      const trayContent = await response.json();
      _store.images.value = trayContent.images;
    }
  }

  async function persist() {
    const trayContent = {images: []};
    trayContent.images = [..._store.images.value];
    trayContent.images.forEach(i => delete i.selected);

    const payload = JSON.stringify(trayContent);
    await fetch("/image-bench/image_tray", {method: "post", body: payload});
  }

  async function addImage(imageData) {
    if (!_store.images.value.some(i => i.imagePath === imageData.imagePath)) {
      _store.images.value.push(imageData);
      await persist();
    }
  }

  async function clear() {
    _store.images.value = [];
    await persist();
  }

  return { ..._store, init, addImage, persist, clear };
})
