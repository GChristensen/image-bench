import {loadAppConfig, sleep} from "./shared/utils.js";
import {getGenerationState, setGenerationState} from "./state.js";
import {
    explorationStrategy,
    batchStrategy,
    processingStrategy,
    varyingStrategy
} from "./strategies.js";
import {messageBus} from "./shared/messaging/MessageBus.js";
import {disposePopup, sendPopupMessage, showPopup} from "./popup.js";
import {
    hookIntoSDWebUI,
    initializePopupPrompts,
    repositionConfigPresetsDropdown,
    setImageParams,
    setImageSeed,
    stopGeneration
} from "./sdwebui.js";
import {checkWebSocketConnection, createWebSocket, setSocketEventListener} from "./websocket.js";
import {adapter} from "./adapters/adapter.js";

let appConfig;

export async function init() {
    setGenerationState("BATCH_GENERATION");
    appConfig = await loadAppConfig() || {};
    await initUI();

    window.addEventListener("message", onMessage);
    setSocketEventListener(onBackendMessage);
    
    // Set up message bus event handlers
    setupMessageBusHandlers();
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
        if (batchStrategy.isProcessing()) {
            await batchStrategy.finish();
        }
        sendPopupMessage({type: "GENERATION_FINISHED"});
    });
}

async function initUI() {
    //window.name = "sd-webui-main-window";
    //console.log(appConfig)
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

async function onMessage(msg) {
    checkWebSocketConnection();

    const payload = msg.data;

    if (payload.type === "INITIALIZE_PROMPTS")
        initializePopupPrompts();
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

async function handleExploreModels(options) {
    if (!options.models || !options.models.length) {
        return;
    }

    if (explorationStrategy.isInvalidated()) {
        sendPopupMessage({type: "GENERATION_FINISHED"});
        alert("'Send to Txt2Img' was used. Please reload WebUI to explore models.");
        return;
    }

    setGenerationState("EXPLORE_MODELS");
    return await explorationStrategy.process(options);
}

async function handleBatchGenerate(options, config) {
    setGenerationState("BATCH_GENERATION");
    return await batchStrategy.process({...options, config});
}

async function handleGenerateVariations(options, config) {
    setGenerationState("BATCH_GENERATION");
    return await batchStrategy.process({...options, config});
}

async function handleProcessImages(options) {
    setGenerationState(options?.setSteps ? "SEQUENTIAL_GENERATION" : "HIRES_FIX");
    return await processingStrategy.process(options);
}

async function handleGenerateVaryingSteps(options) {
    setGenerationState("SEQUENTIAL_GENERATION");
    return await varyingStrategy.process(options);
}

async function handleUpscaleVaryingDenoising(options) {
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
            
            if (strategy && strategy.isProcessing()) {
                Object.assign(msg, strategy.getMessageParams());
                
                // Add progress for batch generation
                if (getGenerationState() === "BATCH_GENERATION") {
                    msg.progress = adapter.getGenerationProgress();
                }
            }
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
