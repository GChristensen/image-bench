/**
 * ControlNet inputs of the generations: the enabled units are captured when a generation is queued
 * and saved by the backend under an id that the generated images carry (controlnetId),
 * shown in the generation parameters overlay of the popup (see shared_backend/controlnet_capture.py)
 */

const CAPTURE_ENDPOINT = '/image-bench/controlnet/capture';
const IMAGE_KINDS = ['image', 'mask', 'preview'];

function createCaptureId() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const suffix = Math.random().toString(36).slice(2, 6);

    return `cn_${date}_${time}_${suffix}`;
}

function toDataUrl(blob) {
    if (!blob)
        return Promise.resolve(null);

    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
    });
}

/**
 * @param {Object} host - Of the controlnet.js of the host, called with the arguments of capture()
 * @param {(...args) => boolean} host.hasEnabledUnits
 * @param {(...args) => Promise<{index: number, params: Object, image: Blob|null, mask: Blob|null,
 *     preview?: Blob|null}[]>} host.captureUnits - The enabled units
 */
export function createControlNetCapture({hasEnabledUnits, captureUnits}) {
    // The last capture sent and its content, so that an equal one only refers to its files
    let last = null;
    // Captures are sent in order, so that a capture equal to the previous one finds it saved
    let sending = Promise.resolve();

    /**
     * Capture the units now; the id is known at once, so that the images of the generation can carry it
     * before the capture is saved
     * @returns {string|null} The capture id, null if no unit is enabled
     */
    function capture(...args) {
        if (!hasEnabledUnits(...args))
            return null;

        const id = createCaptureId();
        const units = captureUnits(...args).catch(error => {
            console.warn('[Image Bench] Unable to capture the ControlNet units:', error);
            return [];
        });

        sending = sending.then(async () => {
            const content = await Promise.all((await units).map(async unit => {
                const result = {index: unit.index, params: unit.params};

                for (const kind of IMAGE_KINDS)
                    result[kind] = await toDataUrl(unit[kind]);

                return result;
            }));

            if (!content.length)
                return;

            const key = JSON.stringify(content);
            const body = last?.key === key ? {id, sameAs: last.id} : {id, units: content};

            try {
                const response = await fetch(CAPTURE_ENDPOINT, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body)
                });

                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);

                last = {id, key};
            } catch (error) {
                console.warn('[Image Bench] Unable to save the ControlNet units:', error);
            }
        });

        return id;
    }

    return {capture};
}
