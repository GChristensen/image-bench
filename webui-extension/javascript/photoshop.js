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

    try {
        const blob = await (await fetch(image.src)).blob();
        const response = await fetch(`/image-bench/photoshop/send?name=${encodeURIComponent(`${unit} preview`)}`
            + "&new_document=true", {
            method: "POST",
            headers: {"Content-Type": blob.type},
            body: blob
        });

        if (!response.ok)
            showAlert(`Unable to send the image: ${await response.text()}`);
        else if (!(await response.json()).clients)
            showAlert("Photoshop is not connected. Please open the Image Bench panel in Photoshop.");
    } catch (error) {
        showAlert(`Unable to send the image: ${error.message}`);
    }
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
