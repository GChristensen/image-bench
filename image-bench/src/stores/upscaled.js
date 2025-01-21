import {defineStore} from 'pinia'
import {KIND_UPSCALED} from "@/consts.js";
import {createImageStore} from "@/stores/imageStore.js";

export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
    return createImageStore(KIND_UPSCALED);
})
