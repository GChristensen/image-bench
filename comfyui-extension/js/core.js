/**
 * Image Bench Extension for ComfyUI
 *
 * This extension adds a toolbar button to open the Image Bench popup window
 * and intercepts generated images to display them in real-time.
 */

import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";
import {fetchSystemPaths} from "./paths.js";
import {extractImageInfo, extractParameters, extractParametersFromHistory} from "./workflow.js";
import {ComfyUIOperations} from "./facade/ComfyUIOperations.js";
import {createProgress} from "./progress.js";
import {createGeneration} from "./generation.js";
import {createReferences} from "./references.js";
import {createMirror} from "./mirror.js";
import {createControlNet} from "./controlnet.js";
import {messageBus} from "./shared/messaging/messageBus.js";
import {createStrategies} from "./shared/strategy-factory.js";
import {createPopupManager} from "./shared/popup.js";
import {getGenerationState, setGenerationState} from "./shared/state.js";

// Create popup manager instance with WebSocket integration for ComfyUI
const popupManager = createPopupManager({
    endpoint: '/image-bench/window',
    integrateWebSocket: true,
    windowName: 'imageBenchPopup',
    windowFeatures: 'width=1024,height=720,left=100,top=100'
});

// Helper to send popup messages
const sendPopupMessage = (msg) => popupManager.sendMessage(msg);

// Global instances for model exploration and other features
let uiOperations = null;
let nodeConfig = null;
let strategies = null;
let currentStrategy = null;

// Modules of the Generate and ControlNet tabs, and the popup messages they handle
let generation = null;
let references = null;
let mirror = null;
let controlNet = null;
let messageHandlers = {};

/**
 * Register the extension with ComfyUI
 */
app.registerExtension({
    name: "ImageBench.Extension",

    async setup() {
        console.log('[Image Bench] Extension initializing...');

        // Initialize default generation state
        setGenerationState("BATCH_GENERATION");
        console.log('[Image Bench] Default generation state set to: BATCH_GENERATION');

        // Fetch system paths first
        await fetchSystemPaths();

        // Initialize operations facade for model exploration
        await initializeOperations();

        // Add toolbar button
        addToolbarButton();

        // Register event listeners
        api.addEventListener("executed", handleExecuted);
        api.addEventListener("execution_start", handleExecutionStart);
        api.addEventListener("execution_error", handleExecutionError);
        api.addEventListener("image-bench.photoshop", handlePhotoshopImage);

        // Listen for postMessage from popup window
        window.addEventListener("message", handlePostMessage);

        console.log('[Image Bench] Extension initialized successfully');
    },

    async nodeCreated(node) {
        // Can be used to modify nodes if needed in the future
    }
});

/**
 * Load node configuration for marker-based node discovery
 */
async function loadNodeConfig() {
    try {
        const response = await fetch('/image-bench/node_config.json', {cache: 'no-store'});
        if (!response.ok) {
            console.warn('[Image Bench] Failed to load node_config.json, using defaults');
            return null;
        }
        const config = await response.json();
        console.log('[Image Bench] Node config loaded:', config);
        return config;
    } catch (error) {
        console.error('[Image Bench] Error loading node config:', error);
        return null;
    }
}

/**
 * Initialize operations facade and strategies
 */
async function initializeOperations() {
    try {
        // Load node config
        nodeConfig = await loadNodeConfig();

        // Create operations facade directly (no adapter layer needed for ComfyUI)
        uiOperations = new ComfyUIOperations(app, api, nodeConfig);

        // Create strategy instances using shared factory
        strategies = createStrategies(uiOperations, sendPopupMessage);

        console.log('[Image Bench] Operations facade and strategies initialized');

        // Expose globally for strategies and other features
        window.imageBenchUI = uiOperations;
        window.imageBenchMessageBus = messageBus;
        window.imageBenchStrategies = strategies;
        window.getGenerationState = getGenerationState;  // Expose state function for popup
        // Asked by the popup before it starts an operation
        window.imageBenchIsGenerationActive = isGenerationActive;

        initializeTabModules();

        // Set up message bus handlers
        setupMessageBusHandlers();
    } catch (error) {
        console.error('[Image Bench] Failed to initialize operations:', error);
    }
}

/**
 * Create the modules behind the Generate and ControlNet tabs; each one handles its own popup messages
 */
function initializeTabModules() {
    const ctx = {
        app,
        api,
        ops: uiOperations,
        popup: {sendMessage: sendPopupMessage, isOpen: () => popupManager.isOpen()},
        showAlert
    };

    const progress = createProgress(ctx);
    uiOperations.progress = progress;

    references = createReferences(ctx);
    mirror = createMirror(ctx, {progress, references});
    controlNet = createControlNet(ctx);
    generation = createGeneration(ctx, {
        // A strategy waits for the image of the interrupted prompt
        onSkipped: () => currentStrategy?.isProcessing() && currentStrategy.processNext(),
        onStop: finishStrategy
    });

    messageHandlers = {...mirror.handlers, ...controlNet.handlers, ...generation.handlers};
}

/**
 * Show a message in the popup's dialog, or as a ComfyUI toast if the popup is closed
 * @param {string} message
 */
function showAlert(message) {
    // Without the popup, sendPopupMessage() may still queue the message for the backend WebSocket
    if (popupManager.isOpen() && sendPopupMessage({type: "SHOW_ALERT", message}))
        return;

    const toast = app.extensionManager?.toast;

    if (toast)
        toast.add({severity: "warn", summary: "Image Bench", detail: message, life: 5000});
    else
        console.warn(`[Image Bench] ${message}`);
}

/**
 * Set up message bus event handlers for strategy control
 * (analogous to WebUI's setupMessageBusHandlers)
 */
function setupMessageBusHandlers() {
    // Handle strategy finish requests
    messageBus.subscribe('STRATEGY_FINISH_REQUEST', async () => {
        if (currentStrategy && currentStrategy.isProcessing()) {
            console.log('[Image Bench] Strategy finish requested');
            await currentStrategy.finish();
        }
        setGenerationState("BATCH_GENERATION");
    });

    // Handle generation finished (reset state)
    messageBus.subscribe('GENERATION_FINISHED', () => {
        console.log('[Image Bench] Generation finished, resetting state');
        setGenerationState("BATCH_GENERATION");
        currentStrategy = null;

        // Forward to popup
        sendPopupMessage({type: "GENERATION_FINISHED"});
    });

    console.log('[Image Bench] Message bus handlers set up');
}

/**
 * Add toolbar button to ComfyUI interface using the official app.menu API
 */
let addButtonRetryCount = 0;
const MAX_RETRIES = 20; // Try for up to 20 seconds

function addToolbarButton() {
    // Check if button already exists
    if (document.getElementById('image-bench-button')) {
        return;
    }

    // Use ComfyUI's official app.menu API (same approach as rgthree extension)
    if (!app.menu?.settingsGroup?.element) {
        if (addButtonRetryCount < MAX_RETRIES) {
            addButtonRetryCount++;
            console.log(`[Image Bench] app.menu.settingsGroup not ready yet, retry ${addButtonRetryCount}/${MAX_RETRIES}...`);
            setTimeout(addToolbarButton, 1000);
            return;
        } else {
            console.error('[Image Bench] app.menu.settingsGroup not available after max retries');
            return;
        }
    }

    // Create button element
    const button = document.createElement('button');
    button.id = 'image-bench-button';
    button.textContent = '🔬 Image Bench';
    button.title = 'Open Image Bench for batch generation management';
    button.className = 'comfyui-button';
    button.style.cssText = `
        margin-left: 8px;
        padding: 4px 8px;
        background: #4a4a4a;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    `;

    button.addEventListener('mouseenter', () => {
        button.style.background = '#5a5a5a';
    });

    button.addEventListener('mouseleave', () => {
        button.style.background = '#4a4a4a';
    });

    button.addEventListener('click', () => popupManager.open());

    // Insert button before the settings group (same approach as rgthree)
    app.menu.settingsGroup.element.before(button);

    console.log('[Image Bench] Toolbar button added successfully using app.menu API');
}

/**
 * Handle execution completion event
 */
async function handleExecuted(event) {
    const { node, output, prompt_id } = event.detail;

    // A preprocessor run of the ControlNet tab
    if (controlNet?.ownsPrompt(prompt_id))
        return;

    console.log('[Image Bench] Image generated:', { node, output, prompt_id });

    // Extract image information
    const images = await extractImageInfo(node, output, prompt_id);

    if (images.length > 0) {
        // Extract parameters from history API (source of truth for generated images)
        let parameters;
        try {
            console.log('[Image Bench] Fetching history for prompt:', prompt_id);
            const resp = await api.fetchApi(`/history/${prompt_id}`);
            const history = await resp.json();
            const historyData = history[prompt_id];

            if (historyData && historyData.prompt) {
                // Extract from history (no race conditions!)
                console.log(historyData)
                parameters = extractParametersFromHistory(prompt_id, historyData.prompt, nodeConfig,
                    uiOperations?.getMarkerExecutionIds());
                console.log('[Image Bench] Parameters extracted from history API');
            } else {
                console.warn('[Image Bench] History data incomplete');
                //parameters = extractParameters(prompt_id, undefined);
            }
        } catch (error) {
            console.error('[Image Bench] Failed to fetch history', error);
            //parameters = extractParameters(prompt_id, undefined);
        }

        // Send each image to popup
        for (const imageData of images) {
            const message = {
                type: "SAVED_IMAGE",
                imageUrl: imageData.imageUrl,
                imagePath: imageData.imagePath,
                filename: imageData.filename,
                batchId: prompt_id,
                parameters: parameters
            };

            // Add strategy-specific parameters if a strategy is active
            if (currentStrategy && currentStrategy.isProcessing()) {
                console.log('[Image Bench] Active strategy detected, adding message params');
                Object.assign(message, currentStrategy.getMessageParams());
            }

            sendPopupMessage(message);
        }

        // CRITICAL: Process next item in queue if a strategy is active
        if (currentStrategy && currentStrategy.isProcessing()) {
            console.log('[Image Bench] Calling processNext() on active strategy');
            currentStrategy.processNext();
        } else {
            console.log('[Image Bench] No active strategy, skipping processNext()');
        }
    }
}

/**
 * Handle execution start event
 */
function handleExecutionStart(event) {
    const { prompt_id } = event.detail;
    console.log('[Image Bench] Execution started:', prompt_id);

    if (controlNet?.ownsPrompt(prompt_id))
        return;

    sendPopupMessage({
        type: "BEGIN_PROCESSING",
        prompt_id: prompt_id,
        isBatchGeneration: currentStrategy && currentStrategy.isProcessing(),
        // Queued from the Generate tab, where the image is shown
        single: !!generation?.takeSingle()
    });
}

/**
 * Handle execution error event
 */
function handleExecutionError(event) {
    const { prompt_id, exception_message } = event.detail;

    if (controlNet?.ownsPrompt(prompt_id))
        return;

    console.error('[Image Bench] Execution error:', exception_message);

    sendPopupMessage({
        type: "GENERATION_ERROR",
        prompt_id: prompt_id,
        error: exception_message
    });
}

/**
 * Load an image or a mask sent from Photoshop, which the backend has already saved to the input directory:
 * into the node marked with ib:img or ib:mask, a new reference image if the Generate tab routes images there,
 * or the ControlNet unit shown in the ControlNet tab (target cn_*)
 */
async function handlePhotoshopImage(event) {
    const {kind, filename, target = "input"} = event.detail;

    if (target !== "input") {
        await controlNet?.onPhotoshopImage(target, filename);
        return;
    }

    // Without nodes marked ib:ref the image goes to the input
    if (kind === "image" && mirror?.getPhotoshopTarget() === "reference" && popupManager.isOpen()) {
        try {
            if (await references.addImages([filename])) {
                mirror.pollIfActive();
                return;
            }
        } catch (error) {
            showAlert(error.message);
            return;
        }
    }

    if (uiOperations?.setInpaintUploadImage(kind, filename))
        return;

    showAlert(kind === "mask"
        ? 'Unable to insert the mask from Photoshop: no node is marked "ib:mask" apart from the "ib:img" node.'
        : 'Unable to insert the image from Photoshop: no node is marked "ib:img".');
}

// Popup messages that start a generation, refused while one is active
const GENERATION_MESSAGES = new Set(["GENERATE_IMAGE", "EXPLORE_MODELS", "BATCH_GENERATE", "GENERATE_VARIATIONS",
    "UPSCALE_IMAGES", "GENERATE_VARYING_STEPS", "UPSCALE_VARYING_DENOISING"]);

/**
 * Whether ComfyUI is running or has queued prompts, or a strategy is running (also between its prompts)
 * @returns {boolean}
 */
function isGenerationActive() {
    return !!(uiOperations?.progress?.isBusy() || currentStrategy?.isProcessing());
}

/**
 * Handle postMessage from popup window (analogous to WebUI's onMessage)
 */
function handlePostMessage(event) {
    // Only handle messages from our popup window
    // In production, you should verify event.origin for security

    const payload = event.data;
    const { type } = payload;

    // The Generate and ControlNet tabs poll several times per second
    if (!type?.endsWith("SUBSCRIBE"))
        console.log('[Image Bench] Received message:', type);

    if (GENERATION_MESSAGES.has(type) && isGenerationActive()) {
        sendPopupMessage({type: "GENERATION_FINISHED"});
        showAlert("A generation is in progress. Please wait until it finishes or stop it.");
        return;
    }

    const handler = messageHandlers[type];

    if (handler) {
        Promise.resolve(handler(payload)).catch(error => console.error(`[Image Bench] ${type} failed:`, error));
        return;
    }

    if (type === "INITIALIZE_PROMPTS")
        initializePrompts();
    else if (type === "EXPLORE_MODELS")
        handleExploreModels(payload);
    else if (type === "BATCH_GENERATE")
        handleBatchGenerate(payload);
    else if (type === "GENERATE_VARIATIONS")
        handleGenerateVariations(payload);
    else if (type === "UPSCALE_IMAGES")
        handleProcessImages(payload);
    else if (type === "SET_IMAGE_SEED")
        setImageSeed(payload);
    else if (type === "SET_IMAGE_PARAMS")
        setImageParams(payload);
    else if (type === "GENERATE_VARYING_STEPS")
        handleGenerateVaryingSteps(payload);
    else if (type === "UPSCALE_VARYING_DENOISING")
        handleUpscaleVaryingDenoising(payload);
}

/**
 * Handle model exploration request
 * @param {Object} options - { models: Array, generateImages: number }
 */
async function handleExploreModels(options) {
    if (!options.models || !options.models.length) {
        return;
    }

    console.log('[Image Bench] handleExploreModels() called with options:', options);

    if (!strategies) {
        console.error('[Image Bench] Strategies not initialized');
        return;
    }

    if (options.loras?.length && !uiOperations.getLoraTarget()) {
        sendPopupMessage({type: "GENERATION_FINISHED"});
        sendPopupMessage({type: "SHOW_ALERT", message: 'LoRA exploration needs a LoRA loader node marked "ib:lora".'});
        return;
    }

    // Set generation state
    setGenerationState("EXPLORE_MODELS");
    console.log('[Image Bench] Generation state set to: EXPLORE_MODELS');

    try {
        // Stop any existing strategy
        if (currentStrategy && currentStrategy.isActive) {
            console.log('[Image Bench] Stopping existing strategy');
            await currentStrategy.finish();
        }

        // Use the pre-created exploration strategy
        currentStrategy = strategies.exploration;
        console.log('[Image Bench] Using exploration strategy:', currentStrategy);

        // Start processing
        console.log('[Image Bench] Calling strategy.process()...');
        await currentStrategy.process(options);

        console.log('[Image Bench] Model exploration started successfully');
    } catch (error) {
        console.error('[Image Bench] Failed to start model exploration:', error);
        console.error('[Image Bench] Error stack:', error.stack);
        setGenerationState("BATCH_GENERATION");
        currentStrategy = null;
        sendPopupMessage({type: "GENERATION_FINISHED"});
        sendPopupMessage({type: "SHOW_ALERT", message: `Model exploration failed: ${error.message}`});
    }
}

/**
 * Handle batch generation request
 * @param {Object} options - Batch generation options
 * @param {number} options.generateImages - Number of images to generate
 * @param {string} [options.preset] - Optional preset name
 * @param {boolean} [options.img2img] - Whether in img2img mode
 * @param {number} [options.strength] - Strength for variations
 */
async function handleBatchGenerate(options) {
    console.log('[Image Bench] handleBatchGenerate() called with options:', options);

    if (!strategies) {
        console.error('[Image Bench] Strategies not initialized');
        return;
    }

    // Set generation state
    setGenerationState("BATCH_GENERATION");
    console.log('[Image Bench] Generation state set to: BATCH_GENERATION');

    try {
        // Stop any existing strategy
        if (currentStrategy && currentStrategy.isActive) {
            console.log('[Image Bench] Stopping existing strategy');
            await currentStrategy.finish();
        }

        // Use the pre-created batch strategy
        currentStrategy = strategies.batch;
        console.log('[Image Bench] Using batch strategy:', currentStrategy);

        // Start processing
        console.log('[Image Bench] Calling strategy.process()...');
        await currentStrategy.process(options);

        console.log('[Image Bench] Batch generation started successfully');
    } catch (error) {
        console.error('[Image Bench] Failed to start batch generation:', error);
        console.error('[Image Bench] Error stack:', error.stack);
    }
}

/**
 * Handle generate variations request
 * @param {Object} options - Variation generation options
 */
async function handleGenerateVariations(options) {
    console.log('[Image Bench] handleGenerateVariations() called');
    console.warn('[Image Bench] Generate variations not yet implemented for ComfyUI');
    setGenerationState("BATCH_GENERATION");
    // TODO: Implement variations strategy for ComfyUI
}

/**
 * Handle image processing (upscaling) request
 * @param {Object} options - Processing options
 */
async function handleProcessImages(options) {
    console.log('[Image Bench] handleProcessImages() called');
    console.warn('[Image Bench] Image processing not yet implemented for ComfyUI');
    const state = options?.setSteps ? "SEQUENTIAL_GENERATION" : "HIRES_FIX";
    setGenerationState(state);
    // TODO: Implement processing strategy for ComfyUI
}

/**
 * Handle varying steps generation request
 * @param {Object} options - Varying steps options
 * @param {Object} options.image - Source image with parameters
 * @param {string} [options.steps] - Comma-separated step values (e.g., "10,20,30")
 * @param {string} [options.denoising] - Comma-separated denoising values (optional)
 */
async function handleGenerateVaryingSteps(options) {
    console.log('[Image Bench] handleGenerateVaryingSteps() called with options:', options);

    if (!strategies) {
        console.error('[Image Bench] Strategies not initialized');
        return;
    }

    // Set generation state
    setGenerationState("SEQUENTIAL_GENERATION");
    console.log('[Image Bench] Generation state set to: SEQUENTIAL_GENERATION');

    try {
        // Stop any existing strategy
        if (currentStrategy && currentStrategy.isActive) {
            console.log('[Image Bench] Stopping existing strategy');
            await currentStrategy.finish();
        }

        // Use the pre-created varying parameters strategy
        currentStrategy = strategies.varying;
        console.log('[Image Bench] Using varying parameters strategy:', currentStrategy);

        // Start processing
        console.log('[Image Bench] Calling strategy.process()...');
        await currentStrategy.process(options);

        console.log('[Image Bench] Varying steps generation started successfully');
    } catch (error) {
        console.error('[Image Bench] Failed to start varying steps generation:', error);
        console.error('[Image Bench] Error stack:', error.stack);
    }
}

/**
 * Handle varying denoising upscale request
 * @param {Object} options - Varying denoising options
 */
async function handleUpscaleVaryingDenoising(options) {
    console.log('[Image Bench] handleUpscaleVaryingDenoising() called');
    console.warn('[Image Bench] Varying denoising upscale not yet implemented for ComfyUI');
    setGenerationState("HIRES_FIX");
    // TODO: Implement varying denoising strategy for ComfyUI
}

/**
 * Stop the active strategy (STOP_GENERATION is handled by generation.js, which also interrupts ComfyUI
 * and clears the queue)
 */
async function finishStrategy() {
    if (currentStrategy && currentStrategy.isProcessing()) {
        console.log('[Image Bench] Stopping active strategy');
        try {
            await currentStrategy.finish();
        } catch (error) {
            console.error('[Image Bench] Error stopping strategy:', error);
        }
    }

    setGenerationState("BATCH_GENERATION");
    currentStrategy = null;
}

/**
 * Set image seed
 * @param {Object} payload - Seed payload with payload.parameters.seed
 */
function setImageSeed(payload) {
    console.log('[Image Bench] setImageSeed() called with:', payload);

    if (!uiOperations) {
        console.error('[Image Bench] UIOperations not initialized');
        return;
    }

    if (!payload?.parameters?.seed) {
        console.warn('[Image Bench] No seed found in payload parameters');
        return;
    }

    try {
        const seed = payload.parameters.seed;
        uiOperations.setSeed(seed);
        console.log('[Image Bench] Seed set to:', seed);
    } catch (error) {
        console.error('[Image Bench] Failed to set seed:', error);
    }
}

/**
 * Set image parameters
 * @param {Object} payload - Parameters payload with payload.parameters containing generation settings
 */
function setImageParams(payload) {
    console.log('[Image Bench] setImageParams() called with:', payload);

    if (!uiOperations) {
        console.error('[Image Bench] UIOperations not initialized');
        return;
    }

    if (!payload?.parameters) {
        console.warn('[Image Bench] No parameters found in payload');
        return;
    }

    const params = payload.parameters;

    try {
        // Set seed
        if (params.seed !== undefined) {
            uiOperations.setSeed(params.seed);
            console.log('[Image Bench] Seed set to:', params.seed);
        }

        // Set steps
        if (params.steps !== undefined) {
            uiOperations.setSteps(params.steps);
            console.log('[Image Bench] Steps set to:', params.steps);
        }

        // Set CFG scale
        if (params.cfg !== undefined) {
            uiOperations.setCFG(params.cfg);
            console.log('[Image Bench] CFG set to:', params.cfg);
        }

        // Set denoise
        if (params.denoise !== undefined) {
            uiOperations.setDenoise(params.denoise);
            console.log('[Image Bench] Denoise set to:', params.denoise);
        }

        // Set sampler
        if (params.sampler !== undefined) {
            uiOperations.setSampler(params.sampler);
            console.log('[Image Bench] Sampler set to:', params.sampler);
        }

        // Set scheduler
        if (params.scheduler !== undefined) {
            uiOperations.setScheduler(params.scheduler);
            console.log('[Image Bench] Scheduler set to:', params.scheduler);
        }

        // Set model/checkpoint
        if (params.model !== undefined) {
            uiOperations.restoreModel(params.model);
            console.log('[Image Bench] Model set to:', params.model);
        }

        // Set positive prompt
        if (params.prompt !== undefined) {
            uiOperations.setPrompt(params.prompt);
            console.log('[Image Bench] Prompt set');
        }

        // Set negative prompt
        if (params["negative prompt"] !== undefined) {
            uiOperations.setNegativePrompt(params["negative prompt"]);
            console.log('[Image Bench] Negative prompt set');
        }

        console.log('[Image Bench] All parameters set successfully');
    } catch (error) {
        console.error('[Image Bench] Failed to set parameters:', error);
    }
}

/**
 * Initialize prompts from ComfyUI
 */
function initializePrompts() {
    console.log('[Image Bench] initializePrompts() called');
    console.warn('[Image Bench] Initialize prompts not yet implemented for ComfyUI');
    // TODO: Extract current prompts from ComfyUI workflow and send to popup
}

// Handle page unload
window.addEventListener("beforeunload", () => {
    popupManager.close();
    popupManager.closeWebSocket();
    fetch("/image-bench/close_websocket", { keepalive: true });
});

console.log('[Image Bench] Extension script loaded');