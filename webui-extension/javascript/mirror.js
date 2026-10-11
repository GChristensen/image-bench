/**
 * Two-way mirror of the txt2img parameters for the Generate tab of the popup.
 * While the tab is shown, the parameters are polled and sent to the popup when they change,
 * so that edits made in WebUI appear in the popup; edits made in the popup are applied here.
 * The poll also reports the progress and the live preview of a running generation.
 */

import {SELECTORS} from "./adapters/selectors.js";

const POLL_INTERVAL = 600;
// The prompts are unlocked when the popup closes, checked also while the Generate tab is not shown
const LOCK_CHECK_INTERVAL = 1000;
// Lets WebUI process an applied value (e.g. recount the tokens) before it is read back
const APPLY_SETTLE_DELAY = 300;

// Parameters set by typing into an input: name -> selector key
const INPUT_PARAMS = {
    prompt: 'TXT2IMG_PROMPT',
    negativePrompt: 'TXT2IMG_NEG_PROMPT',
    width: 'TXT2IMG_WIDTH',
    height: 'TXT2IMG_HEIGHT',
    steps: 'TXT2IMG_STEPS',
    cfg: 'TXT2IMG_CFG_SCALE',
    seed: 'TXT2IMG_SEED',
    subseed: 'TXT2IMG_SUBSEED',
    subseedStrength: 'TXT2IMG_SUBSEED_STRENGTH',
    hiresScale: 'HIRES_SCALE',
    hiresSteps: 'HIRES_STEPS',
    denoising: 'TXT2IMG_DENOISING'
};

// Parameters set by choosing a dropdown option: name -> selector key
const DROPDOWN_PARAMS = {
    sampler: 'TXT2IMG_SAMPLING',
    scheduler: 'TXT2IMG_SCHEDULER',
    hiresUpscaler: 'HIRES_UPSCALER'
};

/**
 * @param {UIOperations} uiOperations - WebUI operations facade
 * @param {SDWebuiAdapter} adapter - DOM adapter
 * @param {Object} popup - {sendMessage: (msg) => boolean, isOpen: () => boolean}
 */
export function createWebUIMirror(uiOperations, adapter, popup) {
    let timer = null;
    let lastParams = null;
    let lastLive = null;
    let locked = false;
    let lockCheckTimer = null;
    let applying = Promise.resolve();

    /**
     * Start or stop sending the parameters (the Generate tab is shown or hidden)
     * @param {boolean} active
     */
    function subscribe(active) {
        clearInterval(timer);
        timer = null;

        if (active) {
            // The tab is (re)shown: send the current state even if it did not change;
            // the live progress too, since the popup may keep it from a generation that ended meanwhile
            lastParams = null;
            lastLive = {active: true};
            timer = setInterval(poll, POLL_INTERVAL);
            poll();
        }
    }

    function poll() {
        if (!popup.isOpen()) {
            subscribe(false);
            setPromptsLocked(false);
            return;
        }

        const state = captureState();
        const json = JSON.stringify(state);

        if (json !== lastParams) {
            lastParams = json;
            popup.sendMessage({type: "WEBUI_PARAMS", ...state});
        }

        sendLiveProgress(state.busy);
    }

    /**
     * Progress and live preview of the running generation; one final message when it ends
     * @param {boolean} busy
     */
    function sendLiveProgress(busy) {
        if (!busy && !lastLive?.active)
            return;

        const previews = adapter.getAllElements('TXT2IMG_LIVE_PREVIEW');
        const live = busy
            ? {active: true, progress: uiOperations.getGenerationProgress() ?? 0,
               preview: previews.length ? previews[previews.length - 1].src : null}
            : {active: false, progress: 100, preview: null};

        if (live.active !== lastLive?.active || live.progress !== lastLive.progress || live.preview !== lastLive.preview) {
            lastLive = live;
            popup.sendMessage({type: "LIVE_PROGRESS", ...live});
        }
    }

    function captureState() {
        const params = {};

        for (const [name, key] of [...Object.entries(INPUT_PARAMS), ...Object.entries(DROPDOWN_PARAMS)])
            params[name] = adapter.getInputValue(key);

        // Forge relabels the distilled CFG slider as Shift for flow models, or hides it
        const sliderKind = uiOperations.getDistilledCfgSliderKind('TXT2IMG');
        params.shift = sliderKind ? adapter.getInputValue('TXT2IMG_DISTILLED_CFG') : null;
        params.uiPreset = adapter.getInputValue('FORGE_UI_PRESET');
        params.checkpoint = adapter.getInputValue('MODEL_CHECKPOINT');

        return {
            params,
            sliderKind,
            tokens: {
                prompt: getTokenCount('TXT2IMG_TOKEN_COUNTER'),
                negativePrompt: getTokenCount('TXT2IMG_NEG_TOKEN_COUNTER')
            },
            options: {
                uiPresets: params.uiPreset === null ? [] : uiOperations.getUiPresetChoices(),
                upscalers: getChoices(SELECTORS.HIRES_UPSCALER_ID)
            },
            busy: !uiOperations.isReadyToGenerate(),
            locked
        };
    }

    /**
     * Text of a WebUI token counter ("41/75"), null if counters are disabled
     * @param {string} key - Selector key of the counter
     * @returns {string|null}
     */
    function getTokenCount(key) {
        const counter = adapter.getElement(key);

        if (!counter || counter.style.display === 'none')
            return null;

        return counter.textContent.trim() || null;
    }

    /**
     * Choices of a Gradio dropdown, as configured when WebUI was loaded
     * @param {string} elemId
     * @returns {string[]}
     */
    function getChoices(elemId) {
        const components = window.gradio_config?.components ?? [];
        const component = components.find(c => c.props?.elem_id === elemId);

        return component?.props?.choices?.map(c => Array.isArray(c) ? c[1] : c) ?? [];
    }

    /**
     * Apply parameters edited in the popup; calls are serialized, since dropdowns are set asynchronously
     * @param {Object} params - Subset of the parameters sent in WEBUI_PARAMS
     * @returns {Promise<void>}
     */
    function applyParams(params) {
        applying = applying.then(() => doApplyParams(params)).catch(e => console.error(e));
        return applying;
    }

    async function doApplyParams(params) {
        for (const [name, value] of Object.entries(params)) {
            if (value === undefined || value === null)
                continue;

            if (name === 'uiPreset')
                await uiOperations.setUiPreset(value);
            else if (name === 'checkpoint')
                await uiOperations.restoreModel(value);
            else if (name in DROPDOWN_PARAMS)
                await adapter.setDropdownValue(DROPDOWN_PARAMS[name], value, true);
            else if (name === 'shift') {
                if (uiOperations.getDistilledCfgSliderKind('TXT2IMG'))
                    adapter.setInputValue('TXT2IMG_DISTILLED_CFG', value);
            }
            else if (name in INPUT_PARAMS) {
                adapter.setInputValue(INPUT_PARAMS[name], value);

                // WebUI applies the variation seed only if its "Extra" checkbox is checked
                if (name === 'subseedStrength' && Number(value) > 0)
                    adapter.setCheckboxValue('TXT2IMG_SUBSEED_SHOW', true);
            }
        }

        setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
    }

    /**
     * Wait for the parameters sent before a generation request to be applied
     * @returns {Promise<void>}
     */
    function settled() {
        return applying;
    }

    function pollIfActive() {
        if (timer)
            poll();
    }

    /**
     * Click the WebUI button that reuses the seed of the last generation
     * @param {'seed'|'subseed'} which
     */
    function reuseSeed(which) {
        adapter.getElement(which === 'subseed' ? 'TXT2IMG_REUSE_SUBSEED' : 'TXT2IMG_REUSE_SEED')?.click();
        setTimeout(pollIfActive, APPLY_SETTLE_DELAY);
    }

    /**
     * Cover the txt2img prompts with an overlay, so that they are edited only in the popup.
     * The popup remembers the lock and locks again when it is reopened
     * @param {boolean} lock
     */
    function setPromptsLocked(lock) {
        if (lock === locked)
            return;

        locked = lock;

        clearInterval(lockCheckTimer);
        lockCheckTimer = lock
            ? setInterval(() => popup.isOpen() || setPromptsLocked(false), LOCK_CHECK_INTERVAL)
            : null;

        for (const [id, key] of [[SELECTORS.TXT2IMG_PROMPT_ID, 'TXT2IMG_PROMPT'],
                                 [SELECTORS.TXT2IMG_NEG_PROMPT_ID, 'TXT2IMG_NEG_PROMPT']]) {
            const container = document.getElementById(id);
            const textarea = adapter.getElement(key);

            if (!container)
                continue;

            if (textarea)
                textarea.readOnly = lock;

            container.querySelector(':scope > .image-bench-lock')?.remove();
            container.classList.toggle('image-bench-locked', lock);

            if (lock)
                container.appendChild(createLockOverlay());
        }

        pollIfActive();
    }

    function createLockOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'image-bench-lock';

        const label = document.createElement('span');
        label.textContent = '🔒 Edited in Image Bench';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Unlock';
        // Unlocked by the user: the popup forgets the lock
        button.addEventListener('click', () => {
            setPromptsLocked(false);
            popup.sendMessage({type: "WEBUI_PROMPTS_UNLOCKED"});
        });

        overlay.append(label, button);
        return overlay;
    }

    return {subscribe, applyParams, settled, reuseSeed, setPromptsLocked};
}
