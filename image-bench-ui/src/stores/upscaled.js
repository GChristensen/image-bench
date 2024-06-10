import {ref} from 'vue'
import {defineStore} from 'pinia'
import {KIND_UPSCALED} from "@/consts.js";
import {addImage} from "@/stores/utils.js";

export const useUpscaledImagesStore = defineStore('upscaledImages', () => {
    const kind = KIND_UPSCALED;
    const images = ref([]);
    const generationInProgress = ref(false);
    const generationProgress = ref(0);

    function onSDEvent(e) {
        if (e.type === "SAVED_IMAGE")
            addImage(e, images);
        else if (e.type === "GENERATION_PROGRESS")
            generationProgress.value = e.progress;
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
