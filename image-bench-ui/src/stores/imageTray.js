import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_TRAY} from "@/consts.js";

export const useImageTrayStore = defineStore('imageTray', () => {
  const kind = KIND_TRAY;
  const images = ref([]);

  async function init() {
    const response = await fetch("http://" + location.host + "/image-bench/image_tray");

    if (response.ok && response.headers.get("content-length") > 0) {
      const trayContent = await response.json();
      images.value = trayContent.images;
    }
  }

  async function persist() {
    const trayContent = {images: []};
    trayContent.images = images.value;

    const payload = JSON.stringify(trayContent);
    await fetch("http://" + location.host + "/image-bench/image_tray", {method: "post", body: payload});
  }

  async function addImage(imageData) {
    if (!images.value.some(i => i.imagePath === imageData.imagePath)) {
      images.value.push(imageData);
      await persist();
    }
  }

  async function clear() {
    images.value = [];
    await persist();
  }

  return { kind, init, images, addImage, persist, clear }
})
