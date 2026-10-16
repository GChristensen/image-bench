/**
 * ControlNet units for the ControlNet tab of the popup and the ControlNet targets of the Photoshop plugin,
 * the ComfyUI counterpart of webui-extension/javascript/controlnet.js with the same messages.
 * Unit N is the ControlNet apply node marked ib:cn:N (node types in the "controlnet" section of node_config.json):
 * its strength and percent range are the weight and guidance range, the loader linked to its control_net input
 * holds the model, the LoadImage linked to its image input (directly or through an AIO_Preprocessor)
 * the control image, and the loader linked to mask_optional (Advanced-ControlNet apply nodes) the mask.
 * A unit is enabled when its apply node is not bypassed.
 * The preprocessor (comfyui_controlnet_aux) is that of an AIO_Preprocessor in front of the unit, else a choice kept
 * here; "Run preprocessor" queues a separate three-node prompt at the front of the queue and shows its result.
 */

import {MARKER_ROLES, getMarkerTargets, getNodeMarkerIndex, getRoleMarker, getTargetWidget,
        setTargetWidgetValue} from "./workflow.js";
import {findUpstream, getLinkedSource, MODE_ALWAYS, MODE_BYPASS} from "./graph.js";
import {getImageSize, getMaskPreview, getTargetImageUrl, setLoadImage, uploadInputImage,
        uploadInputMask} from "./images.js";
import {sendImageToPhotoshop} from "./shared/photoshop-send.js";
import {getWidgetChoices} from "./params.js";

const POLL_INTERVAL = 600;
const APPLY_SETTLE_DELAY = 300;
const PREPROCESS_TIMEOUT = 120000;
const PREPROCESSOR_NODE = 'AIO_Preprocessor';
const DEFAULT_RESOLUTION = 512;
// Size assumed for Pixel Perfect when the workflow has no latent size
const DEFAULT_SIZE = 1024;
// Events of a preprocessor prompt may arrive after it is done with
const OWNED_PROMPT_LIFETIME = 60000;

/**
 * A random UUID; crypto.randomUUID() needs a secure context, which ComfyUI opened by a LAN address is not
 */
function createUuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 0x0f | 0x40;
    bytes[8] = bytes[8] & 0x3f | 0x80;

    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Preprocessor resolution of Pixel Perfect (as in WebUI, for "Crop and Resize")
 */
function getPixelPerfectResolution(image, width, height) {
    const scale = Math.max(height / image.height, width / image.width);
    return Math.round(scale * Math.min(image.width, image.height));
}

/**
 * @param {Object} ctx - {app, api, ops, popup: {sendMessage, isOpen}, showAlert}
 */
export function createControlNet({app, api, ops, popup, showAlert}) {
    let timer = null;
    // Unit shown in the popup, also the one that receives images from Photoshop
    let unit = 0;
    let lastState = null;
    let lastImages = null;
    let running = false;
    // Per unit: preprocessor chosen in the popup (units without an AIO_Preprocessor), Pixel Perfect, preview URL
    const choices = new Map();
    const previews = new Map();
    // Prompts queued to run a preprocessor: prompt id -> {resolve, reject}, and all of them for a while
    const preprocessPrompts = new Map();
    const ownedPrompts = new Set();
    const imageSizes = new Map();

    const getConfig = () => ops.nodeConfig?.controlnet ?? {};
    const hasPreprocessorNode = () => !!window.LiteGraph?.registered_node_types?.[PREPROCESSOR_NODE];

    api.addEventListener('executed', e => {
        const pending = preprocessPrompts.get(e.detail?.prompt_id);
        const image = e.detail?.output?.images?.[0];

        if (pending && image)
            pending.resolve(`/view?filename=${encodeURIComponent(image.filename)}&type=${image.type || 'temp'}`
                + `&subfolder=${encodeURIComponent(image.subfolder || '')}&t=${Date.now()}`);
    });

    api.addEventListener('execution_error', e => {
        preprocessPrompts.get(e.detail?.prompt_id)?.reject(new Error(e.detail.exception_message || 'Preprocessing failed'));
    });

    function getChoice(index) {
        if (!choices.has(index))
            choices.set(index, {preprocessor: 'none', pixelPerfect: true});

        return choices.get(index);
    }

    // ---------- Units ----------

    function getUnitTargets() {
        const role = MARKER_ROLES.controlnet;
        const marker = getRoleMarker(role, ops.nodeConfig);

        return getMarkerTargets(app, role, ops.nodeConfig)
            .map((target, order) => ({target, order, index: getNodeMarkerIndex(target.host, marker) ?? 0}))
            .sort((a, b) => a.index - b.index || a.order - b.order)
            .map(({target}) => target);
    }

    /**
     * Find a node of the given types and its widget, by type
     * @returns {{target: Object, widgetName: string}|null}
     */
    function findNode(start, via, widgetsByType) {
        const types = Object.keys(widgetsByType ?? {});
        const target = start && findUpstream(start, {via, deep: true, types, stopTypes: getConfig().nodeTypes ?? []});
        return target && {target, widgetName: widgetsByType[target.source.type]};
    }

    /**
     * The nodes of a unit
     * @param {number} index
     * @returns {Object|null} {target, loader, preprocessor, image, mask, hasMaskInput}
     */
    function resolveUnit(index) {
        const target = getUnitTargets()[index];

        if (!target)
            return null;

        const config = getConfig();
        const linked = getLinkedSource(target, 'image');
        const preprocessor = linked && (config.preprocessorTypes ?? []).includes(linked.source.type) ? linked : null;
        const hasMaskInput = !!target.source.inputs?.some(input => input.name === 'mask_optional');

        return {
            target,
            loader: findNode(target, ['control_net'], config.loaderTypes),
            preprocessor,
            image: findNode(preprocessor ?? target, ['image'], config.imageTypes),
            mask: hasMaskInput ? findNode(target, ['mask_optional'], config.maskTypes) : null,
            hasMaskInput
        };
    }

    const widgetOf = node => node && getTargetWidget(node.target, node.widgetName);
    const canBypass = target => target.host === target.source;
    const isEnabled = target => !canBypass(target) || target.source.mode !== MODE_BYPASS;

    function setEnabled(target, enabled) {
        if (canBypass(target))
            target.source.mode = enabled ? MODE_ALWAYS : MODE_BYPASS;
    }

    // ---------- Mirror ----------

    /**
     * Start or stop sending the state of a unit (the ControlNet tab is shown or hidden, or another unit is chosen)
     * @param {boolean} active
     * @param {number} unitIndex
     */
    function subscribe(active, unitIndex = unit) {
        clearInterval(timer);
        timer = null;
        unit = unitIndex;

        if (active) {
            lastState = null;
            lastImages = null;
            timer = setInterval(poll, POLL_INTERVAL);
            poll();
        }
    }

    function poll() {
        if (!popup.isOpen()) {
            subscribe(false);
            return;
        }

        const resolved = resolveUnit(unit);
        const state = captureState(resolved);
        const json = JSON.stringify(state);

        if (json !== lastState) {
            lastState = json;
            popup.sendMessage({type: "CONTROLNET_STATE", ...state});
        }

        sendImages(resolved);
        updatePixelPerfect(resolved);
    }

    function pollIfActive() {
        if (timer)
            poll();
    }

    function captureState(resolved) {
        const units = getUnitTargets().map(target => ({enabled: isEnabled(target)}));
        const base = {tab: 'txt2img', unit, units, running};

        if (!resolved)
            return {...base, available: false};

        // The models are those the loader node offers (custom loaders may list other folders than "controlnet")
        return {...base, available: true, ...readUnit(resolved, unit),
                options: {controlType: [], controlMode: [], resizeMode: [],
                          models: getWidgetChoices(widgetOf(resolved.loader)) ?? undefined}};
    }

    /**
     * Parameters of a unit and the features its nodes provide
     * @returns {{params: Object, features: Object}}
     */
    function readUnit(resolved, index) {
        const {target, loader, preprocessor, mask, hasMaskInput} = resolved;
        const choice = getChoice(index);
        const aux = hasPreprocessorNode();
        const value = name => getTargetWidget(target, name)?.value ?? null;

        const params = {
            enabled: isEnabled(target),
            pixelPerfect: choice.pixelPerfect,
            useMask: !!mask && isEnabled(mask.target),
            preprocessor: preprocessor ? getTargetWidget(preprocessor, 'preprocessor')?.value ?? null : choice.preprocessor,
            model: widgetOf(loader)?.value ?? null,
            weight: value(getConfig().widgetNames?.[target.source.type] ?? 'strength'),
            guidanceStart: value('start_percent'),
            guidanceEnd: value('end_percent'),
            controlType: null,
            controlMode: null,
            resizeMode: null,
            independent: null,
            allowPreview: true
        };

        const features = {
            preprocessor: aux,
            pixelPerfect: aux,
            mask: hasMaskInput,
            model: !!loader
        };

        return {params, features};
    }

    /**
     * Images of the unit, sent apart from the state; the mask is shown white on black
     */
    async function sendImages(resolved) {
        const image = resolved?.image ? getTargetImageUrl(resolved.image.target, resolved.image.widgetName) : null;
        const maskUrl = resolved?.mask && isEnabled(resolved.mask.target)
            ? getTargetImageUrl(resolved.mask.target, resolved.mask.widgetName) : null;
        const preview = previews.get(unit) ?? null;
        const signature = [unit, image, maskUrl, preview].join('|');

        if (signature === lastImages)
            return;

        lastImages = signature;

        let mask = null;

        try {
            mask = maskUrl && await getMaskPreview(maskUrl);
        } catch (error) {
            console.warn('[Image Bench] Unable to read the ControlNet mask:', error);
        }

        if (signature === lastImages)
            popup.sendMessage({type: "CONTROLNET_IMAGES", tab: 'txt2img', unit, image, mask, preview});
    }

    async function getResolution(resolved, index) {
        const url = resolved.image && getTargetImageUrl(resolved.image.target, resolved.image.widgetName);

        if (!getChoice(index).pixelPerfect || !url)
            return DEFAULT_RESOLUTION;

        if (!imageSizes.has(url))
            imageSizes.set(url, await getImageSize(url));

        const width = Number(ops.params.getValue('width')) || DEFAULT_SIZE;
        const height = Number(ops.params.getValue('height')) || DEFAULT_SIZE;
        return getPixelPerfectResolution(imageSizes.get(url), width, height);
    }

    /**
     * Keep the resolution of an AIO_Preprocessor in front of the unit at the Pixel Perfect one
     */
    async function updatePixelPerfect(resolved) {
        const widget = resolved?.preprocessor && getTargetWidget(resolved.preprocessor, 'resolution');

        if (!widget || !getChoice(unit).pixelPerfect)
            return;

        try {
            const resolution = await getResolution(resolved, unit);

            if (widget.value !== resolution)
                setTargetWidgetValue(resolved.preprocessor, 'resolution', resolution);
        } catch (error) {
            console.warn('[Image Bench] Unable to compute the Pixel Perfect resolution:', error);
        }
    }

    // ---------- Edits ----------

    /**
     * Apply parameters edited in the popup to a unit
     * @param {number} index
     * @param {Object} params - Subset of the parameters sent in CONTROLNET_STATE
     */
    function applyParams(index, params) {
        const resolved = resolveUnit(index);

        if (!resolved)
            return;

        const {target, loader, preprocessor, mask} = resolved;

        for (const [name, value] of Object.entries(params)) {
            if (value === undefined || value === null)
                continue;

            if (name === 'enabled')
                setEnabled(target, value);
            else if (name === 'pixelPerfect')
                getChoice(index).pixelPerfect = value;
            else if (name === 'useMask' && mask)
                setEnabled(mask.target, value);
            else if (name === 'preprocessor') {
                if (preprocessor)
                    setTargetWidgetValue(preprocessor, 'preprocessor', value);
                else
                    getChoice(index).preprocessor = value;
            }
            else if (name === 'model' && loader)
                setTargetWidgetValue(loader.target, loader.widgetName, value);
            else if (name === 'weight')
                setTargetWidgetValue(target, getConfig().widgetNames?.[target.source.type] ?? 'strength', Number(value));
            else if (name === 'guidanceStart')
                setTargetWidgetValue(target, 'start_percent', Number(value));
            else if (name === 'guidanceEnd')
                setTargetWidgetValue(target, 'end_percent', Number(value));
        }

        app.graph.setDirtyCanvas(true, true);
        setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
    }

    /**
     * Run an action of a unit
     * @param {number} index
     * @param {'run'|'refresh'|'clearImage'|'clearMask'|'clearPreview'} action
     */
    async function runAction(index, action) {
        if (action === 'run')
            await runPreprocessor(index);
        else if (action === 'clearMask')
            applyParams(index, {useMask: false});
        else if (action === 'clearPreview')
            previews.delete(index);

        pollIfActive();
    }

    /**
     * Put a file into the input directory and on the control image or mask of a unit; the unit is enabled
     * @param {number} index
     * @param {'image'|'mask'} kind
     * @param {File|string} file - A file, or the name of a file already in the input directory
     * @returns {Promise<boolean>} Whether the unit has a node for it
     */
    async function loadUnitImage(index, kind, file) {
        const resolved = resolveUnit(index);
        const node = resolved?.[kind];

        if (!node) {
            showAlert(!resolved
                ? `No ControlNet node is marked "ib:cn:${index}".`
                : kind === 'mask'
                    ? `ControlNet unit ${index + 1} has no mask: use an Advanced-ControlNet apply node with a mask loader linked to mask_optional.`
                    : `ControlNet unit ${index + 1} has no LoadImage node linked to its image input.`);
            return false;
        }

        const name = typeof file === 'string' ? file
            : kind === 'mask' ? await uploadInputMask(file, `image_bench_cn_${index}_mask.png`)
            : await uploadInputImage(file, `image_bench_cn_${index}_image.png`);

        setLoadImage(node.target, node.widgetName, name);
        setEnabled(resolved.target, true);

        if (kind === 'mask')
            setEnabled(node.target, true);

        app.graph.setDirtyCanvas(true, true);
        return true;
    }

    async function setUnitImage(index, kind, file) {
        try {
            await loadUnitImage(index, kind, file);
        } catch (error) {
            showAlert(error.message);
        }

        pollIfActive();
    }

    // ---------- Preprocessor ----------

    /**
     * Run the preprocessor of a unit on its control image as a separate prompt at the front of the queue
     * @param {number} index
     * @returns {Promise<string|null>} URL of the preview, null if there is none
     */
    async function runPreprocessor(index) {
        const resolved = resolveUnit(index);
        const imageValue = widgetOf(resolved?.image)?.value;

        if (!imageValue || !hasPreprocessorNode())
            return null;

        const preprocessor = resolved.preprocessor
            ? getTargetWidget(resolved.preprocessor, 'preprocessor')?.value
            : getChoice(index).preprocessor;
        const promptId = createUuid();
        const output = {
            1: {class_type: 'LoadImage', inputs: {image: imageValue}},
            2: {class_type: PREPROCESSOR_NODE, inputs: {image: ['1', 0], preprocessor: preprocessor || 'none',
                                                         resolution: await getResolution(resolved, index)}},
            3: {class_type: 'PreviewImage', inputs: {images: ['2', 0]}}
        };

        const result = new Promise((resolve, reject) => {
            preprocessPrompts.set(promptId, {resolve, reject});
            setTimeout(() => reject(new Error('The preprocessor did not finish in time.')), PREPROCESS_TIMEOUT);
        });

        // Not awaited if the prompt is not queued
        result.catch(() => {});

        ownedPrompts.add(promptId);
        setTimeout(() => ownedPrompts.delete(promptId), PREPROCESS_TIMEOUT + OWNED_PROMPT_LIFETIME);
        setRunning(true);

        try {
            // The prompt id is chosen here, so that its events are told from those of the workflow from the start
            const response = await api.fetchApi('/prompt', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({client_id: api.clientId ?? api.initialClientId, prompt: output,
                                      prompt_id: promptId, front: true})
            });

            if (!response.ok)
                throw new Error(`Unable to run the preprocessor: ${await response.text()}`);

            const preview = await result;
            previews.set(index, preview);
            return preview;
        } catch (error) {
            showAlert(error.message);
            return null;
        } finally {
            preprocessPrompts.delete(promptId);
            setRunning(false);
        }
    }

    function setRunning(value) {
        running = value;
        pollIfActive();
    }

    /**
     * Whether a prompt was queued here to run a preprocessor; its events are not generations
     * @param {string} promptId
     * @returns {boolean}
     */
    function ownsPrompt(promptId) {
        return ownedPrompts.has(promptId);
    }

    // ---------- Photoshop ----------

    /**
     * Put an image sent from Photoshop (already saved to the input directory) into the unit shown in the popup
     * (the first one if it was not opened): cn_preprocess runs the preprocessor and sends the preview back
     * to Photoshop, cn_image is used as the control image without a preprocessor, cn_mask becomes the mask of the unit
     * @param {'cn_preprocess'|'cn_image'|'cn_mask'} target
     * @param {string} filename
     */
    async function onPhotoshopImage(target, filename) {
        const index = unit;

        try {
            if (target === 'cn_mask') {
                await loadUnitImage(index, 'mask', filename);
                return;
            }

            if (!await loadUnitImage(index, 'image', filename))
                return;

            if (target === 'cn_image') {
                applyParams(index, {preprocessor: 'none'});
                previews.delete(index);
            }
            else if (target === 'cn_preprocess')
                await preprocessToPhotoshop(index);
        } finally {
            pollIfActive();
        }
    }

    async function preprocessToPhotoshop(index) {
        if (!hasPreprocessorNode()) {
            showAlert('Running a ControlNet preprocessor needs comfyui_controlnet_aux (AIO_Preprocessor).');
            return;
        }

        const preview = await runPreprocessor(index);

        if (!preview)
            return;

        const resolved = resolveUnit(index);
        const preprocessor = resolved?.preprocessor
            ? getTargetWidget(resolved.preprocessor, 'preprocessor')?.value
            : getChoice(index).preprocessor;
        const error = await sendImageToPhotoshop(preview, `ControlNet ${index + 1} ${preprocessor || ''} preview`);

        if (error)
            showAlert(error);
    }

    // ---------- Projects ----------

    /**
     * @returns {{index: number, resolved: Object}[]} The enabled units
     */
    function getEnabledUnits() {
        return getUnitTargets().map((_, index) => ({index, resolved: resolveUnit(index)}))
            .filter(({resolved}) => resolved && isEnabled(resolved.target));
    }

    function hasEnabledUnits() {
        return getEnabledUnits().length > 0;
    }

    /**
     * The enabled units for a project or a queued prompt: their parameters and images (the files of their LoadImage
     * nodes). The graph is read before the first await, so that the capture of a queued prompt reads its graph
     * @returns {Promise<{index: number, params: Object, image: Blob|null, mask: Blob|null, pose: null}[]>}
     */
    async function captureUnits() {
        const units = getEnabledUnits().map(({index, resolved}) => {
            const {params} = readUnit(resolved, index);
            const image = resolved.image && getTargetImageUrl(resolved.image.target, resolved.image.widgetName);
            const mask = params.useMask && getTargetImageUrl(resolved.mask.target, resolved.mask.widgetName);

            return {index, params, image, mask};
        });

        return Promise.all(units.map(async ({index, params, image, mask}) =>
            ({index, params, image: await toBlob(image), mask: await toBlob(mask), pose: null})));
    }

    async function toBlob(url) {
        if (!url)
            return null;

        try {
            const response = await fetch(url);
            return response.ok ? await response.blob() : null;
        } catch (error) {
            console.warn('[Image Bench] Unable to read a ControlNet image:', error);
            return null;
        }
    }

    /**
     * Restore the units of a project; without its workflow (a project of WebUI) the other units are disabled
     * @param {Object[]} units - As captured by captureUnits(), with the images as files
     * @param {boolean} withWorkflow - The workflow of the project was loaded, which has the state of the other units
     * @returns {Promise<number[]>} Indexes of the units not found in the workflow
     */
    async function restoreUnits(units, withWorkflow) {
        const missing = [];
        const indexes = new Set(units.map(entry => entry.index));

        if (!withWorkflow)
            getUnitTargets().forEach((target, index) => indexes.has(index) || setEnabled(target, false));

        for (const {index, params, image, mask} of units) {
            if (!resolveUnit(index)) {
                missing.push(index);
                continue;
            }

            if (image)
                await loadUnitImage(index, 'image', image);

            if (mask)
                await loadUnitImage(index, 'mask', mask);

            const {pixelPerfect, preprocessor, model, weight, guidanceStart, guidanceEnd, useMask, enabled} = params;
            applyParams(index, {pixelPerfect, preprocessor, model, weight, guidanceStart, guidanceEnd,
                                useMask: !!mask && useMask, enabled: enabled ?? true});
            previews.delete(index);
        }

        pollIfActive();
        return missing;
    }

    const handlers = {
        CONTROLNET_SUBSCRIBE: payload => subscribe(payload.active, payload.unit),
        SET_CONTROLNET_PARAMS: payload => applyParams(payload.unit, payload.params),
        CONTROLNET_ACTION: payload => runAction(payload.unit, payload.action),
        SET_CONTROLNET_IMAGE: payload => setUnitImage(payload.unit, payload.kind, payload.file),
        // ComfyUI has one workflow, there are no generation tabs to switch
        SET_CONTROLNET_TAB: () => {}
    };

    return {handlers, ownsPrompt, onPhotoshopImage, hasEnabledUnits, captureUnits, restoreUnits};
}
