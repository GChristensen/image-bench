/**
 * Image Bench Extension for ComfyUI
 *
 * This extension adds a toolbar button to open the Image Bench popup window
 * and intercepts generated images to display them in real-time.
 */

import {app} from "../../scripts/app.js";
import {api} from "../../scripts/api.js";
import {fetchSystemPaths} from "./paths.js";
import {closePopup, closeWebSocket, openPopupWindow, sendPopupMessage} from "./popup.js";
import {extractImageInfo, extractParameters} from "./workflow.js";

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
            sendPopupMessage({
                type: "SAVED_IMAGE",
                imageUrl: imageData.imageUrl,
                imagePath: imageData.imagePath,
                filename: imageData.filename,
                parameters: parameters
            });
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

        // Register event listeners
        api.addEventListener("executed", handleExecuted);
        api.addEventListener("execution_start", handleExecutionStart);
        api.addEventListener("execution_error", handleExecutionError);

        console.log('[Image Bench] Extension initialized successfully');
    },

    async nodeCreated(node) {
        // Can be used to modify nodes if needed in the future
    }
});

// Handle page unload
window.addEventListener("beforeunload", () => {
    closePopup();
    closeWebSocket();
    fetch("/image-bench/close_websocket", { keepalive: true });
});

console.log('[Image Bench] Extension script loaded');
