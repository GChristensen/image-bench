import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_GENERATED} from "@/consts.js";
import {createImageStore} from "@/stores/imageStore.js";

export const useGeneratedImagesStore = defineStore('generatedImages', () => {
    const applyPreset = ref();

    return {...createImageStore(KIND_GENERATED), applyPreset};
})
