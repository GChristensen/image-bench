import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_GENERATED} from "@/consts.js";
import {addImage} from "@/stores/utils.js";

export const useGeneratedImagesStore = defineStore('generatedImages', () => {
    const kind = KIND_GENERATED;
    const images = ref([]);

    function onSDEvent(e) {
        addImage(e, images);
    }

    function clear() {
        images.value = [];
    }

    return { kind, images, clear, onSDEvent };
})
