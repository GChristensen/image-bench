/**
 * Send an image to the Image Bench Photoshop plugin from a host page (SD WebUI or ComfyUI)
 * @param {string} src - Image source (URL, data URL or blob URL)
 * @param {string} name - Layer or document name
 * @param {boolean} newDocument - Open the image as a new document even if there is an active one
 * @returns {Promise<string|null>} Error message, or null on success
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
