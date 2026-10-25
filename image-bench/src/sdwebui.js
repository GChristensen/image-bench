import {dialog} from "@/dialogs/useDialog.js";
import {getHostWindow} from "@/hostWindow.js";
import {backendConnected, notifyBackendDown} from "@/backendStatus.js";

// Messages that start work on the server, refused while the backend is down. The others (parameter edits,
// subscriptions) still go to the host page: a ComfyUI page stays alive, a WebUI page is reloaded with the state
// of the popup when the backend is back
const SERVER_MESSAGES = new Set(["GENERATE_IMAGE", "BATCH_GENERATE", "EXPLORE_MODELS", "GENERATE_VARIATIONS",
    "UPSCALE_IMAGES", "UPSCALE_VARYING_DENOISING", "GENERATE_VARYING_STEPS", "GENERATE_VARYING_MODULES",
    "CONTROLNET_ACTION", "REFRESH_MODELS", "SET_INPUT_IMAGE", "SET_CONTROLNET_IMAGE", "LOAD_WORKFLOW",
    "SYNC_WORKFLOWS", "CONTROLNET_SWEEP", "SET_CONTINUATION"]);

export function createImageData(data) {
    return {...data};
}

export function createImageLink(image) {
    return image?.imageUrl;
}

export function createImageGenerationParams(image) {
    image = {...image};

    let parametersText = `Prompt:
${image.parameters["prompt"]}

Negative prompt:
${image.parameters["negative prompt"]}

`;
    const keys = Object.keys(image.parameters);

    for (const key of keys) {
        if (["prompt", "negative prompt"].includes(key))
            continue;

        const value = image.parameters[key];

        if (typeof value === "object") {
            parametersText += key.charAt(0).toUpperCase() + key.slice(1) + ":\n";
            const subKeys = Object.keys(value);

            for (const subKey of subKeys) {
                const subValue = value[subKey];
                parametersText += "  " + subKey.charAt(0).toUpperCase() + subKey.slice(1) + ": " + subValue + "\n";
            }
        }
        else
            parametersText += key.charAt(0).toUpperCase() + key.slice(1) + ": " + value + "\n";

    }

    return parametersText;
}

export function isImg2Img(imageData) {
    let imagePath;
    if (typeof imageData === "object")
        imagePath = imageData.imagePath;
    else
        imagePath = imageData;

    return imagePath.includes("img2img-images");
}

/**
 * The generation state of the host page, which injects getGenerationState() into this window
 * @returns {string|null} Null before the host page has attached (embedded mode)
 */
export function getGenerationState() {
    return window.getGenerationState?.() ?? null;
}

/**
 * Whether the host is generating or an Image Bench operation (batch, upscaling, exploration, ...) is running.
 * Asked from the host page itself, so that it also works after the popup is reloaded
 * @returns {boolean}
 */
export function isGenerationActive() {
    try {
        return !!getHostWindow()?.imageBenchIsGenerationActive?.();
    } catch {
        return false;
    }
}

/**
 * Tell the user that an operation is refused while a generation is active
 * @returns {Promise<boolean>} Whether an operation may start
 */
export async function ensureGenerationIdle() {
    if (!isGenerationActive())
        return true;

    await dialog.alert("A generation is in progress. Please wait until it finishes or stop it.");
    return false;
}

export function sendWebUIMessage(msg) {
    console.log("sendWebUIMessage: ", msg)
    const host = getHostWindow();

    if (!host) {
        console.warn("sendWebUIMessage: the host page is not connected");
        return;
    }

    // Operations are not started while the backend is down
    if (!backendConnected.value && SERVER_MESSAGES.has(msg.type)) {
        notifyBackendDown();
        return;
    }

    host.postMessage(msg, window.location.origin);
}