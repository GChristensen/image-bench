import {sleep} from "./utils.js";
import {createHeaderButton} from "./utils_html.js";
import {getGenerationState, setGenerationState} from "./state.js";
import {exploreModels, exploreNextImage, messageSetExploreParams} from "./explore.js";
import {
    isProcessingActive,
    generateVaryingSteps,
    processImages,
    messageSetProcessingParams,
    processNextImage,
    upscaleVaryingDenoising
} from "./processing.js";
import {disposePopup, sendPopupMessage, showPopup} from "./popup.js";
import {
    hookIntoSDWebUI,
    initializePopupPrompts,
    repositionConfigPresetsDropdown,
    setImageParams,
    setImageSeed, showModelInfoPopup, stopGeneration
} from "./sdwebui.js";
import {batchGenerate, messageSetGenerationParams} from "./generation.js";
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

    if (appConfig?.addModelInfoButton) {
        const reloadModelsButton = document.getElementById("refresh_sd_model_checkpoint");
        createHeaderButton('Civitai Model Info', "ℹ️", {}, showModelInfoPopup, reloadModelsButton);
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
        exploreModels(payload);
    else if (payload.type === "BATCH_GENERATE")
        batchGenerate(payload);
    else if (payload.type === "UPSCALE_IMAGES")
        processImages(payload);
    else if (payload.type === "SET_IMAGE_SEED")
        setImageSeed(payload)
    else if (payload.type === "SET_IMAGE_PARAMS")
        setImageParams(payload)
    else if (payload.type === "GENERATE_VARYING_STEPS")
        generateVaryingSteps(payload)
    else if (payload.type === "UPSCALE_VARYING_DENOISING")
        upscaleVaryingDenoising(payload)
}

function onBackendMessage(e) {
    if (e?.data) {
        const msg = JSON.parse(e.data);

        messageSetExploreParams(msg);
        messageSetGenerationParams(msg);
        messageSetProcessingParams(msg);

        sendPopupMessage(msg);

        if (msg.type === "SAVED_IMAGE") {
            if (isProcessingActive(msg)) {
                processNextImage();
            }
            else if (getGenerationState() === "EXPLORE_MODELS") {
                exploreNextImage();
            }
        }
    }
}

