import {defineStore} from "pinia";
import {ref} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

// Whether the user locked the WebUI prompts; the lock is restored when the popup is reopened
const PROMPTS_LOCK_KEY = "imageBench_lockWebUIPrompts";

export const useSDWebUIStateStore = defineStore('sdWebUIState', () => {
    const storage = useLocalStorage();
    const prompt = ref("")
    const negativePrompt = ref("")

    // Generation mode shown in WebUI: "txt2img", "img2img", "inpaint" (Inpaint upload) or "other" (another img2img mode)
    const mode = ref("txt2img")
    // Parameters of the mode mirrored by the Generate tab (WEBUI_PARAMS), null until received
    const params = ref(null)
    // What the Forge distilled CFG slider controls: "shift", "distilledCfg" or null if it is hidden
    const sliderKind = ref(null)
    const tokens = ref({prompt: null, negativePrompt: null})
    // Choices of the dropdowns and radio groups; ComfyUI also sends checkpoints, samplers and schedulers
    // (the options of the workflow widgets), which replace the lists of the backend
    const options = ref({uiPresets: [], upscalers: [], resizeMode: [], maskMode: [], inpaintArea: [], maskedContent: []})
    // Features the host page reports as present or missing ({name: boolean}), null if it reports none (WebUI)
    const features = ref(null)
    // Reference images of the edit models in the shown WebUI tab (Forge ImageStitch), null if absent:
    // {enabled, images: [src], maxSize, edit: true|false|null if the model has no edit switch}
    const references = ref(null)
    // Input images of img2img and inpaint (INPUT_IMAGES): image sources, null where there is none
    const inputs = ref({mode: null, image: null, mask: null})
    // WebUI is generating or interrupting, whoever started it
    const busy = ref(false)
    // ComfyUI: the active workflow {path, name, modified} (null in WebUI or if unknown) and the saved workflows
    // [{path, name}] of the Workflows sidebar (name: the path below the workflows folder, without .json)
    const workflow = ref(null)
    const workflows = ref([])
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
            mode.value = e.mode ?? "txt2img";
            params.value = e.params;
            references.value = e.references ?? null;
            sliderKind.value = e.sliderKind;
            tokens.value = e.tokens;
            options.value = e.options;
            features.value = e.features ?? null;
            busy.value = e.busy;
            promptsLocked.value = e.locked;
            workflow.value = e.workflow ?? null;
            workflows.value = e.workflows ?? [];
        }
        else if (e.type === "INPUT_IMAGES") {
            inputs.value = {mode: e.mode, image: e.image, mask: e.mask};
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

    return {prompt, negativePrompt, mode, params, sliderKind, tokens, options, features, references, inputs, busy, workflow, workflows, promptsLocked,
            live, onSDEvent,
            isPromptsLockRemembered, setPromptsLockRemembered};
})
