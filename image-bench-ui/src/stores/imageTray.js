import { defineStore } from 'pinia'
import {KIND_IMAGE_TRAY} from "@/consts.js";
import {createTrayStore} from "@/stores/trayStore.js";


export const useImageTrayStore = defineStore('imageTray', () => {
  return createTrayStore(KIND_IMAGE_TRAY);
});
