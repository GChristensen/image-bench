import {defineStore} from "pinia";
import {ref} from "vue";

export const useSDWebUIStateStore = defineStore('sdWebUIState', () => {
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
