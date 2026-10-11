/**
 * Images of LoadImage nodes: uploading files to the ComfyUI input directory, setting them on node widgets,
 * and the URLs the popup shows them by. Files are uploaded under fixed names (one per purpose) and overwritten;
 * a version per file name keeps the popup and the node previews from showing a cached image.
 */

import {api} from "../../scripts/api.js";
import {getTargetWidget, setTargetWidgetValue} from "./workflow.js";

// Versions of the input files set by Image Bench, by file name
const versions = new Map();

/**
 * Upload an image file to the ComfyUI input directory
 * @param {File|Blob} file
 * @param {string} name - File name in the input directory, overwritten
 * @returns {Promise<string>} Widget value of the uploaded file
 */
export async function uploadInputImage(file, name) {
    const body = new FormData();
    body.append("image", file, name);
    body.append("type", "input");
    body.append("overwrite", "true");

    const response = await api.fetchApi("/upload/image", {method: "POST", body});

    if (!response.ok)
        throw new Error(`Unable to upload the image: ${response.status} ${await response.text()}`);

    const data = await response.json();
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

/**
 * Upload a mask file (white is masked, or transparent where masked) to the ComfyUI input directory.
 * The backend stores it as an RGBA image readable as a mask by any ComfyUI loader (photoshop.mask_to_png).
 * @param {File|Blob} file
 * @param {string} name - File name in the input directory, overwritten
 * @returns {Promise<string>} Widget value of the uploaded file
 */
export async function uploadInputMask(file, name) {
    const response = await fetch(`/image-bench/input_mask?name=${encodeURIComponent(name)}`, {method: "POST", body: file});

    if (!response.ok)
        throw new Error(`Unable to upload the mask: ${response.status} ${await response.text()}`);

    return (await response.json()).name;
}

/**
 * Set a file of the input directory on the image widget of a LoadImage target
 * @param {Object} target - MarkerTarget
 * @param {string} widgetName
 * @param {string} filename - Widget value
 * @returns {boolean} Whether the widget was found
 */
export function setLoadImage(target, widgetName, filename) {
    const widget = target && getTargetWidget(target, widgetName);

    if (!widget)
        return false;

    // The file may be new to the combo options loaded with the node definitions
    const values = widget.options?.values;

    if (Array.isArray(values) && !values.includes(filename))
        values.push(filename);

    versions.set(filename, (versions.get(filename) ?? 0) + 1);
    return setTargetWidgetValue(target, widgetName, filename);
}

/**
 * The /view URL of an image widget value ("sub/name.png [input]")
 * @param {string} value
 * @returns {string|null}
 */
export function getViewUrl(value) {
    if (!value || typeof value !== "string")
        return null;

    const match = value.match(/^(.*?)(?:\s*\[(input|output|temp)])?$/);
    const path = match[1];
    const type = match[2] ?? "input";
    const slash = path.lastIndexOf("/");
    const filename = path.slice(slash + 1);
    const subfolder = slash >= 0 ? path.slice(0, slash) : "";
    const version = versions.get(value) ?? 0;

    return `/view?filename=${encodeURIComponent(filename)}&type=${type}&subfolder=${encodeURIComponent(subfolder)}`
        + `&v=${version}`;
}

/**
 * @param {Object} target - MarkerTarget of a LoadImage node
 * @param {string} widgetName
 * @returns {string|null} The /view URL of its image
 */
export function getTargetImageUrl(target, widgetName) {
    return getViewUrl(target && getTargetWidget(target, widgetName)?.value);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load ${src}`));
        image.src = src;
    });
}

/**
 * Mask values (white is masked) of an image: 1 - alpha if it has transparency
 * (the mask editor and Image Bench masks), else its brightness
 * @param {HTMLImageElement|ImageBitmap} image
 * @returns {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, data: ImageData, values: Uint8ClampedArray}}
 */
function readMask(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.drawImage(image, 0, 0);

    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = data.data;
    const values = new Uint8ClampedArray(pixels.length / 4);
    let transparent = false;

    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) {
            transparent = true;
            break;
        }
    }

    for (let i = 0; i < values.length; i++) {
        const p = i * 4;
        values[i] = transparent ? 255 - pixels[p + 3] : (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
    }

    return {canvas, context, data, values};
}

/**
 * A white-on-black picture of a mask image, as the popup shows masks
 * @param {string} src
 * @returns {Promise<string>} Data URL
 */
export async function getMaskPreview(src) {
    const {canvas, context, data, values} = readMask(await loadImage(src));
    const pixels = data.data;

    for (let i = 0; i < values.length; i++)
        pixels.set([values[i], values[i], values[i], 255], i * 4);

    context.putImageData(data, 0, 0);
    return canvas.toDataURL("image/png");
}

/**
 * The size of an image
 * @param {string} src
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageSize(src) {
    const image = await loadImage(src);
    return {width: image.naturalWidth, height: image.naturalHeight};
}
