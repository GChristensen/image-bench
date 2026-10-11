/**
 * Two-way mirror of a Forge "ControlNet Integrated" unit for the ControlNet tab of the popup,
 * and the ControlNet targets of the Photoshop plugin.
 * While the tab is shown, the unit chosen there is polled in the shown generation tab (txt2img or img2img)
 * and sent to the popup when it changes (CONTROLNET_STATE, CONTROLNET_IMAGES); edits made in the popup are applied here.
 * In img2img a unit uses the img2img image unless "Upload independent control image" is checked,
 * which an image set here checks first.
 */

import {SELECTORS} from "./adapters/selectors.js";
import {sendImageToPhotoshop} from "./shared/photoshop-send.js";

const POLL_INTERVAL = 600;
// Lets WebUI process an applied value before it is read back
const APPLY_SETTLE_DELAY = 300;
// Gradio round trip of a ControlNet event (control type filter, independent image, Use Mask, Allow Preview)
const EVENT_DELAY = 500;
// A unit tab selected in WebUI may be rendered later
const UNIT_RENDER_TIMEOUT = 1000;
const IMAGE_TIMEOUT = 10000;
const PREPROCESS_TIMEOUT = 120000;

// Parameters by the kind of their WebUI component (element names of SELECTORS.CONTROLNET_ELEMENT)
const CHECKBOX_PARAMS = ['enabled', 'pixelPerfect', 'allowPreview', 'useMask', 'independent'];
const RADIO_PARAMS = ['controlType', 'controlMode', 'resizeMode'];
const DROPDOWN_PARAMS = ['preprocessor', 'model'];
// Checked when the popup or Photoshop first uses a unit
const DEFAULT_CHECKED = ['pixelPerfect', 'allowPreview'];

/**
 * @param {UIOperations} uiOperations - WebUI operations facade
 * @param {SDWebuiAdapter} adapter - DOM adapter
 * @param {Object} popup - {sendMessage: (msg) => boolean, isOpen: () => boolean}
 * @param {(message: string) => void} showAlert - Shows errors in the popup or in the WebUI window
 */
export function createControlNet(uiOperations, adapter, popup, showAlert) {
    let timer = null;
    // Unit shown in the popup, also the one that receives images from Photoshop
    let unit = 0;
    let lastState = null;
    let lastImages = null;
    let running = false;
    let applying = Promise.resolve();
    // Defaults applied once per page: `${tab}:${unit}:${name}`
    const initialized = new Set();

    /**
     * @returns {'txt2img'|'img2img'} The shown generation tab
     */
    function getTab() {
        return uiOperations.getGenerationMode() === 'txt2img' ? 'txt2img' : 'img2img';
    }

    /**
     * @param {'txt2img'|'img2img'} tab
     * @param {number} index - Unit index
     * @param {string} name - Element name (see SELECTORS.CONTROLNET_ELEMENT)
     * @returns {HTMLElement|null}
     */
    function element(tab, index, name) {
        return document.getElementById(SELECTORS.CONTROLNET_ELEMENT(tab, index, name));
    }

    function getCanvasImage(tab, index, name) {
        return adapter.getImageSourceOf(element(tab, index, name)?.querySelector(SELECTORS.FORGE_CANVAS_IMAGE));
    }

    /**
     * Select the tab of a unit in WebUI, so that the user sees what the popup edits
     * @returns {Promise<boolean>} Whether the unit exists
     */
    async function showUnit(tab, index) {
        adapter.selectTabIn(document.getElementById(SELECTORS.CONTROLNET_TABS(tab)), index);
        return !!await adapter.waitFor(() => element(tab, index, 'enabled'), UNIT_RENDER_TIMEOUT);
    }

    /**
     * Run an edit after the previous ones; edits are serialized, since they wait for Gradio
     * @param {() => Promise<void>} edit
     * @returns {Promise<void>}
     */
    function enqueue(edit) {
        applying = applying.then(edit).catch(e => console.error('[Image Bench] ControlNet edit failed:', e));
        return applying;
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

            enqueue(async () => {
                const tab = getTab();

                if (await showUnit(tab, unit))
                    await applyDefaults(tab, unit);

                pollIfActive();
            });
        }
    }

    function poll() {
        if (!popup.isOpen()) {
            subscribe(false);
            return;
        }

        const state = captureState();
        const json = JSON.stringify(state);

        if (json !== lastState) {
            lastState = json;
            popup.sendMessage({type: "CONTROLNET_STATE", ...state});
        }

        sendImages(state.tab);
    }

    function pollIfActive() {
        if (timer)
            poll();
    }

    function captureState() {
        const tab = getTab();
        const tabs = document.getElementById(SELECTORS.CONTROLNET_TABS(tab));
        const units = Array.from({length: adapter.getTabCountIn(tabs)},
            (_, index) => ({enabled: adapter.isCheckedIn(element(tab, index, 'enabled')) ?? false}));
        const get = name => element(tab, unit, name);

        if (!get('enabled'))
            return {tab, unit, units, available: false, running};

        const toNumber = value => value === null || value === undefined || value === '' ? null : Number(value);
        const range = get('timestepRange');
        const params = {
            weight: toNumber(get('weight')?.querySelector(SELECTORS.NUMBER_INPUT)?.value),
            guidanceStart: toNumber(range?.querySelector(SELECTORS.RANGE_SLIDER_MIN)?.value),
            guidanceEnd: toNumber(range?.querySelector(SELECTORS.RANGE_SLIDER_MAX)?.value)
        };
        const options = {};

        // independent is null in txt2img, which has no such checkbox
        for (const name of CHECKBOX_PARAMS)
            params[name] = adapter.isCheckedIn(get(name));

        for (const name of RADIO_PARAMS) {
            params[name] = adapter.getRadioValueIn(get(name));
            options[name] = adapter.getRadioChoicesIn(get(name));
        }

        for (const name of DROPDOWN_PARAMS)
            params[name] = get(name)?.querySelector(SELECTORS.DROPDOWN_INPUT)?.value ?? null;

        return {tab, unit, units, available: true, params, options, running};
    }

    /**
     * Images of the unit, sent apart from the state, since the canvas images are data URLs.
     * Sources are compared by their length and ends, which is enough to tell a new image
     * @param {'txt2img'|'img2img'} tab
     */
    function sendImages(tab) {
        const images = {
            image: getCanvasImage(tab, unit, 'image'),
            mask: getCanvasImage(tab, unit, 'mask'),
            preview: getCanvasImage(tab, unit, 'preview')
        };
        const signature = [tab, unit, images.image, images.mask, images.preview]
            .map(source => typeof source === 'string' ? `${source.length}:${source.slice(0, 64)}:${source.slice(-64)}` : source)
            .join('|');

        if (signature !== lastImages) {
            lastImages = signature;
            popup.sendMessage({type: "CONTROLNET_IMAGES", tab, unit, ...images});
        }
    }

    function setRunning(value) {
        running = value;
        pollIfActive();
    }

    // ---------- Edits ----------

    /**
     * Apply parameters edited in the popup to a unit of the shown generation tab
     * @param {number} unitIndex
     * @param {Object} params - Subset of the parameters sent in CONTROLNET_STATE
     * @returns {Promise<void>}
     */
    function applyParams(unitIndex, params) {
        return enqueue(async () => {
            const tab = getTab();
            const get = name => element(tab, unitIndex, name);

            if (!await showUnit(tab, unitIndex))
                return;

            for (const [name, value] of Object.entries(params)) {
                if (value === undefined || value === null)
                    continue;

                if (name === 'independent' && value)
                    await useIndependentImage(tab, unitIndex);
                else if (CHECKBOX_PARAMS.includes(name)) {
                    if (adapter.setCheckedIn(get(name), value))
                        await adapter.sleep(EVENT_DELAY);
                }
                else if (RADIO_PARAMS.includes(name))
                    adapter.setRadioValueIn(get(name), value);
                else if (DROPDOWN_PARAMS.includes(name)) {
                    const input = get(name)?.querySelector(SELECTORS.DROPDOWN_INPUT);

                    if (input)
                        await adapter.setDropdownElementValue(input, value, true);
                }
                else if (name === 'weight')
                    setNumber(get('weight')?.querySelector(SELECTORS.NUMBER_INPUT), value);
                else if (name === 'guidanceStart')
                    setNumber(get('timestepRange')?.querySelector(SELECTORS.RANGE_SLIDER_MIN), value);
                else if (name === 'guidanceEnd')
                    setNumber(get('timestepRange')?.querySelector(SELECTORS.RANGE_SLIDER_MAX), value);
            }

            setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
        });
    }

    function setNumber(input, value) {
        if (input)
            adapter.setInputElementValue(input, value);
    }

    /**
     * Run an action of a unit
     * @param {number} unitIndex
     * @param {'run'|'refresh'|'clearImage'|'clearMask'|'clearPreview'} action
     * @returns {Promise<void>}
     */
    function runAction(unitIndex, action) {
        return enqueue(async () => {
            const tab = getTab();

            if (!await showUnit(tab, unitIndex))
                return;

            if (action === 'run')
                await runPreprocessor(tab, unitIndex);
            else if (action === 'refresh')
                element(tab, unitIndex, 'refreshModels')?.click();
            else if (action === 'clearImage')
                element(tab, unitIndex, 'image')?.querySelector(SELECTORS.FORGE_CANVAS_REMOVE)?.click();
            else if (action === 'clearMask')
                element(tab, unitIndex, 'mask')?.querySelector(SELECTORS.FORGE_CANVAS_REMOVE)?.click();
            else if (action === 'clearPreview')
                await clearPreview(tab, unitIndex);

            setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
        });
    }

    /**
     * Put an image chosen in the popup into a unit
     * @param {number} unitIndex
     * @param {'image'|'mask'} kind
     * @param {File} file
     * @returns {Promise<void>}
     */
    function setUnitImage(unitIndex, kind, file) {
        return enqueue(async () => {
            const tab = getTab();

            if (!await showUnit(tab, unitIndex))
                return;

            if (kind === 'mask')
                await loadMask(tab, unitIndex, file);
            else
                await loadImage(tab, unitIndex, file);

            pollIfActive();
        });
    }

    /**
     * Show the generation tab whose ControlNet the popup mirrors
     * @param {'txt2img'|'img2img'} tab
     * @returns {Promise<void>}
     */
    function setTab(tab) {
        return enqueue(async () => {
            await uiOperations.showGenerationTab(tab);

            if (await showUnit(tab, unit))
                await applyDefaults(tab, unit);

            setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
        });
    }

    /**
     * Put an image sent from Photoshop into the unit shown in the popup (the first one if it was not opened):
     * cn_preprocess runs the preprocessor and sends the preview back to Photoshop, cn_image is used as the control
     * image without a preprocessor, cn_mask becomes the mask of the unit
     * @param {'cn_preprocess'|'cn_image'|'cn_mask'} target
     * @param {File} file
     * @returns {Promise<void>}
     */
    function onPhotoshopImage(target, file) {
        return enqueue(async () => {
            const tab = getTab();
            const index = unit;

            if (!await showUnit(tab, index)) {
                showAlert(`ControlNet unit ${index + 1} is not found in the ${tab} tab of WebUI.`);
                return;
            }

            if (target === 'cn_mask')
                await loadMask(tab, index, file);
            else if (await loadImage(tab, index, file)) {
                if (target === 'cn_image') {
                    const input = element(tab, index, 'preprocessor')?.querySelector(SELECTORS.DROPDOWN_INPUT);

                    if (input)
                        await adapter.setDropdownElementValue(input, 'None', true);

                    await clearPreview(tab, index);
                }
                else if (target === 'cn_preprocess')
                    await preprocessToPhotoshop(tab, index);
            }

            pollIfActive();
        });
    }

    async function preprocessToPhotoshop(tab, index) {
        const preview = await runPreprocessor(tab, index);

        if (!preview) {
            showAlert('The ControlNet preprocessor produced no preview.');
            return;
        }

        const preprocessor = element(tab, index, 'preprocessor')?.querySelector(SELECTORS.DROPDOWN_INPUT)?.value;
        const error = await sendImageToPhotoshop(preview, `ControlNet ${index + 1} ${preprocessor || ''} preview`);

        if (error)
            showAlert(error);
    }

    // ---------- Unit operations ----------

    /**
     * Check Pixel Perfect and Allow Preview the first time a unit is used; in img2img Allow Preview exists
     * only with an independent image
     */
    async function applyDefaults(tab, index) {
        const independent = tab === 'txt2img' || adapter.isCheckedIn(element(tab, index, 'independent'));

        for (const name of DEFAULT_CHECKED) {
            const key = `${tab}:${index}:${name}`;

            if (initialized.has(key) || name === 'allowPreview' && !independent || !element(tab, index, name))
                continue;

            initialized.add(key);

            if (adapter.setCheckedIn(element(tab, index, name), true))
                await adapter.sleep(EVENT_DELAY);
        }
    }

    /**
     * In img2img, make the unit use its own image instead of the img2img image
     */
    async function useIndependentImage(tab, index) {
        if (tab !== 'img2img' || !adapter.setCheckedIn(element(tab, index, 'independent'), true))
            return;

        // WebUI clears the image of the unit and unchecks Allow Preview
        await adapter.sleep(EVENT_DELAY);
        initialized.delete(`${tab}:${index}:allowPreview`);
        await applyDefaults(tab, index);
    }

    /**
     * Load a file into a canvas of a unit and wait until it shows it
     * @returns {Promise<boolean>} Whether the canvas was found
     */
    async function loadCanvas(tab, index, name, file) {
        const fileInput = element(tab, index, name)?.querySelector(SELECTORS.FORGE_CANVAS_FILE_INPUT);
        const previous = getCanvasImage(tab, index, name);
        const started = Date.now();

        if (!adapter.setCanvasFileIn(fileInput, file))
            return false;

        // The same image keeps the source
        await adapter.waitFor(() => {
            const source = getCanvasImage(tab, index, name);
            return source && (source !== previous || Date.now() - started > EVENT_DELAY * 2);
        }, IMAGE_TIMEOUT);

        // Let the canvas pass the image to Gradio
        await adapter.sleep(EVENT_DELAY);
        return true;
    }

    /**
     * Put the control image into a unit and enable it
     * @returns {Promise<boolean>} Whether the unit has its image canvas
     */
    async function loadImage(tab, index, file) {
        await useIndependentImage(tab, index);

        if (!await loadCanvas(tab, index, 'image', file))
            return false;

        adapter.setCheckedIn(element(tab, index, 'enabled'), true);
        await applyDefaults(tab, index);
        return true;
    }

    async function loadMask(tab, index, file) {
        await useIndependentImage(tab, index);

        // Checking Use Mask puts an empty mask into the canvas, which would replace the loaded one
        if (adapter.setCheckedIn(element(tab, index, 'useMask'), true)) {
            await adapter.waitFor(() => getCanvasImage(tab, index, 'mask'), IMAGE_TIMEOUT);
            await adapter.sleep(EVENT_DELAY);
        }

        return loadCanvas(tab, index, 'mask', file);
    }

    /**
     * Run the preprocessor on the control image of a unit
     * @returns {Promise<string|null>} Source of the preview, null if there is none
     */
    async function runPreprocessor(tab, index) {
        if (tab === 'img2img' && !adapter.isCheckedIn(element(tab, index, 'independent')))
            return null;

        if (!getCanvasImage(tab, index, 'image'))
            return null;

        // The previous preview is cleared, so that the new one is told from it;
        // the preprocessor checks Allow Preview again
        await clearPreview(tab, index, false);
        setRunning(true);

        try {
            element(tab, index, 'runPreprocessor')?.click();
            return await adapter.waitFor(() => getCanvasImage(tab, index, 'preview'), PREPROCESS_TIMEOUT) || null;
        } finally {
            setRunning(false);
        }
    }

    /**
     * Clear the preview of a unit: WebUI clears it when Allow Preview is unchecked
     * @param {boolean} reopen - Check Allow Preview again
     */
    async function clearPreview(tab, index, reopen = true) {
        const allowPreview = element(tab, index, 'allowPreview');

        if (!adapter.setCheckedIn(allowPreview, false))
            return;

        await adapter.sleep(EVENT_DELAY);

        if (reopen) {
            adapter.setCheckedIn(allowPreview, true);
            await adapter.sleep(EVENT_DELAY);
        }
    }

    return {subscribe, applyParams, runAction, setUnitImage, setTab, onPhotoshopImage};
}
