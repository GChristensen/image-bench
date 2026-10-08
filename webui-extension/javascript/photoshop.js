/**
 * Receives images sent by the Image Bench Photoshop plugin and inserts them into
 * the inpaint upload tab of img2img. The connection is kept regardless of the popup state.
 */

import {createWebSocket} from "./shared/websocket.js";

const ENDPOINT = '/image-bench/photoshop/websocket';
const RECONNECT_DELAY = 5000;

/**
 * Connect to the backend and keep reconnecting if the connection is lost (e.g. WebUI restarts)
 * @param {UIOperations} uiOperations - WebUI operations facade
 */
export function initPhotoshopBridge(uiOperations) {
    createWebSocket({
        endpoint: ENDPOINT,
        onMessage: (e) => onPhotoshopMessage(uiOperations, e),
        onClose: () => setTimeout(() => initPhotoshopBridge(uiOperations), RECONNECT_DELAY)
    });
}

async function onPhotoshopMessage(uiOperations, e) {
    const msg = JSON.parse(e.data);

    if (msg.type !== "PHOTOSHOP_IMAGE")
        return;

    try {
        const response = await fetch(msg.imageUrl);

        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);

        const file = new File([await response.blob()], `photoshop-${msg.kind}.png`, {type: "image/png"});
        await uiOperations.setInpaintUploadImage(msg.kind, file);
    } catch (error) {
        console.error(`[Image Bench] Unable to insert ${msg.kind} from Photoshop:`, error);
    }
}
