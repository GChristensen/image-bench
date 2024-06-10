import {reactive, ref} from 'vue'
import {defineStore} from 'pinia'
import {KIND_EXPLORE} from "@/consts.js";
import {createImageData} from "@/sdwebui.js";
import {addImage} from "@/stores/utils.js";

export const useExploreImagesStore = defineStore('exploreImages', () => {
    const kind = KIND_EXPLORE;
    const images = ref([]);
    const generationInProgress = ref(false);
    const generationProgress = ref(0);

    function onSDEvent(e) {
        if (e.type === "SAVED_IMAGE") {
            const imageData = createImageData(e);

            let model = images.value.find(m => m.hash === imageData.parameters["model hash"]);

            if (!model) {
                model = reactive({
                    name: imageData.parameters["model"],
                    hash: imageData.parameters["model hash"],
                    images: []
                });
                images.value.push(model);
            }

            model.images.push(imageData);
        }
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

    return { kind, images, generationInProgress, generationProgress, onSDEvent, clear };
})
