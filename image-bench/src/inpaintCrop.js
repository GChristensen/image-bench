/**
 * The crop of "Only masked" inpainting, computed as WebUI does (modules/masking.py): the bounding box of the mask,
 * grown by the padding and then to the aspect of Resize to. The Generate tab draws it over the mask and sets
 * Resize to from it (a factor of the padded box, in multiples of 16).
 */

export const CROP_FACTORS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5];

const SIZE_MULTIPLE = 16;
// The maximum of the WebUI size sliders
const MAX_SIZE = 2048;

/**
 * Size and bounding box of the masked pixels of a mask image, as WebUI binarizes it (create_binary_mask):
 * the alpha channel if the image has transparency, else the brightness, above 128
 * @param {string} src
 * @param {boolean} inverted the unmasked pixels ("Inpaint not masked")
 * @returns {Promise<{width: number, height: number, box: number[]|null}|null>} box as [x1, y1, x2, y2], x2 and y2
 *   exclusive, null if nothing is masked; null if the image does not load
 */
export function maskBounds(src, inverted = false) {
    return new Promise(resolve => {
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", {willReadFrequently: true});
            context.drawImage(image, 0, 0);

            let data;

            try {
                data = context.getImageData(0, 0, width, height).data;
            } catch {
                resolve(null);
                return;
            }

            let transparent = false;

            for (let i = 3; i < data.length; i += 4)
                if (data[i] !== 255) {
                    transparent = true;
                    break;
                }

            let x1 = width, y1 = height, x2 = -1, y2 = -1;

            for (let y = 0, i = 0; y < height; y++)
                for (let x = 0; x < width; x++, i += 4) {
                    const value = transparent ? data[i + 3]
                        : (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

                    if (value > 128 !== inverted) {
                        if (x < x1) x1 = x;
                        if (x > x2) x2 = x;
                        if (y < y1) y1 = y;
                        y2 = y;
                    }
                }

            resolve({width, height, box: x2 < 0 ? null : [x1, y1, x2 + 1, y2 + 1]});
        };
        image.src = src;
    });
}

/**
 * How far WebUI's mask blur reaches beyond the mask, which widens the box it crops (the Gaussian kernel half-width)
 * @param {number} blur
 * @returns {number}
 */
export function blurExtent(blur) {
    return blur > 0 ? Math.floor(2.5 * blur + 0.5) : 0;
}

/**
 * The box grown by the padding, within the image (get_crop_region_v2)
 * @param {{width: number, height: number, box: number[]}} bounds
 * @param {number} padding
 * @returns {number[]} [x1, y1, x2, y2]
 */
export function cropRegion(bounds, padding) {
    const [x1, y1, x2, y2] = bounds.box;

    return [Math.max(x1 - padding, 0), Math.max(y1 - padding, 0),
        Math.min(x2 + padding, bounds.width), Math.min(y2 + padding, bounds.height)];
}

/**
 * The region grown to the aspect of the processing size, shifted back into the image at its edges
 * (expand_crop_region): the part of the image that is regenerated
 * @param {number[]} region [x1, y1, x2, y2]
 * @param {number} width processing width (Resize to)
 * @param {number} height processing height
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {number[]}
 */
export function expandCropRegion(region, width, height, imageWidth, imageHeight) {
    let [x1, y1, x2, y2] = region;
    const ratioProcessing = width / height;

    if ((x2 - x1) / (y2 - y1) > ratioProcessing) {
        const diff = Math.trunc((x2 - x1) / ratioProcessing - (y2 - y1));
        y1 -= Math.floor(diff / 2);
        y2 += diff - Math.floor(diff / 2);

        if (y2 >= imageHeight) {
            y1 -= y2 - imageHeight;
            y2 = imageHeight;
        }

        if (y1 < 0) {
            y2 -= y1;
            y1 = 0;
        }

        y2 = Math.min(y2, imageHeight);
    } else {
        const diff = Math.trunc((y2 - y1) * ratioProcessing - (x2 - x1));
        x1 -= Math.floor(diff / 2);
        x2 += diff - Math.floor(diff / 2);

        if (x2 >= imageWidth) {
            x1 -= x2 - imageWidth;
            x2 = imageWidth;
        }

        if (x1 < 0) {
            x2 -= x1;
            x1 = 0;
        }

        x2 = Math.min(x2, imageWidth);
    }

    return [x1, y1, x2, y2];
}

/**
 * Processing size rendering the region enlarged by a factor, in the nearest multiples of 16,
 * scaled down to the maximum size if it exceeds it
 * @param {number[]} region [x1, y1, x2, y2]
 * @param {number} factor
 * @returns {{width: number, height: number}}
 */
export function renderSize(region, factor) {
    const width = (region[2] - region[0]) * factor;
    const height = (region[3] - region[1]) * factor;
    const scale = Math.min(1, MAX_SIZE / Math.max(width, height));
    const round = value => Math.min(MAX_SIZE, Math.max(SIZE_MULTIPLE,
        Math.round(value * scale / SIZE_MULTIPLE) * SIZE_MULTIPLE));

    return {width: round(width), height: round(height)};
}
