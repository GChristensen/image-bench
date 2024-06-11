import {ref} from 'vue'
import { defineStore } from 'pinia'
import {KIND_GENERATED} from "@/consts.js";
import {addImage, isImageEvent} from "@/stores/utils.js";

export const useGeneratedImagesStore = defineStore('generatedImages', () => {
    const kind = KIND_GENERATED;
    const images = ref([]);
    const generationInProgress = ref(false);
    const generationProgress = ref(0);

    function onSDEvent(e) {
        if (isImageEvent(e)) {
            generationProgress.value = e.progress;
            delete e.progress;

            addImage(e, images);
        }
        else if (e.type === "GENERATION_FINISHED") {
            generationProgress.value = 100;
            generationInProgress.value = false;
        }
    }

    function clear() {
        images.value = [];
    }

    return { kind, images, generationInProgress, generationProgress, clear, onSDEvent };
})
