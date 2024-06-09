import {reactive, ref} from 'vue'
import {defineStore} from 'pinia'
import {KIND_EXPLORE} from "@/consts.js";
import {createImageData} from "@/utils.js";

export const useExploreImagesStore = defineStore('exploreImages', () => {
    const kind = KIND_EXPLORE;
    const images = ref([]);

    function onSDEvent(e) {
        const imageData = createImageData(e);

        let model = images.value.find(m => m.hash === imageData.parameters["model hash"]);

        if (!model) {
            model = reactive({name: imageData.parameters["model"], hash: imageData.parameters["model hash"], images: []});
            images.value.push(model);
        }

        model.images.push(imageData);
    }

    function clear() {
        images.value = [];
    }

    return { onSDEvent, kind, images, clear };
})
