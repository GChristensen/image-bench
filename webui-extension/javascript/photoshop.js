/**
 * Receives images sent by the Image Bench Photoshop plugin and passes them to core.js, which puts them
 * into img2img (the inpaint upload by default) or a ControlNet unit. The connection is kept regardless of the popup state.
 */

import {createWebSocket} from "./shared/websocket.js";

const ENDPOINT = '/image-bench/photoshop/websocket';
const RECONNECT_DELAY = 5000;

/**
 * Connect to the backend and keep reconnecting if the connection is lost (e.g. WebUI restarts)
 * @param {(kind: 'image'|'mask', file: File, target: string) => Promise<void>} onImage - Inserts a received image;
 *   target: 'input' (img2img) or a ControlNet target ('cn_preprocess', 'cn_image', 'cn_mask')
 */
export function initPhotoshopBridge(onImage) {
    createWebSocket({
        endpoint: ENDPOINT,
        onMessage: (e) => onPhotoshopMessage(onImage, e),
        onClose: () => setTimeout(() => initPhotoshopBridge(onImage), RECONNECT_DELAY)
    });
}

/**
 * Add a "Photoshop" link next to Download/Close under ControlNet preprocessor previews, which sends
 * the preview to Photoshop as a new document. The preview elements have random uuid ids, so they are
 * located by class; the observer covers units that Gradio renders later.
 * @param {(message: string) => void} showAlert - Shows errors in the popup or in the WebUI window
 */
export function initControlNetPreviewButtons(showAlert) {
    let scheduled = false;

    const addButtons = () => {
        scheduled = false;

        for (const closeBlock of document.querySelectorAll(
                ".cnet-generated-image-control-group > * > .cnet-close-preview:not([data-image-bench])")) {
            closeBlock.dataset.imageBench = "";
            closeBlock.before(createSendBlock(closeBlock, showAlert));
        }
    };

    addButtons();

    new MutationObserver(() => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(addButtons);
        }
    }).observe(document.body, {childList: true, subtree: true});
}

/**
 * Clone the Close block. ControlNet styles the links by class, cnet-download-preview keeps the style
 * without matching the Close selector above.
 */
function createSendBlock(closeBlock, showAlert) {
    const block = closeBlock.cloneNode(true);
    block.removeAttribute("id");
    delete block.dataset.imageBench;

    for (const element of [block, ...block.querySelectorAll(".cnet-close-preview")]) {
        element.classList.replace("cnet-close-preview", "cnet-download-preview");
        element.classList.add("image-bench-send-preview");
    }

    const link = block.querySelector("a");
    link.removeAttribute("onclick");
    link.title = "Send to Photoshop as a new document";
    link.textContent = "Photoshop";
    link.addEventListener("click", () => sendControlNetPreview(link, showAlert));

    return block;
}

async function sendControlNetPreview(link, showAlert) {
    const container = link.closest(".cnet-generated-image-group")
        ?.querySelector("[id$='_generated_image']");
    const image = container?.querySelector("img.forge-image");

    if (!image?.getAttribute("src") || !image.complete || image.naturalWidth === 0)
        return;

    // txt2img_controlnet_ControlNet-0_generated_image -> txt2img ControlNet-0 preview
    const unit = container.id.replace(/_generated_image$/, "").replace("_controlnet_", " ");
    const error = await sendImageToPhotoshop(image.src, `${unit} preview`, true);

    if (error)
        showAlert(error);
}

/**
 * Send an image to the Photoshop plugin, which places it as a layer of the active document
 * @param {string} src - Image URL (also a data URL)
 * @param {string} name - Name of the layer or document
 * @param {boolean} newDocument - Open the image as a new document even if there is an active one
 * @returns {Promise<string|null>} Error message, null on success
 */
export async function sendImageToPhotoshop(src, name, newDocument = false) {
    try {
        const blob = await (await fetch(src)).blob();
        const response = await fetch(`/image-bench/photoshop/send?name=${encodeURIComponent(name)}`
            + `&new_document=${newDocument}`, {
            method: "POST",
            headers: {"Content-Type": blob.type},
            body: blob
        });

        if (!response.ok)
            return `Unable to send the image: ${await response.text()}`;

        if (!(await response.json()).clients)
            return "Photoshop is not connected. Please open the Image Bench panel in Photoshop.";

        return null;
    } catch (error) {
        return `Unable to send the image: ${error.message}`;
    }
}

async function onPhotoshopMessage(onImage, e) {
    const msg = JSON.parse(e.data);

    if (msg.type !== "PHOTOSHOP_IMAGE")
        return;

    try {
        const response = await fetch(msg.imageUrl);

        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);

        const file = new File([await response.blob()], `photoshop-${msg.kind}.png`, {type: "image/png"});
        await onImage(msg.kind, file, msg.target ?? "input");
    } catch (error) {
        console.error(`[Image Bench] Unable to insert ${msg.kind} from Photoshop:`, error);
    }
}
