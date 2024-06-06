import {ref, computed, reactive} from 'vue'
import { defineStore } from 'pinia'

export const useImageTrayStore = defineStore('imageTray', () => {
  const trayContent = reactive({images: []});

  async function init() {
    const response = await fetch("http://" + location.host + "/image-bench/image_tray");

    if (response.ok && response.headers.get("content-length") > 0) {
      Object.assign(trayContent, await response.json());
    }
  }

  async function writeContents() {
    const content = JSON.stringify(trayContent);
    await fetch("http://" + location.host + "/image-bench/image_tray", {method: "post", body: content});
  }

  async function addImage(imageData) {
    trayContent.images.push(imageData);
    await writeContents();
  }

  return { init, content: trayContent, addImage, persist: writeContents }
})
