import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_TRAY} from "@/consts.js";
import {createImageStore} from "@/stores/imageStore.js";


export const useImageTrayStore = defineStore('imageTray', () => {
  const _store = createImageStore(KIND_TRAY);
  const _colors = ["#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6",
    "#bfef45", "#fabed4", "#469990", "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000", "#ffd8b1"]
  let _currentColor = 0;

  _store.applyPreset = ref();

  async function init() {
    const response = await fetch("/image-bench/image_tray");

    if (response.ok && response.headers.get("content-length") > 0) {
      const trayContent = await response.json();
      _store.images.value = trayContent.images;
    }
  }

  async function persist() {
    const trayContent = {version: 1, images: []};
    trayContent.images = [..._store.images.value];
    trayContent.images.forEach(i => delete i.selected);

    const payload = JSON.stringify(trayContent);
    await fetch("/image-bench/image_tray", {method: "post", body: payload});
  }

  async function addImage(imageData) {
    imageData = {...imageData};

    if (!_store.images.value.some(i => i.imagePath === imageData.imagePath)) {
      const prevImage = _store.images.value.at(-1);
      let color = _colors[_currentColor];

      if (prevImage) {
        const changeColor = !imageData.generationId || !prevImage.generationId
                                || imageData.generationId !== prevImage.generationId;

        if (changeColor)
          color = _colors[++_currentColor % _colors.length];
      }

      imageData.tagColor = color;
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
