/**
 * UIOperations - Facade for WebUI interactions
 * Provides high-level operations that encapsulate multiple adapter calls
 * Strategies depend on this facade instead of directly using the adapter
 */

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
     * Click the generate button for the current tab
     * Automatically detects which tab is active and clicks the appropriate button
     * @returns {boolean} Whether the button was clicked
     */
    clickGenerate() {
        const isImg2ImgTab = this.adapter.isImg2ImgTab();
        const buttonKey = isImg2ImgTab ? 'IMG2IMG_GENERATE' : 'TXT2IMG_GENERATE';
        const generateButton = this.adapter.getElement(buttonKey);

        if (generateButton && this.adapter.isElementVisible(generateButton)) {
            generateButton.click();
            return true;
        }

        return false;
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
}
