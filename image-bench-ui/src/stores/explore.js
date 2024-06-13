import {reactive, ref} from 'vue'
import {defineStore} from 'pinia'
import {KIND_EXPLORE} from "@/consts.js";
import {createImageData} from "@/sdwebui.js";
import {createImageStore} from "@/stores/imageStore.js";

export const useExploreImagesStore = defineStore('exploreImages', () => {
    const _store = createImageStore(KIND_EXPLORE);

    function onSDEvent(e) {
        if (e.type === "SAVED_IMAGE") {
            const imageData = createImageData(e);
            delete imageData.type;

            let model = _store.images.value.find(m => m.name === imageData.parameters["model"]);

            if (!model) {
                model = reactive({
                    name: imageData.parameters["model"],
                    hash: imageData.parameters["model hash"],
                    images: []
                });
                _store.images.value.push(model);
            }

            model.images.push(imageData);
        }
        else if (e.type === "GENERATION_PROGRESS")
            _store.generationProgress.value = e.progress;
        else if (e.type === "GENERATION_FINISHED") {
            _store.generationProgress.value = 100;
            _store.generationInProgress.value = false;
        }
    }

    return { ..._store, onSDEvent };
})
