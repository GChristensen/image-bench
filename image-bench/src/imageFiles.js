/**
 * Image files dropped, pasted or picked in the Generate tab (input and reference images)
 */

// Video and audio files too, where the target takes them (the final image of a project)
const MEDIA_TYPE = /^(image|video|audio)\//;

function accepted(type, media) {
    return media ? MEDIA_TYPE.test(type || "") : (type || "").startsWith("image/");
}

/**
 * Image files of a drop or paste: files, or else the image dragged from a page (e.g. the Generated tab) by its URL
 * @param {DataTransfer|null} dataTransfer
 * @param {{media?: boolean}} options - media: video and audio files too
 * @returns {Promise<File[]>}
 */
export async function imageFilesFromDataTransfer(dataTransfer, {media = false} = {}) {
    if (!dataTransfer)
        return [];

    const files = Array.from(dataTransfer.files || []).filter(file => accepted(file.type, media));

    if (files.length)
        return files;

    const url = (dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain"))
        .split(/\r?\n/).find(line => line && !line.startsWith("#"))?.trim();

    if (!url || !/^(https?:|blob:|data:image\/|\/)/.test(url))
        return [];

    try {
        const response = await fetch(url);
        const blob = await response.blob();

        if (!response.ok || !accepted(blob.type, media))
            return [];

        const name = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop() || "image.png");
        return [new File([blob], name, {type: blob.type})];
    } catch (e) {
        console.error("Unable to load the dropped image:", e);
        return [];
    }
}

/**
 * Let the user choose image files
 * @param {boolean} multiple
 * @param {{media?: boolean}} options - media: video and audio files too
 * @returns {Promise<File[]>} Empty if cancelled
 */
export function pickImageFiles(multiple = false, {media = false} = {}) {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = media ? "image/*,video/*,audio/*" : "image/*";
        input.multiple = multiple;
        input.addEventListener("change", () => resolve(Array.from(input.files || [])));
        input.addEventListener("cancel", () => resolve([]));
        input.click();
    });
}

/**
 * Copy an image to the clipboard; the clipboard takes PNG only, other images are converted
 * @param {string} src - Image URL (also a data URL)
 * @returns {Promise<void>}
 */
export async function copyImageToClipboard(src) {
    let blob = await (await fetch(src)).blob();

    if (blob.type !== "image/png") {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    }

    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
}

/**
 * Natural size of an image
 * @param {string} src
 * @returns {Promise<{width: number, height: number}|null>}
 */
export function getImageSize(src) {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve({width: image.naturalWidth, height: image.naturalHeight});
        image.onerror = () => resolve(null);
        image.src = src;
    });
}
