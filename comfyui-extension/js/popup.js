/**
 * Popup Window Management for Image Bench
 *
 * This module handles the popup window lifecycle, WebSocket communication,
 * and message passing between the ComfyUI extension and the Image Bench UI.
 */

import {getGenerationState, setGenerationState} from "./state.js";

// Popup window reference
let popupWindow = null;

// WebSocket connection to backend
let websocket = null;

// Queue for messages before popup is ready
let messageQueue = [];

/**
 * Create and open the popup window
 */
export function openPopupWindow() {
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
            sendPopupMessage(msg);
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
export function sendPopupMessage(message) {
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
export function disposePopup() {
    popupWindow = null;

    if (websocket) {
        websocket.close();
        websocket = null;
    }

    // Clear message queue
    messageQueue = [];
}

/**
 * Check if popup is currently open
 */
export function isPopupOpen() {
    return popupWindow && !popupWindow.closed;
}

/**
 * Close the popup window
 */
export function closePopup() {
    if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
    }
}

/**
 * Close the websocket connection
 */
export function closeWebSocket() {
    if (websocket) {
        websocket.close();
        websocket = null;
    }
}