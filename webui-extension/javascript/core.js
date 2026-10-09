import {loadAppConfig} from "./shared/utils.js";
import {getGenerationState, setGenerationState} from "./shared/state.js";
import {createStrategies} from "./shared/strategy-factory.js";
import {createPopupManager} from "./shared/popup.js";
import {createWebSocket, isConnectionClosed} from "./shared/websocket.js";
import {
    fetchCurrentModelInfo,
    hookIntoSDWebUI,
    initializePopupPrompts,
    repositionConfigPresetsDropdown,
    setImageParams,
    setImageSeed,
    stopGeneration
} from "./sdwebui.js";
import {adapter} from "./adapters/adapter.js";
import {UIOperations} from "./facade/UIOperations.js";
import {messageBus} from "./shared/messaging/MessageBus.js";
import {SELECTORS} from "./adapters/selectors.js";
import {restoreUiParams, saveUiParams} from "./persistence.js";
import {initPhotoshopBridge} from "./photoshop.js";
import {createHeaderButton} from "./utils_html.js";

// Create popup manager instance (no WebSocket integration for WebUI)
const popupManager = createPopupManager({
    endpoint: '/image-bench/window',
    integrateWebSocket: false,
    windowName: '_blank',
    windowFeatures: 'width=1024,height=720,left=100,top=100'
});

// Create WebSocket state
let websocket = null;

// Helper to send popup messages
const sendPopupMessage = (msg) => popupManager.sendMessage(msg);

// Create UIOperations facade and strategies
const uiOperations = new UIOperations(adapter);
const strategies = createStrategies(uiOperations, sendPopupMessage);

// Extract strategy instances
const {exploration: explorationStrategy, batch: batchStrategy, processing: processingStrategy,
        varying: varyingStrategy} = strategies;

let appConfig;
let modelInfoButton;

export async function init() {
    setGenerationState("BATCH_GENERATION");
    appConfig = await loadAppConfig() || {};
    await initUI();

    window.addEventListener("message", onMessage);

    // Close popup on page unload
    window.addEventListener("pagehide", () => {
        popupManager.close();
        fetch("/image-bench/close_websocket", {keepalive: true});
    });

    // Set up message bus event handlers
    setupMessageBusHandlers();

    // Receive images sent from the Photoshop plugin
    initPhotoshopBridge(uiOperations);

    // Only user clicks fire mousedown, strategies click the buttons programmatically
    for (const id of [SELECTORS.TXT2IMG_GENERATE, SELECTORS.IMG2IMG_GENERATE])
        document.getElementById(id)?.addEventListener("mousedown", onGenerateStarted);
}

/**
 * Save txt2img and img2img prompts and parameters when the user starts a generation
 * The config is reloaded, since the setting may be changed in the popup
 */
async function onGenerateStarted() {
    const params = uiOperations.captureUiParams();
    appConfig = await loadAppConfig() || appConfig;

    if (appConfig.persistGenerationParams)
        saveUiParams(params);
}

/**
 * Get the currently active strategy based on generation state
 */
function getActiveStrategy() {
    const state = getGenerationState();
    
    if (state === "EXPLORE_MODELS") return explorationStrategy;
    if (state === "BATCH_GENERATION") return batchStrategy;
    if (state === "HIRES_FIX" || state === "SEQUENTIAL_GENERATION") {
        return processingStrategy.isProcessing() ? processingStrategy : varyingStrategy;
    }
    return null;
}

/**
 * Set up message bus event handlers for strategy control
 */
function setupMessageBusHandlers() {
    // Handle strategy finish requests
    messageBus.subscribe('STRATEGY_FINISH_REQUEST', async () => {
        const strategy = getActiveStrategy();
        if (strategy && strategy.isProcessing()) {
            await strategy.finish();
        }
        setGenerationState("BATCH_GENERATION");
    });
    
    // Handle exploration invalidation
    messageBus.subscribe('EXPLORATION_INVALIDATE', () => {
        explorationStrategy.invalidate();
    });
    
    // Handle batch generation finished notification
    messageBus.subscribe('BATCH_GENERATION_FINISHED', async () => {
        // "Generate forever" starts the next generation shortly after the previous one,
        // it has finished only if it was cancelled from the WebUI context menu
        if (batchStrategy.isProcessing() && batchStrategy.isForever) {
            await uiOperations.sleep(1500);

            if (!batchStrategy.isProcessing() || !uiOperations.isReadyToGenerate())
                return;
        }

        if (batchStrategy.isProcessing()) {
            await batchStrategy.finish();
        }
        sendPopupMessage({type: "GENERATION_FINISHED"});
    });
}

async function initUI() {
    //window.name = "sd-webui-main-window";
    //console.log(appConfig)
    // Let Gradio finish initializing its components before restoring
    if (appConfig?.persistGenerationParams)
        setTimeout(() => restoreUiParams(uiOperations), 1500);

    if (appConfig?.repositionConfigPresetsDropdown)
        setTimeout(async () => {
            await repositionConfigPresetsDropdown("txt2img");
            await repositionConfigPresetsDropdown("img2img");
        }, 2000);

    modelInfoButton = createHeaderButton('Civitai Model Info', "ℹ️", {}, onShowModelInfo,
        document.querySelector(SELECTORS.MODEL_REFRESH_BUTTON));
    updateModelInfoButton();
    // The setting may be changed in the popup, the user then returns to this window
    window.addEventListener("focus", async () => {
        appConfig = await loadAppConfig() || appConfig;
        updateModelInfoButton();
    });

    createHeaderButton('Image Bench', "🔬",  {}, onShowWindow);
    popupManager.dispose();
}

function updateModelInfoButton() {
    modelInfoButton.style.display = appConfig?.addModelInfoButton ? "" : "none";
}

/**
 * Show the Civitai info of the selected checkpoint: in the popup's dialog if it is open,
 * otherwise open the Civitai page (or the search by name if the model is unknown to Civitai).
 * The button shows a spinner while the backend hashes the model and queries Civitai.
 */
async function onShowModelInfo() {
    if (modelInfoButton.disabled)
        return;

    // Opened before the request, so that it is not blocked as a popup without a user gesture
    const civitaiWindow = popupManager.isOpen() ? null : window.open("about:blank", "_blank");

    const icon = modelInfoButton.innerHTML;

    modelInfoButton.disabled = true;
    modelInfoButton.innerHTML = '<span class="image-bench-spinner"></span>';

    try {
        const info = await fetchCurrentModelInfo();

        if (!civitaiWindow && sendPopupMessage({type: "SHOW_MODEL_INFO", kind: "checkpoint", info}))
            return;

        if (info.found) {
            if (civitaiWindow)
                civitaiWindow.location = info.url;
            else
                window.open(info.url, "_blank");
        }
        else {
            civitaiWindow?.close();

            if (info.error)
                alert(info.error);
            else if (info.searchUrl && confirm(`'${info.name}' is not found on Civitai. Search by name?`))
                window.open(info.searchUrl, "_blank");
        }
    } finally {
        modelInfoButton.disabled = false;
        modelInfoButton.innerHTML = icon;
    }
}

async function onShowWindow() {
    if (popupManager.open()) {
        createWebSocketConnection();
        hookIntoSDWebUI(sendPopupMessage, checkWebSocketConnection);
    }
}

function createWebSocketConnection() {
    if (!websocket) {
        websocket = createWebSocket({
            endpoint: '/image-bench/websocket',
            onMessage: onBackendMessage
        });
    }
}

function checkWebSocketConnection() {
    if (isConnectionClosed(websocket)) {
        createWebSocketConnection();
        return false;
    }
    return true;
}

async function onMessage(msg) {
    checkWebSocketConnection();

    const payload = msg.data;

    if (payload.type === "INITIALIZE_PROMPTS")
        initializePopupPrompts(sendPopupMessage);
    else if (payload.type === "STOP_GENERATION")
        stopGeneration();
    else if (payload.type === "EXPLORE_MODELS")
        await handleExploreModels(payload);
    else if (payload.type === "BATCH_GENERATE")
        await handleBatchGenerate(payload, appConfig);
    else if (payload.type === "GENERATE_VARIATIONS")
        await handleGenerateVariations(payload, appConfig);
    else if (payload.type === "UPSCALE_IMAGES")
        await handleProcessImages(payload);
    else if (payload.type === "SET_IMAGE_SEED")
        setImageSeed(payload)
    else if (payload.type === "SET_IMAGE_PARAMS")
        setImageParams(payload)
    else if (payload.type === "GENERATE_VARYING_STEPS")
        await handleGenerateVaryingSteps(payload)
    else if (payload.type === "UPSCALE_VARYING_DENOISING")
        await handleUpscaleVaryingDenoising(payload)
}

/**
 * Show a message in the popup's dialog; native alert only if the popup is gone
 * @param {string} message
 */
function showAlert(message) {
    if (!sendPopupMessage({type: "SHOW_ALERT", message}))
        alert(message);
}

/**
 * Refuse to start a strategy while WebUI is generating or interrupting,
 * before the strategy changes any UI parameters
 * @returns {boolean} Whether the strategy may start
 */
function checkReadyToGenerate() {
    if (uiOperations.isReadyToGenerate())
        return true;

    sendPopupMessage({type: "GENERATION_FINISHED"});
    showAlert("Generation is in progress or being interrupted. Please wait until it finishes.");
    return false;
}

async function handleExploreModels(options) {
    if (!options.models || !options.models.length) {
        return;
    }

    if (!checkReadyToGenerate())
        return;

    if (explorationStrategy.isInvalidated()) {
        sendPopupMessage({type: "GENERATION_FINISHED"});
        showAlert("'Send to Txt2Img' was used. Please reload WebUI to explore models.");
        return;
    }

    setGenerationState("EXPLORE_MODELS");
    return await explorationStrategy.process(options);
}

async function handleBatchGenerate(options, config) {
    if (!checkReadyToGenerate())
        return;

    setGenerationState("BATCH_GENERATION");
    return await batchStrategy.process({...options, config});
}

async function handleGenerateVariations(options, config) {
    if (!checkReadyToGenerate())
        return;

    setGenerationState("BATCH_GENERATION");
    return await batchStrategy.process({...options, config});
}

async function handleProcessImages(options) {
    if (!checkReadyToGenerate())
        return;

    setGenerationState(options?.setSteps ? "SEQUENTIAL_GENERATION" : "HIRES_FIX");
    return await processingStrategy.process(options);
}

async function handleGenerateVaryingSteps(options) {
    if (!checkReadyToGenerate())
        return;

    setGenerationState("SEQUENTIAL_GENERATION");
    return await varyingStrategy.process(options);
}

async function handleUpscaleVaryingDenoising(options) {
    if (!checkReadyToGenerate())
        return;

    setGenerationState("HIRES_FIX");
    return await varyingStrategy.process(options);
}

function isProcessingActive() {
    const generationState = getGenerationState();
    return generationState === "HIRES_FIX" || generationState === "SEQUENTIAL_GENERATION";
}

function onBackendMessage(e) {
    if (e?.data) {
        const msg = JSON.parse(e.data);

        // Set message parameters based on active strategy
        if (msg.type === "SAVED_IMAGE") {
            const strategy = getActiveStrategy();
            
            if (strategy && strategy.isProcessing())
                Object.assign(msg, strategy.getMessageParams());
        }

        sendPopupMessage(msg);

        // Process next item based on active strategy
        if (msg.type === "SAVED_IMAGE") {
            const strategy = getActiveStrategy();
            if (strategy && strategy.isProcessing()) {
                strategy.processNext();
            }
        }
    }
}
