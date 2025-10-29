/**
 * Popup Window Management for Image Bench
 *
 * Unified popup window management with optional WebSocket integration.
 * Handles window lifecycle, message passing, and connection management.
 */

import {getGenerationState, setGenerationState} from "./state.js";
import {createWebSocket, isConnectionOpen} from "./websocket.js";

/**
 * Create a popup manager with the specified configuration
 * @param {Object} config - Configuration object
 * @param {string} config.endpoint - Popup window endpoint (default: '/image-bench/window')
 * @param {boolean} config.integrateWebSocket - Whether to integrate WebSocket (default: false)
 * @param {string} config.windowName - Window name for window.open (default: 'imageBenchPopup')
 * @param {string} config.windowFeatures - Window features string (default: 'width=1024,height=720,left=100,top=100')
 * @returns {Object} Popup manager instance
 */
export function createPopupManager(config = {}) {
  const {
    endpoint = '/image-bench/window',
    integrateWebSocket = false,
    windowName = 'imageBenchPopup',
    windowFeatures = 'width=1024,height=720,left=100,top=100'
  } = config;

  // Internal state
  let popupWindow = null;
  let websocket = null;
  let messageQueue = [];

  /**
   * Connect to WebSocket for real-time communication (ComfyUI mode)
   */
  function connectWebSocket() {
    if (isConnectionOpen(websocket)) {
      return;
    }

    websocket = createWebSocket({
      endpoint: '/image-bench/websocket',
      onOpen: () => {
        console.log('[Image Bench] WebSocket connected');
        // Send queued messages
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          sendMessage(msg);
        }
      },
      onClose: () => {
        console.log('[Image Bench] WebSocket disconnected');
        websocket = null;
      },
      onError: (error) => {
        console.error('[Image Bench] WebSocket error:', error);
      },
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Image Bench] Received:', data);
          // Handle messages from backend if needed
        } catch (e) {
          console.error('[Image Bench] Failed to parse message:', e);
        }
      }
    });
  }

  /**
   * Open the popup window
   * @returns {boolean} True if window was created, false if already open
   */
  function openPopup() {
    if (popupWindow && !popupWindow.closed) {
      popupWindow.focus();
      return false;
    }

    popupWindow = window.open(endpoint, windowName, windowFeatures);

    if (!popupWindow) {
      console.error('[Image Bench] Failed to open popup window. Check popup blocker settings.');
      return false;
    }

    // Set generation state
    setGenerationState("BATCH_GENERATION");

    // Inject getGenerationState function into popup window
    popupWindow.getGenerationState = getGenerationState;

    // Handle popup close
    popupWindow.addEventListener("unload", () => {
      if (popupWindow.location.href !== "about:blank") {
        dispose();
      }
    });

    // Setup WebSocket if integrated mode
    if (integrateWebSocket) {
      connectWebSocket();
    }

    return true;
  }

  /**
   * Send message to popup window
   * @param {Object} message - Message object to send
   * @returns {boolean} True if message was sent
   */
  function sendMessage(message) {
    // Try to send via window.postMessage first (direct method)
    if (popupWindow && !popupWindow.closed && popupWindow.onSDEvent) {
      popupWindow.onSDEvent(message);
      return true;
    }

    // Fallback: send via WebSocket (ComfyUI integrated mode)
    if (integrateWebSocket && isConnectionOpen(websocket)) {
      websocket.send(JSON.stringify(message));
      return true;
    }

    // Queue message for later (only in integrated mode)
    if (integrateWebSocket) {
      messageQueue.push(message);
    }

    return false;
  }

  /**
   * Check if popup is currently open
   * @returns {boolean} True if popup is open
   */
  function isOpen() {
    return popupWindow && !popupWindow.closed;
  }

  /**
   * Close the popup window
   */
  function close() {
    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }
  }

  /**
   * Dispose popup and close connections
   */
  function dispose() {
    popupWindow = null;

    if (websocket) {
      websocket.close();
      websocket = null;
    }

    // Clear message queue
    messageQueue = [];
  }

  /**
   * Close WebSocket connection (separate from popup)
   */
  function closeWebSocket() {
    if (websocket) {
      websocket.close();
      websocket = null;
    }
  }

  // Return public API
  return {
    open: openPopup,
    close,
    dispose,
    sendMessage,
    isOpen,
    closeWebSocket
  };
}
