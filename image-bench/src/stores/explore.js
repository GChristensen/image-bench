import {reactive, computed} from 'vue'
import {defineStore} from 'pinia'
import {KIND_EXPLORE} from "@/consts.js";
import {createImageData} from "@/sdwebui.js";
import {useImageStoreState} from "@/stores/composables/useImageStoreState.js";

/**
 * Store for model exploration images
 * Uses proper Pinia store pattern with composable for shared logic
 * Groups images by model (and explored LoRA) for comparison
 */
export const useExploreImagesStore = defineStore('exploreImages', () => {
    const state = useImageStoreState(KIND_EXPLORE);

    // Custom onSDEvent that groups images by model
    function onSDEvent(e) {
        if (e.type === "SAVED_IMAGE") {
            const imageData = createImageData(e);
            delete imageData.type;

            // Group by model and explored LoRA (if any)
            const groupName = imageData.parameters["model"] + (e.exploreLora ? ` + ${e.exploreLora}` : "");
            let model = state.images.value.find(m => m.name === groupName);

            if (!model) {
                model = reactive({
                    name: groupName,
                    hash: imageData.parameters["model hash"],
                    images: []
                });
                state.images.value.push(model);
            }

            model.images.push(imageData);
        }
        else if (e.type === "GENERATION_PROGRESS")
            state.setProgress(e);
        else if (e.type === "GENERATION_FINISHED") {
            state.generationProgress.value = 100;
            state.generationInProgress.value = false;
        }
    }

    // Getters
    const hasModels = computed(() => state.images.value.length > 0);
    const modelCount = computed(() => state.images.value.length);
    const isGenerating = computed(() => state.generationInProgress.value);

    return {
        // Expose state
        ...state,

        // Override onSDEvent with custom model-grouping logic
        onSDEvent,

        // Expose getters
        hasModels,
        modelCount,
        isGenerating
    };
})
