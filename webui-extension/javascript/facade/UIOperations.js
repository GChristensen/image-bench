/**
 * UIOperations - Facade for WebUI interactions
 * Provides high-level operations that encapsulate multiple adapter calls
 * Strategies depend on this facade instead of directly using the adapter
 */

import { SELECTORS } from '../adapters/selectors.js';

// Fallback if the preset choices can't be read from the Gradio config
const DEFAULT_UI_PRESETS = ['sd', 'xl', 'flux', 'klein', 'qwen', 'lumina', 'zit', 'wan', 'anima', 'ernie', 'pid', 'krea'];

// Presets whose value is searched in the model name by a different term
const UI_PRESET_SEARCH_TERMS = {
    sd: 'sd/',
    xl: 'sdxl',
    zit: 'z-image'
};

// Parameters remembered across WebUI reloads for both tabs, by selector key suffix
const TAB_PARAM_SELECTORS = {
    prompt: 'PROMPT',
    negativePrompt: 'NEG_PROMPT',
    sampler: 'SAMPLING',
    scheduler: 'SCHEDULER',
    steps: 'STEPS',
    cfg: 'CFG_SCALE',
    width: 'WIDTH',
    height: 'HEIGHT',
    seed: 'SEED',
    subseed: 'SUBSEED',
    subseedStrength: 'SUBSEED_STRENGTH',
    denoising: 'DENOISING'
};

const TAB_DROPDOWN_PARAMS = ['sampler', 'scheduler'];

const isSet = value => value !== undefined && value !== null;

export class UIOperations {
    /**
     * @param {Object} adapter - DOM adapter instance
     */
    constructor(adapter) {
        this.adapter = adapter;
    }

    // ==================== HIGH-LEVEL OPERATIONS ====================

    /**
     * Apply a preset with proper toggle logic
     * If the preset is already selected, toggle to 'None' first to force re-application
     * @param {string} presetName - Name of the preset to apply
     * @returns {Promise<void>}
     */
    async applyPreset(presetName) {
        const presetDropdown = this.adapter.getElement('CONFIG_PRESET_TXT2IMG_DROPDOWN');

        if (presetDropdown) {
            // If already selected, toggle to 'None' first
            if (presetDropdown.value === presetName) {
                await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', 'None');
                await this.adapter.sleep(333);
            }

            await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', presetName);
        }
    }

    /**
     * Enable variation generation (subseed variations)
     * @param {number} strength - Variation strength (0-1)
     * @returns {Promise<void>}
     */
    async enableVariations(strength) {
        await this.adapter.setCheckboxValue('TXT2IMG_SUBSEED_SHOW', true);
        await this.adapter.setInputValue('TXT2IMG_SUBSEED', -1);
        await this.adapter.setInputValue('TXT2IMG_SUBSEED_STRENGTH', strength);
    }

    /**
     * Disable variation generation and reset settings
     * @returns {Promise<void>}
     */
    async disableVariations() {
        await this.adapter.setInputValue('TXT2IMG_SUBSEED_STRENGTH', 0);
        await this.adapter.setCheckboxValue('TXT2IMG_SUBSEED_SHOW', false);
    }

    /**
     * Set batch count for the current tab (txt2img or img2img)
     * Automatically detects which tab is active
     * @param {number} count - Number of images to generate per batch
     * @returns {Promise<void>}
     */
    async setBatchCount(count) {
        const isImg2ImgTab = this.adapter.isImg2ImgTab();

        if (isImg2ImgTab) {
            await this.adapter.setInputValue('IMG2IMG_BATCH_COUNT', count);
        } else {
            await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', count);
        }
    }

    /**
     * Backup current generation parameters
     * @returns {Promise<Object>} Backup object with seeds, steps, and denoising values
     */
    async backupGenerationParams() {
        return {
            seeds: [
                await this.adapter.getInputValue('TXT2IMG_SEED'),
                await this.adapter.getInputValue('TXT2IMG_SUBSEED')
            ],
            steps: await this.adapter.getInputValue('TXT2IMG_STEPS'),
            denoising: await this.adapter.getInputValue('TXT2IMG_DENOISING')
        };
    }

    /**
     * Restore generation parameters from backup
     * @param {Object} backup - Backup object from backupGenerationParams()
     */
    restoreGenerationParams(backup) {
        if (backup.seeds) {
            this.adapter.setInputValue('TXT2IMG_SEED', backup.seeds[0]);
            this.adapter.setInputValue('TXT2IMG_SUBSEED', backup.seeds[1]);
        }

        if (backup.steps) {
            this.adapter.setInputValue('TXT2IMG_STEPS', backup.steps);
        }

        if (backup.denoising) {
            this.adapter.setInputValue('TXT2IMG_DENOISING', backup.denoising);
        }
    }

    /**
     * Apply parameters from an image to current generation settings
     * @param {Object} parameters - Image parameters object
     * @param {Object} options - { setSteps: boolean, setDenoising: boolean }
     * @returns {Promise<void>}
     */
    async applyImageParameters(parameters, options = {}) {
        // Always set seed
        await this.adapter.setInputValue('TXT2IMG_SEED', parameters['seed']);

        // Set variation seed if present
        if ('variation seed' in parameters) {
            await this.adapter.setInputValue('TXT2IMG_SUBSEED', parameters['variation seed']);
        }

        // Set denoising strength if needed
        if (options.setDenoising && 'denoising strength' in parameters) {
            await this.adapter.setInputValue('TXT2IMG_DENOISING', parameters['denoising strength']);
        }

        // Set steps if needed
        if (options.setSteps && 'steps' in parameters) {
            await this.adapter.setInputValue('TXT2IMG_STEPS', parameters['steps']);
        }
    }

    /**
     * Backup current model
     * @returns {Promise<string>} Current model name
     */
    async backupModel() {
        return await this.adapter.getInputValue('MODEL_CHECKPOINT');
    }

    /**
     * Restore/set model
     * @param {string} modelName - Model name to set
     * @returns {Promise<void>}
     */
    async restoreModel(modelName) {
        await this.adapter.setDropdownValue('MODEL_CHECKPOINT', modelName);
    }

    /**
     * Backup current Forge UI preset
     * @returns {Promise<string|null>} Current preset value or null if absent
     */
    async backupUiPreset() {
        return this.adapter.getInputValue('FORGE_UI_PRESET');
    }

    /**
     * Restore/set Forge UI preset
     * @param {string} preset - Preset value to set
     * @returns {Promise<void>}
     */
    async restoreUiPreset(preset) {
        if (preset) {
            await this.setUiPreset(preset);
        }
    }

    /**
     * Select the Forge UI preset matching the given model name
     * A preset matches if its search term is contained in the model name;
     * the longest matching term wins (e.g. "klein" over "flux")
     * @param {string} modelName - Model title as it appears in the model list
     * @returns {Promise<void>}
     */
    async applyUiPresetForModel(modelName) {
        if (!modelName || !this.adapter.getElement('FORGE_UI_PRESET')) {
            return;
        }

        const name = modelName.toLowerCase().replace(/\\/g, '/');
        let bestPreset = null;
        let bestTerm = '';

        for (const preset of this.getUiPresetChoices()) {
            const term = (UI_PRESET_SEARCH_TERMS[preset] ?? preset).toLowerCase();

            if (name.includes(term) && term.length > bestTerm.length) {
                bestPreset = preset;
                bestTerm = term;
            }
        }

        if (bestPreset) {
            await this.setUiPreset(bestPreset);
        }
    }

    /**
     * Set Forge UI preset only if it differs from the current value
     * @param {string} preset - Preset value to set
     * @returns {Promise<void>}
     */
    async setUiPreset(preset) {
        const current = this.adapter.getInputValue('FORGE_UI_PRESET');

        if (current === null || current === preset) {
            return;
        }

        await this.adapter.setDropdownValue('FORGE_UI_PRESET', preset);
        await this.adapter.sleep(333);
    }

    /**
     * Get available Forge UI preset choices from Gradio config
     * @returns {string[]}
     */
    getUiPresetChoices() {
        const components = window.gradio_config?.components ?? [];
        const component = components.find(c => c.props?.elem_id === SELECTORS.FORGE_UI_PRESET_ID);
        const choices = component?.props?.choices?.map(c => Array.isArray(c) ? c[1] : c);

        return choices?.length ? choices : DEFAULT_UI_PRESETS;
    }

    /**
     * Get txt2img prompt
     * @returns {Promise<string|null>}
     */
    async getPrompt() {
        return this.adapter.getInputValue('TXT2IMG_PROMPT');
    }

    /**
     * Set txt2img prompt
     * @param {string} text
     * @returns {Promise<void>}
     */
    async setPrompt(text) {
        this.adapter.setInputValue('TXT2IMG_PROMPT', text);
    }

    /**
     * Apply per-model generation parameters to txt2img
     * Unset (undefined/null/empty) parameters are left untouched
     * @param {Object} params - { sampler, scheduler, steps, shift, cfg, distilledCfg }
     * @returns {Promise<void>}
     */
    async applyGenerationParams(params) {
        if (!params) {
            return;
        }

        const isSet = value => value !== undefined && value !== null && value !== '';

        if (isSet(params.sampler)) {
            await this.adapter.setDropdownValue('TXT2IMG_SAMPLING', params.sampler, true);
        }

        if (isSet(params.scheduler)) {
            await this.adapter.setDropdownValue('TXT2IMG_SCHEDULER', params.scheduler, true);
        }

        if (isSet(params.steps)) {
            this.adapter.setInputValue('TXT2IMG_STEPS', params.steps);
        }

        if (isSet(params.cfg)) {
            this.adapter.setInputValue('TXT2IMG_CFG_SCALE', params.cfg);
        }

        // Shift and Distilled CFG share one slider, relabeled (or hidden) by the Forge UI preset
        const sliderKind = this.getDistilledCfgSliderKind();
        const sliderValue = sliderKind === 'shift' ? params.shift
            : sliderKind === 'distilledCfg' ? params.distilledCfg
            : undefined;

        if (isSet(sliderValue)) {
            this.adapter.setInputValue('TXT2IMG_DISTILLED_CFG', sliderValue);
        }
    }

    /**
     * Backup txt2img generation parameters affected by applyGenerationParams()
     * @returns {Promise<Object>}
     */
    async backupGenerationParams() {
        const params = {
            sampler: this.adapter.getInputValue('TXT2IMG_SAMPLING'),
            scheduler: this.adapter.getInputValue('TXT2IMG_SCHEDULER'),
            steps: this.adapter.getInputValue('TXT2IMG_STEPS'),
            cfg: this.adapter.getInputValue('TXT2IMG_CFG_SCALE')
        };

        const sliderKind = this.getDistilledCfgSliderKind();
        if (sliderKind) {
            params[sliderKind] = this.adapter.getInputValue('TXT2IMG_DISTILLED_CFG');
        }

        return params;
    }

    /**
     * Restore txt2img generation parameters saved by backupGenerationParams()
     * @param {Object} backup
     * @returns {Promise<void>}
     */
    async restoreGenerationParams(backup) {
        await this.applyGenerationParams(backup);
    }

    /**
     * Capture txt2img and img2img prompts and parameters to be restored after a WebUI reload
     * Model, VAE and clip skip are omitted, as WebUI persists them in its settings
     * @returns {Object} { uiPreset, txt2img, img2img }
     */
    captureUiParams() {
        return {
            uiPreset: this.adapter.getInputValue('FORGE_UI_PRESET'),
            txt2img: {
                ...this.captureTabParams('TXT2IMG'),
                hiresFix: this.adapter.getElement('HIRES_CHECKBOX')?.checked ?? null,
                hiresScale: this.adapter.getInputValue('HIRES_SCALE')
            },
            img2img: this.captureTabParams('IMG2IMG')
        };
    }

    /**
     * Capture prompts and parameters of a generation tab
     * @param {'TXT2IMG'|'IMG2IMG'} tab - Selector key prefix of the tab
     * @returns {Object}
     */
    captureTabParams(tab) {
        const params = {};

        for (const [name, suffix] of Object.entries(TAB_PARAM_SELECTORS)) {
            params[name] = this.adapter.getInputValue(`${tab}_${suffix}`);
        }

        params.distilledCfg = this.getDistilledCfgSliderKind(tab)
            ? this.adapter.getInputValue(`${tab}_DISTILLED_CFG`)
            : null;
        params.subseedShow = this.adapter.getElement(`${tab}_SUBSEED_SHOW`)?.checked ?? null;

        return params;
    }

    /**
     * Apply prompts and parameters captured by captureUiParams()
     * @param {Object} params
     * @returns {Promise<void>}
     */
    async applyUiParams(params) {
        if (!params) {
            return;
        }

        // The preset relabels or hides the distilled CFG sliders, so it goes first
        if (isSet(params.uiPreset)
                && this.adapter.getInputValue('FORGE_UI_PRESET') !== params.uiPreset) {
            await this.setUiPreset(params.uiPreset);
        }

        await this.applyTabParams('TXT2IMG', params.txt2img);
        await this.applyTabParams('IMG2IMG', params.img2img);

        const hiresScale = params.txt2img?.hiresScale;
        if (isSet(hiresScale) && String(this.adapter.getInputValue('HIRES_SCALE')) !== String(hiresScale)) {
            this.adapter.setInputValue('HIRES_SCALE', hiresScale);
        }

        const hiresFix = params.txt2img?.hiresFix;
        if (isSet(hiresFix)) {
            this.adapter.toggleHiresFix(hiresFix, !hiresFix);
        }
    }

    /**
     * Apply prompts and parameters captured by captureTabParams()
     * Unset (undefined/null) parameters and those equal to the current values are left untouched
     * @param {'TXT2IMG'|'IMG2IMG'} tab - Selector key prefix of the tab
     * @param {Object} params
     * @returns {Promise<void>}
     */
    async applyTabParams(tab, params) {
        if (!params) {
            return;
        }

        const differs = (key, value) => isSet(value)
            && String(this.adapter.getInputValue(key)) !== String(value);

        for (const [name, suffix] of Object.entries(TAB_PARAM_SELECTORS)) {
            const key = `${tab}_${suffix}`;

            if (!differs(key, params[name])) {
                continue;
            }

            if (TAB_DROPDOWN_PARAMS.includes(name)) {
                await this.adapter.setDropdownValue(key, params[name], true);
            } else {
                this.adapter.setInputValue(key, params[name]);
            }
        }

        if (differs(`${tab}_DISTILLED_CFG`, params.distilledCfg) && this.getDistilledCfgSliderKind(tab)) {
            this.adapter.setInputValue(`${tab}_DISTILLED_CFG`, params.distilledCfg);
        }

        // The checkbox setter only acts if the state differs
        if (isSet(params.subseedShow)) {
            this.adapter.setCheckboxValue(`${tab}_SUBSEED_SHOW`, params.subseedShow);
        }
    }

    /**
     * Determine what the Forge distilled CFG slider currently controls
     * @param {'TXT2IMG'|'IMG2IMG'} tab - Selector key prefix of the tab
     * @returns {'shift'|'distilledCfg'|null} null if the slider is absent or hidden
     */
    getDistilledCfgSliderKind(tab = 'TXT2IMG') {
        const block = document.getElementById(SELECTORS[`${tab}_DISTILLED_CFG_ID`]);

        if (!block || getComputedStyle(block).display === 'none') {
            return null;
        }

        return block.textContent.includes('Shift') ? 'shift' : 'distilledCfg';
    }

    /**
     * Check that the current tab is ready to generate: the generate button is shown
     * and neither the interrupt nor the "Interrupting..." button is.
     * Newer WebUI versions overlay the interrupt button instead of hiding the generate button,
     * so the generate button alone is not enough. Rendered boxes are checked instead of
     * the inline style, because the buttons may be hidden by stylesheets.
     * @returns {boolean}
     */
    isReadyToGenerate() {
        const tab = this.adapter.isImg2ImgTab() ? 'IMG2IMG' : 'TXT2IMG';
        const isShown = (key) => {
            const element = this.adapter.getElement(key);
            return !!element && element.getClientRects().length > 0;
        };

        return isShown(`${tab}_GENERATE`)
            && !isShown(`${tab}_INTERRUPT`)
            && !isShown(`${tab}_INTERRUPTING`);
    }

    /**
     * Wait until the current tab is ready to generate
     * The previous job may still be finishing when its image is saved
     * @param {number} timeout - Maximum wait in milliseconds
     * @returns {Promise<boolean>} Whether the UI became ready in time
     */
    async waitReadyToGenerate(timeout = 30000) {
        const deadline = Date.now() + timeout;

        while (!this.isReadyToGenerate()) {
            if (Date.now() >= deadline)
                return false;

            await this.sleep(250);
        }

        return true;
    }

    /**
     * Click the generate button for the current tab, once it is ready to generate
     * Automatically detects which tab is active and clicks the appropriate button
     * @returns {Promise<boolean>} Whether the button was clicked
     */
    async clickGenerate() {
        if (!await this.waitReadyToGenerate()) {
            console.warn('[UIOperations] Generation is still running or being interrupted, generate is not clicked');
            return false;
        }

        const isImg2ImgTab = this.adapter.isImg2ImgTab();
        const buttonKey = isImg2ImgTab ? 'IMG2IMG_GENERATE' : 'TXT2IMG_GENERATE';
        this.adapter.getElement(buttonKey).click();
        return true;
    }

    /**
     * Set up basic generation parameters (seed and batch count)
     * @param {number} seed - Seed value (-1 for random)
     * @param {number} batchCount - Number of images per batch
     * @returns {Promise<void>}
     */
    async setupBasicGeneration(seed, batchCount) {
        await this.adapter.setInputValue('TXT2IMG_SEED', seed);
        await this.setBatchCount(batchCount);
    }

    // ==================== LOW-LEVEL UTILITIES ====================

    /**
     * Get the value of an input element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {Promise<string|number|null>}
     */
    async getInputValue(selectorKey) {
        return this.adapter.getInputValue(selectorKey);
    }

    /**
     * Set the value of an input element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @param {string|number} value - The value to set
     * @returns {Promise<void>}
     */
    async setInputValue(selectorKey, value) {
        return await this.adapter.setInputValue(selectorKey, value);
    }

    /**
     * Set the value of a dropdown element
     * @param {string} selectorKey - Key from SELECTORS constant
     * @param {string} value - The value to select
     * @returns {Promise<void>}
     */
    async setDropdownValue(selectorKey, value) {
        return await this.adapter.setDropdownValue(selectorKey, value);
    }

    /**
     * Get element by selector key
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {HTMLElement|null}
     */
    getElement(selectorKey) {
        return this.adapter.getElement(selectorKey);
    }

    /**
     * Get all elements matching selector key
     * @param {string} selectorKey - Key from SELECTORS constant
     * @returns {NodeList|Array}
     */
    getAllElements(selectorKey) {
        return this.adapter.getAllElements(selectorKey);
    }

    /**
     * Check if currently on img2img tab
     * @returns {boolean}
     */
    isImg2ImgTab() {
        return this.adapter.isImg2ImgTab();
    }

    /**
     * Check if an element is visible
     * @param {HTMLElement} element - The element to check
     * @returns {boolean}
     */
    isElementVisible(element) {
        return this.adapter.isElementVisible(element);
    }

    /**
     * Get current generation progress percentage
     * @returns {number|null} Progress from 0-100, or null if not available
     */
    getGenerationProgress() {
        return this.adapter.getGenerationProgress();
    }

    /**
     * Toggle hires fix checkbox
     * @param {boolean} onlyEnable - Only enable, don't toggle off
     * @param {boolean} onlyDisable - Only disable, don't toggle on
     */
    toggleHiresFix(onlyEnable = false, onlyDisable = false) {
        this.adapter.toggleHiresFix(onlyEnable, onlyDisable);
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    async sleep(ms) {
        return await this.adapter.sleep(ms);
    }

    /**
     * Get the platform identifier
     * @returns {string} Platform identifier ('webui')
     */
    getPlatform() {
        return 'webui';
    }
}
