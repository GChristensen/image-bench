/**
 * Image Bench Extension for ComfyUI
 *
 * This extension adds a toolbar button to open the Image Bench popup window
 * and intercepts generated images to display them in real-time.
 */

import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";
import {fetchSystemPaths} from "./paths.js";
import {extractImageInfo, extractParameters} from "./workflow.js";
import {ComfyUIOperations} from "./facade/ComfyUIOperations.js";
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

/**
 * Load node configuration for marker-based node discovery
 */
async function loadNodeConfig() {
    try {
        const response = await fetch('/image-bench/node_config.json');
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

        // Set up message bus handlers
        setupMessageBusHandlers();
    } catch (error) {
        console.error('[Image Bench] Failed to initialize operations:', error);
    }
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
 * Add toolbar button to ComfyUI interface
 */
function addToolbarButton() {
    // Find the menu bar
    const menuBar = document.querySelector('.comfyui-menu');

    if (!menuBar) {
        console.warn('[Image Bench] Menu bar not found, retrying...');
        setTimeout(addToolbarButton, 1000);
        return;
    }

    // Check if button already exists
    if (document.getElementById('image-bench-button')) {
        return;
    }

    // Create button
    const button = document.createElement('button');
    button.id = 'image-bench-button';
    button.textContent = '🔬 Image Bench';
    button.title = 'Open Image Bench for batch generation management';
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

    // Add button to menu bar
    menuBar.appendChild(button);

    console.log('[Image Bench] Toolbar button added');
}

/**
 * Handle execution completion event
 */
async function handleExecuted(event) {
    const { node, output, prompt_id } = event.detail;

    console.log('[Image Bench] Image generated:', { node, output, prompt_id });

    // Extract image information
    const images = await extractImageInfo(node, output, prompt_id);

    if (images.length > 0) {
        const parameters = extractParameters(prompt_id);

        // Send each image to popup
        for (const imageData of images) {
            const message = {
                type: "SAVED_IMAGE",
                imageUrl: imageData.imageUrl,
                imagePath: imageData.imagePath,
                filename: imageData.filename,
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

    sendPopupMessage({
        type: "BEGIN_PROCESSING",
        prompt_id: prompt_id
    });
}

/**
 * Handle execution error event
 */
function handleExecutionError(event) {
    const { prompt_id, exception_message } = event.detail;
    console.error('[Image Bench] Execution error:', exception_message);

    sendPopupMessage({
        type: "GENERATION_ERROR",
        prompt_id: prompt_id,
        error: exception_message
    });
}

/**
 * Handle postMessage from popup window (analogous to WebUI's onMessage)
 */
function handlePostMessage(event) {
    // Only handle messages from our popup window
    // In production, you should verify event.origin for security

    const payload = event.data;
    const { type } = payload;

    console.log('[Image Bench] Received message:', type);

    if (type === "INITIALIZE_PROMPTS")
        initializePrompts();
    else if (type === "STOP_GENERATION")
        stopGeneration();
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
 */
async function handleGenerateVaryingSteps(options) {
    console.log('[Image Bench] handleGenerateVaryingSteps() called');
    console.warn('[Image Bench] Varying steps generation not yet implemented for ComfyUI');
    setGenerationState("SEQUENTIAL_GENERATION");
    // TODO: Implement varying parameters strategy for ComfyUI
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
 * Stop current generation
 * Interrupts ComfyUI execution and stops any active strategy
 */
async function stopGeneration() {
    console.log('[Image Bench] stopGeneration() called');

    // 1. Interrupt current ComfyUI execution
    if (uiOperations) {
        const interrupted = uiOperations.interrupt();
        console.log('[Image Bench] ComfyUI execution interrupted:', interrupted);
    }

    // 2. Stop active strategy
    if (currentStrategy && currentStrategy.isProcessing()) {
        console.log('[Image Bench] Stopping active strategy');
        try {
            await currentStrategy.finish();
        } catch (error) {
            console.error('[Image Bench] Error stopping strategy:', error);
        }
    }

    // 3. Reset state
    setGenerationState("BATCH_GENERATION");
    currentStrategy = null;
    console.log('[Image Bench] Generation state reset to: BATCH_GENERATION');

    // 4. Notify popup
    sendPopupMessage({
        type: "GENERATION_STOPPED"
    });
}

/**
 * Set image seed
 * @param {Object} payload - Seed payload
 */
function setImageSeed(payload) {
    console.log('[Image Bench] setImageSeed() called with:', payload);
    console.warn('[Image Bench] Set image seed not yet implemented for ComfyUI');
    // TODO: Implement seed setting for ComfyUI
}

/**
 * Set image parameters
 * @param {Object} payload - Parameters payload
 */
function setImageParams(payload) {
    console.log('[Image Bench] setImageParams() called with:', payload);
    console.warn('[Image Bench] Set image params not yet implemented for ComfyUI');
    // TODO: Implement parameter setting for ComfyUI
}

/**
 * Initialize prompts from ComfyUI
 */
function initializePrompts() {
    console.log('[Image Bench] initializePrompts() called');
    console.warn('[Image Bench] Initialize prompts not yet implemented for ComfyUI');
    // TODO: Extract current prompts from ComfyUI workflow and send to popup
}

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

        // Listen for postMessage from popup window
        window.addEventListener("message", handlePostMessage);

        console.log('[Image Bench] Extension initialized successfully');
    },

    async nodeCreated(node) {
        // Can be used to modify nodes if needed in the future
    }
});

// Handle page unload
window.addEventListener("beforeunload", () => {
    popupManager.close();
    popupManager.closeWebSocket();
    fetch("/image-bench/close_websocket", { keepalive: true });
});

console.log('[Image Bench] Extension script loaded');

// Export operations facade for use by strategies
export function getUIOperations() {
    return uiOperations;
}

export function getNodeConfig() {
    return nodeConfig;
}
