import { defineStore } from 'pinia'
import {KIND_CONCEPT_TRAY} from "@/consts.js";
import {createTrayStore} from "@/stores/trayStore.js";

export const useConceptTrayStore = defineStore('upscaleTray', () => {
  return createTrayStore(KIND_CONCEPT_TRAY);
});
