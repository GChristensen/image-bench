import {defineStore} from "pinia";
import {KIND_UPSCALED} from "@/consts.js";
import {ref} from "vue";
import {addImage} from "@/stores/utils.js";

export const useSDWebUIStore = defineStore('sdWebUI', () => {
    const prompt = ref("")
    const negativePrompt = ref("")

    function onSDEvent(e) {
        if (e.type === "PROMPT_CHANGE") {
            prompt.value = e.text;
        }
        else if (e.type === "NEGATIVE_PROMPT_CHANGE") {
            negativePrompt.value = e.text;
        }
    }

    return { prompt, negativePrompt, onSDEvent };
})
