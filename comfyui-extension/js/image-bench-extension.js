/**
 * Image Bench Extension for ComfyUI
 *
 * This extension adds a toolbar button to open the Image Bench popup window
 * and intercepts generated images to display them in real-time.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

import {getGenerationState, setGenerationState} from "./state.js";

// Popup window reference
let popupWindow = null;

// WebSocket connection to backend
let websocket = null;

// Queue for messages before popup is ready
let messageQueue = [];

// System paths from backend
let systemPaths = null;

/**
 * Create and open the popup window
 */
function openPopupWindow() {
    if (popupWindow && !popupWindow.closed) {
        popupWindow.focus();
        return;
    }

    const windowFeatures = 'width=1024,height=720,left=100,top=100';
    popupWindow = window.open("/image-bench/window", 'imageBenchPopup', windowFeatures);

    if (!popupWindow) {
        alert("Failed to open Image Bench window. Please check popup blocker settings.");
        return;
    }

    setGenerationState("BATCH_GENERATION")
    popupWindow.getGenerationState = getGenerationState;

    // Handle popup close
    popupWindow.addEventListener("unload", () => {
        if (popupWindow.location.href !== "about:blank") {
            disposePopup();
        }
    });

    // Setup WebSocket connection
    connectWebSocket();
}

/**
 * Connect to WebSocket for real-time communication
 */
function connectWebSocket() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/image-bench/websocket`;

    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
        console.log('[Image Bench] WebSocket connected');
        // Send queued messages
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            sendToPopup(msg);
        }
    };

    websocket.onclose = () => {
        console.log('[Image Bench] WebSocket disconnected');
        websocket = null;
    };

    websocket.onerror = (error) => {
        console.error('[Image Bench] WebSocket error:', error);
    };

    websocket.onmessage = (event) => {
        try {
            console.log(event.data);
            const data = JSON.parse(event.data);
            // Handle messages from backend if needed
            console.log('[Image Bench] Received:', data);
        } catch (e) {
            console.error('[Image Bench] Failed to parse message:', e);
        }
    };
}

/**
 * Send message to popup window
 */
function sendToPopup(message) {
    // Try to send via window.postMessage first
    if (popupWindow && !popupWindow.closed && popupWindow.onSDEvent) {
        popupWindow.onSDEvent(message);
        return true;
    }

    // Fallback: send via WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
        return true;
    }

    // Queue message for later
    messageQueue.push(message);
    return false;
}

/**
 * Dispose popup and close connections
 */
function disposePopup() {
    popupWindow = null;

    if (websocket) {
        websocket.close();
        websocket = null;
    }

    // Clear message queue
    messageQueue = [];
}

/**
 * Extract image information from execution output
 */
async function extractImageInfo(nodeId, output, promptId) {
    const images = [];

    if (output && output.images) {
        // The output already contains all image information we need
        for (const imageData of output.images) {
            try {
                // Construct full image path
                const imageUrl = `/view?filename=${imageData.filename}&type=${imageData.type || 'output'}&subfolder=${imageData.subfolder || ''}`;
                const imagePath = systemPaths.output_dir + "/" + imageData.filename;

                images.push({
                    imageUrl,
                    imagePath,
                    filename: imageData.filename,
                    subfolder: imageData.subfolder || '',
                    type: imageData.type || 'output'
                });
            } catch (e) {
                console.error('[Image Bench] Failed to process image:', imageData, e);
            }
        }
    }

    return images;
}

/**
 * Extract generation parameters from the workflow
 */
function extractParameters(promptId) {
    // Get the current workflow to extract parameters
    const workflow = app.graph.serialize();
    const params = {
        prompt_id: promptId
    };

    // Try to find common nodes and extract their parameters
    try {
        const nodes = workflow.nodes || [];

        // Find KSampler node
        const sampler = nodes.find(n => n.type === "KSampler");
        if (sampler && sampler.widgets_values) {
            params.seed = sampler.widgets_values[0];
            params.steps = sampler.widgets_values[2];
            params.cfg = sampler.widgets_values[3];
            params.sampler_name = sampler.widgets_values[4];
            params.scheduler = sampler.widgets_values[5];
            params.denoise = sampler.widgets_values[6];
        }

        // Find CheckpointLoaderSimple node
        const checkpoint = nodes.find(n => n.type === "CheckpointLoaderSimple");
        if (checkpoint && checkpoint.widgets_values) {
            params.model = checkpoint.widgets_values[0];
        }

        // Find CLIPTextEncode nodes for prompts
        const promptNodes = nodes.filter(n => n.type === "CLIPTextEncode");
        if (promptNodes.length > 0) {
            params.prompt = promptNodes[0].widgets_values?.[0] || '';
        }
        if (promptNodes.length > 1) {
            params.negative_prompt = promptNodes[1].widgets_values?.[0] || '';
        }
    } catch (e) {
        console.error('[Image Bench] Failed to extract parameters:', e);
    }

    return params;
}

/**
 * Fetch system paths from backend
 */
async function fetchSystemPaths() {
    try {
        const response = await fetch("/image-bench/system_info");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        systemPaths = await response.json();
        console.log('[Image Bench] System paths loaded:', systemPaths);
        return systemPaths;
    } catch (e) {
        console.error('[Image Bench] Failed to fetch system paths:', e);
        return null;
    }
}

/**
 * Get ComfyUI root directory path
 */
export function getComfyUIRoot() {
    return systemPaths?.comfyui_root;
}

/**
 * Get all system paths
 */
export function getSystemPaths() {
    return systemPaths;
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

    button.addEventListener('click', openPopupWindow);

    // Add button to menu bar
    menuBar.appendChild(button);

    console.log('[Image Bench] Toolbar button added');
}

/**
 * Register the extension with ComfyUI
 */
app.registerExtension({
    name: "ImageBench.Extension",

    async setup() {
        console.log('[Image Bench] Extension initializing...');

        // Fetch system paths first
        await fetchSystemPaths();

        // Add toolbar button
        addToolbarButton();

        // Listen for execution completion events
        api.addEventListener("executed", async (event) => {
            const { node, output, prompt_id } = event.detail;

            console.log('[Image Bench] Image generated:', { node, output, prompt_id });

            // Extract image information
            const images = await extractImageInfo(node, output, prompt_id);

            if (images.length > 0) {
                const parameters = extractParameters(prompt_id);

                // Send each image to popup
                for (const imageData of images) {
                    sendToPopup({
                        type: "SAVED_IMAGE",
                        imageUrl: imageData.imageUrl,
                        imagePath: imageData.imagePath,
                        filename: imageData.filename,
                        parameters: parameters
                    });
                }
            }
        });

        // Listen for execution start
        api.addEventListener("execution_start", (event) => {
            const { prompt_id } = event.detail;
            console.log('[Image Bench] Execution started:', prompt_id);

            sendToPopup({
                type: "GENERATION_STARTED",
                prompt_id: prompt_id
            });
        });

        // Listen for execution errors
        api.addEventListener("execution_error", (event) => {
            const { prompt_id, exception_message } = event.detail;
            console.error('[Image Bench] Execution error:', exception_message);

            sendToPopup({
                type: "GENERATION_ERROR",
                prompt_id: prompt_id,
                error: exception_message
            });
        });

        console.log('[Image Bench] Extension initialized successfully');
    },

    async nodeCreated(node) {
        // Can be used to modify nodes if needed in the future
    }
});

// Handle page unload
window.addEventListener("beforeunload", () => {
    if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
    }
    if (websocket) {
        fetch("/image-bench/close_websocket", { keepalive: true });
    }
});

console.log('[Image Bench] Extension script loaded');
