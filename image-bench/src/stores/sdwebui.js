import {defineStore} from "pinia";
import {ref} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

// Whether the user locked the WebUI prompts; the lock is restored when the popup is reopened
const PROMPTS_LOCK_KEY = "imageBench_lockWebUIPrompts";

export const useSDWebUIStateStore = defineStore('sdWebUIState', () => {
    const storage = useLocalStorage();
    const prompt = ref("")
    const negativePrompt = ref("")

    // txt2img parameters mirrored by the Generate tab (WEBUI_PARAMS), null until received
    const params = ref(null)
    // What the Forge distilled CFG slider controls: "shift", "distilledCfg" or null if it is hidden
    const sliderKind = ref(null)
    const tokens = ref({prompt: null, negativePrompt: null})
    const options = ref({uiPresets: [], upscalers: []})
    // WebUI is generating or interrupting, whoever started it
    const busy = ref(false)
    const promptsLocked = ref(false)

    // Progress and live preview of the running generation (LIVE_PROGRESS)
    const live = ref({active: false, progress: 0, preview: null})

    function onSDEvent(e) {
        if (e.type === "PROMPT_CHANGE") {
            prompt.value = e.text;
        }
        else if (e.type === "NEGATIVE_PROMPT_CHANGE") {
            negativePrompt.value = e.text;
        }
        else if (e.type === "WEBUI_PARAMS") {
            params.value = e.params;
            sliderKind.value = e.sliderKind;
            tokens.value = e.tokens;
            options.value = e.options;
            busy.value = e.busy;
            promptsLocked.value = e.locked;
        }
        else if (e.type === "LIVE_PROGRESS") {
            live.value = {active: e.active, progress: e.progress, preview: e.preview};
        }
        else if (e.type === "WEBUI_PROMPTS_UNLOCKED") {
            setPromptsLockRemembered(false);
        }
    }

    function isPromptsLockRemembered() {
        return storage.getItem(PROMPTS_LOCK_KEY) === "true";
    }

    function setPromptsLockRemembered(lock) {
        storage.setItem(PROMPTS_LOCK_KEY, String(lock));
    }

    return {prompt, negativePrompt, params, sliderKind, tokens, options, busy, promptsLocked, live, onSDEvent,
            isPromptsLockRemembered, setPromptsLockRemembered};
})
