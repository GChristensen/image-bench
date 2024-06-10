import {sleep} from "./utils.js";
import {createHeaderButton} from "./utils_html.js";
import {getGenerationState, setGenerationState} from "./state.js";
import {exploreModels, exploreNextImage} from "./explore.js";
import {
    canProcessNextImage,
    generateVaryingSteps,
    processImages,
    processingAugmentMessage,
    processNextImage,
    revertVaryingParams,
    upscaleVaryingDenoising
} from "./processing.js";
import {disposePopup, sendPopupMessage, showPopup} from "./popup.js";
import {
    hookIntoSDWebUI,
    initializePopupPrompts,
    repositionConfigPresetsDropdown,
    setImageParams,
    setImageSeed, stopGeneration
} from "./sdwebui.js";
import {batchGenerate, generationAugmentMessage} from "./generation.js";
import {checkWebSocketConnection, createWebSocket, setSocketEventListener} from "./websocket.js";

let appConfig;

export async function init() {
    setGenerationState("BATCH_GENERATION");
    await loadAppConfig();
    await initUI();

    window.addEventListener("message", onMessage);
    setSocketEventListener(onBackendMessage);
}

async function loadAppConfig() {
    await fetch('/image-bench/config.json?_=' + (+new Date()))
        .then(response => response.json())
        .then(config => {
            try {
                appConfig = config;
            } catch (error) {
                console.error('[state]: Error:', error);
            }
        })
        .catch(error => console.error('[state]: Error getting JSON file:', error));
}

async function initUI() {
    //window.name = "sd-webui-main-window";

    if (appConfig?.repositionConfigPresetsDropdown) {
        await sleep(2000);
        await repositionConfigPresetsDropdown("txt2img");
        await repositionConfigPresetsDropdown("img2img");
    }

    createHeaderButton('Image Bench', "🔬",  {}, onShowWindow);
    disposePopup();
}

async function onShowWindow() {
    if (showPopup()) {
        createWebSocket();
        hookIntoSDWebUI();
    }
}

function onMessage(msg) {
    checkWebSocketConnection();

    const payload = msg.data;

    if (payload.type === "INITIALIZE_PROMPTS")
        initializePopupPrompts();
    else if (payload.type === "STOP_GENERATION")
        stopGeneration();
    else if (payload.type === "EXPLORE_MODELS")
        exploreModels(payload.models, payload.generateImages);
    else if (payload.type === "BATCH_GENERATE")
        batchGenerate(payload.preset);
    else if (payload.type === "UPSCALE_IMAGES")
        processImages(payload.images, payload.preset);
    else if (payload.type === "SET_IMAGE_SEED")
        setImageSeed(payload.parameters)
    else if (payload.type === "SET_IMAGE_PARAMS")
        setImageParams(payload.parameters)
    else if (payload.type === "GENERATE_VARYING_STEPS")
        generateVaryingSteps(payload.image, payload.steps)
    else if (payload.type === "UPSCALE_VARYING_DENOISING")
        upscaleVaryingDenoising(payload.image, payload.denoising)
}

function onBackendMessage(e) {
    if (e?.data) {
        const msg = JSON.parse(e.data);

        generationAugmentMessage(msg);
        processingAugmentMessage(msg);

        sendPopupMessage(msg);

        revertVaryingParams();

        if (msg.type === "SAVED_IMAGE") {
            if (canProcessNextImage(msg)) {
                processNextImage();
            }
            else if (getGenerationState() === "EXPLORE_MODELS") {
                exploreNextImage();
            }
        }
    }
}

