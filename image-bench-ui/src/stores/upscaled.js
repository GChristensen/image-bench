import {ref} from 'vue'
import {defineStore} from 'pinia'
import {KIND_UPSCALED} from "@/consts.js";
import {addImage} from "@/stores/utils.js";

export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
    const kind = KIND_UPSCALED;
    const images = ref([]);

    function onSDEvent(e) {
        addImage(e, images);
    }

    function clear() {
        images.value = [];
    }

    return { kind, images, clear, onSDEvent };
})
