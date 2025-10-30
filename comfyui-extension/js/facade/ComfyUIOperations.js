/**
 * ComfyUIOperations - ComfyUI operations facade
 * Provides high-level operations for ComfyUI workflow manipulation
 * Strategies depend on this facade for platform-agnostic interactions
 *
 * Note: This directly interacts with ComfyUI's app and api, no adapter layer needed
 */

import {
    parseNodeMarker,
    getNodeByType,
    getNodesByType,
    getMarkedNode,
    getMarkedNodeWidget,
    getNodeWidget,
    setNodeWidgetValue,
    getWorkflow,
    loadWorkflow
} from '../workflow.js';

export class ComfyUIOperations {
    /**
     * @param {Object} app - ComfyUI app instance
     * @param {Object} api - ComfyUI api instance
     * @param {Object} nodeConfig - Node configuration for marker-based discovery
     */
    constructor(app, api, nodeConfig = null) {
        this.app = app;
        this.api = api;
        this.nodeConfig = nodeConfig;
    }

    // ==================== NODE DISCOVERY METHODS ====================

    /**
     * Get sampler node using marker-based discovery with fallback
     * @returns {Object|null} The sampler node or null
     */
    getSamplerNode() {
        // Try marker-based discovery first
        const result = getMarkedNodeWidget(this.app, 'smp', this.nodeConfig, 'sampler');
        if (result && result.node) {
            return result.node;
        }

        // Fallback: standard KSampler
        return getNodeByType(this.app, 'KSampler');
    }

    // ==================== HIGH-LEVEL OPERATIONS ====================

    /**
     * Backup current model
     * Uses marker-based discovery to find the marked checkpoint node
     * Searches for node containing "ib:cp:0" marker in its name
     * @returns {Promise<string>} Current model name
     */
    async backupModel() {
        const result = getMarkedNodeWidget(this.app, 'cp', this.nodeConfig, 'checkpoint');
        if (!result || !result.widget) {
            console.warn('backupModel: No marked checkpoint node found (looking for "ib:cp:0" in node name)');
            return null;
        }
        return result.widget.value;
    }

    /**
     * Restore/set model
     * Uses marker-based discovery to set the marked checkpoint node
     * Searches for node containing "ib:cp:0" marker in its name
     * @param {string} modelName - Model name to set
     * @returns {Promise<void>}
     */
    async restoreModel(modelName) {
        if (!modelName) {
            console.warn('restoreModel: No model name provided');
            return;
        }

        const result = getMarkedNodeWidget(this.app, 'cp', this.nodeConfig, 'checkpoint');
        if (!result || !result.node || !result.widgetName) {
            console.error('restoreModel: No marked checkpoint node found (looking for "ib:cp:0" in node name)');
            return;
        }

        setNodeWidgetValue(result.node, result.widgetName, modelName);
    }

    /**
     * Click the generate button (queue the workflow)
     * @returns {boolean} Whether the workflow was queued
     */
    clickGenerate() {
        try {
            this.app.queuePrompt(0, 1); // Queue with batch count 1
            return true;
        } catch (e) {
            console.error('Failed to queue prompt:', e);
            return false;
        }
    }

    /**
     * Set up basic generation parameters (seed and batch count)
     * Note: In ComfyUI, batch count is typically handled by the workflow itself,
     * so this primarily sets the seed on the KSampler node
     * @param {number} seed - Seed value (-1 for random)
     * @param {number} batchCount - Number of images per batch (less relevant in ComfyUI)
     * @returns {Promise<void>}
     */
    async setupBasicGeneration(seed, batchCount) {
        this.setSeed(seed);
        // Note: ComfyUI doesn't have a direct batch count like WebUI
        // Workflows are typically queued multiple times instead
    }

    /**
     * Set batch count (no-op in ComfyUI)
     * ComfyUI workflows are queued individually instead of using batch counts
     * @param {number} count - Number of images to generate per batch
     * @returns {Promise<void>}
     */
    async setBatchCount(count) {
        // No-op: ComfyUI workflows don't have a batch count parameter
        // The queue itself handles batching by queuing workflows multiple times
    }

    // ==================== PARAMETER SETTERS ====================

    /**
     * Set the seed value
     * Uses marker-based discovery (ib:smp:0) or falls back to KSampler
     * @param {number} seed - The seed value
     */
    setSeed(seed) {
        const sampler = this.getSamplerNode();
        if (sampler) {
            setNodeWidgetValue(sampler, 'seed', seed);
        } else {
            console.warn('[ComfyUIOperations] No sampler node found for setSeed');
        }
    }

    /**
     * Get the seed value from sampler
     * @returns {number|null} The seed value or null
     */
    getSeed() {
        const sampler = this.getSamplerNode();
        if (sampler) {
            const widget = getNodeWidget(sampler, 'seed');
            return widget?.value;
        }
        return null;
    }

    /**
     * Set control_after_generate on sampler
     * @param {string} value - Control mode ("fixed", "increment", "decrement", "randomize")
     */
    setControlAfterGenerate(value) {
        const sampler = this.getSamplerNode();
        console.log(sampler);
        if (sampler) {
            setNodeWidgetValue(sampler, 'control_after_generate', value);
        } else {
            console.warn('[ComfyUIOperations] No sampler node found for setControlAfterGenerate');
        }
    }

    /**
     * Get control_after_generate from sampler
     * @returns {string|null} The control mode or null
     */
    getControlAfterGenerate() {
        const sampler = this.getSamplerNode();
        if (sampler) {
            const widget = getNodeWidget(sampler, 'control_after_generate');
            return widget?.value;
        }
        return null;
    }

    /**
     * Set the steps value
     * Uses marker-based discovery (ib:smp:0) or falls back to KSampler
     * @param {number} steps - Number of steps
     */
    setSteps(steps) {
        // Try marker-based discovery first
        const result = getMarkedNodeWidget(this.app, 'smp', this.nodeConfig, 'sampler');
        if (result && result.node && result.widgetName) {
            setNodeWidgetValue(result.node, result.widgetName, steps);
            return;
        }

        // Fallback: try standard KSampler
        const sampler = getNodeByType(this.app, 'KSampler');
        if (sampler) {
            setNodeWidgetValue(sampler, 'steps', steps);
        } else {
            console.warn('[ComfyUIOperations] No sampler node found (marked with ib:smp:0 or KSampler)');
        }
    }

    /**
     * Get the steps value from sampler
     * @returns {number|null} The steps value or null
     */
    getSteps() {
        const sampler = this.getSamplerNode();
        if (sampler) {
            const widget = getNodeWidget(sampler, 'steps');
            return widget?.value;
        }
        return null;
    }

    /**
     * Set the CFG scale
     * @param {number} cfg - CFG scale value
     */
    setCFG(cfg) {
        const sampler = getNodeByType(this.app, 'KSampler');
        if (sampler) {
            setNodeWidgetValue(sampler, 'cfg', cfg);
        }
    }

    /**
     * Set the denoising strength
     * @param {number} denoise - Denoise value (0-1)
     */
    setDenoise(denoise) {
        const sampler = getNodeByType(this.app, 'KSampler');
        if (sampler) {
            setNodeWidgetValue(sampler, 'denoise', denoise);
        }
    }

    /**
     * Set the sampler name
     * @param {string} samplerName - Sampler name
     */
    setSampler(samplerName) {
        const sampler = getNodeByType(this.app, 'KSampler');
        if (sampler) {
            setNodeWidgetValue(sampler, 'sampler_name', samplerName);
        }
    }

    /**
     * Set the scheduler
     * @param {string} scheduler - Scheduler name
     */
    setScheduler(scheduler) {
        const sampler = getNodeByType(this.app, 'KSampler');
        if (sampler) {
            setNodeWidgetValue(sampler, 'scheduler', scheduler);
        }
    }

    /**
     * Set the positive prompt
     * Uses marker-based discovery (ib:pp:0) or falls back to first CLIPTextEncode
     * @param {string} prompt - The prompt text
     */
    setPrompt(prompt) {
        // Try marker-based discovery first
        const result = getMarkedNodeWidget(this.app, 'pp', this.nodeConfig, 'positive_prompt');
        if (result && result.node && result.widgetName) {
            setNodeWidgetValue(result.node, result.widgetName, prompt);
            return;
        }

        // Fallback: use first CLIPTextEncode node
        const promptNodes = getNodesByType(this.app, 'CLIPTextEncode');
        if (promptNodes.length > 0) {
            setNodeWidgetValue(promptNodes[0], 'text', prompt);
        } else {
            console.warn('[ComfyUIOperations] No marked positive prompt node found (looking for "ib:pp:0" in node title) and no CLIPTextEncode nodes found');
        }
    }

    /**
     * Set the negative prompt
     * Uses marker-based discovery (ib:np:0) or falls back to second CLIPTextEncode
     * @param {string} prompt - The negative prompt text
     */
    setNegativePrompt(prompt) {
        // Try marker-based discovery first
        const result = getMarkedNodeWidget(this.app, 'np', this.nodeConfig, 'negative_prompt');
        if (result && result.node && result.widgetName) {
            setNodeWidgetValue(result.node, result.widgetName, prompt);
            return;
        }

        // Fallback: use second CLIPTextEncode node
        const promptNodes = getNodesByType(this.app, 'CLIPTextEncode');
        if (promptNodes.length > 1) {
            setNodeWidgetValue(promptNodes[1], 'text', prompt);
        } else {
            console.warn('[ComfyUIOperations] No marked negative prompt node found (looking for "ib:np:0" in node title) and no second CLIPTextEncode node found');
        }
    }

    // ==================== LOW-LEVEL UTILITIES ====================

    /**
     * Get the value of an input element
     * @param {string} selectorKey - Key or format "NodeType:widgetName"
     * @returns {any|null}
     */
    getInputValue(selectorKey) {
        // Handle special selector keys with marker-based discovery
        if (selectorKey === 'MODEL_CHECKPOINT') {
            const result = getMarkedNodeWidget(this.app, 'cp', this.nodeConfig, 'checkpoint');
            if (!result || !result.widget) {
                console.warn('MODEL_CHECKPOINT: No marked checkpoint node found (looking for "ib:cp:0" in node name)');
                return null;
            }
            return result.widget.value;
        }

        const [nodeType, widgetName] = selectorKey.split(':');
        const node = getNodeByType(this.app, nodeType);

        if (!node) {
            return null;
        }

        const widget = getNodeWidget(node, widgetName);
        return widget?.value ?? null;
    }

    /**
     * Set the value of an input element
     * @param {string} selectorKey - Key or format "NodeType:widgetName"
     * @param {any} value - The value to set
     * @returns {Promise<void>}
     */
    async setInputValue(selectorKey, value) {
        const [nodeType, widgetName] = selectorKey.split(':');
        const node = getNodeByType(this.app, nodeType);

        if (!node) {
            console.warn(`Node type ${nodeType} not found`);
            return;
        }

        setNodeWidgetValue(node, widgetName, value);
    }

    /**
     * Set the value of a dropdown element
     * @param {string} selectorKey - Key or format "NodeType:widgetName"
     * @param {string} value - The value to select
     * @returns {Promise<void>}
     */
    async setDropdownValue(selectorKey, value) {
        // Handle special selector keys with marker-based discovery
        if (selectorKey === 'MODEL_CHECKPOINT') {
            const result = getMarkedNodeWidget(this.app, 'cp', this.nodeConfig, 'checkpoint');
            if (!result || !result.node || !result.widgetName) {
                console.error('MODEL_CHECKPOINT: No marked checkpoint node found (looking for "ib:cp:0" in node name)');
                return;
            }
            setNodeWidgetValue(result.node, result.widgetName, value);
            return;
        }

        await this.setInputValue(selectorKey, value);
    }

    /**
     * Get element by selector key (returns ComfyUI nodes or app objects)
     * @param {string} selectorKey - Key identifier
     * @returns {Object|null}
     */
    getElement(selectorKey) {
        if (selectorKey === 'APP') {
            return this.app;
        }

        if (selectorKey === 'API') {
            return this.api;
        }

        if (selectorKey === 'GRAPH') {
            return this.app?.graph;
        }

        // Try to find a node by type
        return getNodeByType(this.app, selectorKey);
    }

    /**
     * Get all elements matching selector key
     * @param {string} selectorKey - Node type
     * @returns {Array}
     */
    getAllElements(selectorKey) {
        return getNodesByType(this.app, selectorKey);
    }

    /**
     * Check if currently in img2img mode
     * In ComfyUI, checks if workflow has LoadImage node
     * @returns {boolean}
     */
    isImg2ImgTab() {
        const loadImageNode = getNodeByType(this.app, 'LoadImage');
        return loadImageNode !== null;
    }

    /**
     * Check if an element is visible
     * @param {HTMLElement} element - The element to check
     * @returns {boolean}
     */
    isElementVisible(element) {
        if (!element) {
            return false;
        }

        return element.style?.display !== 'none';
    }

    /**
     * Get current generation progress percentage
     * @returns {number|null} Progress from 0-100, or null if not available
     */
    getGenerationProgress() {
        // ComfyUI doesn't have a simple progress bar
        // Progress is tracked via WebSocket events
        return null;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Toggle hires fix (no-op in ComfyUI)
     * Hires fix in ComfyUI is handled via LatentUpscale nodes in the workflow
     * @param {boolean} onlyEnable - Only enable, don't toggle off
     * @param {boolean} onlyDisable - Only disable, don't toggle on
     */
    toggleHiresFix(onlyEnable = false, onlyDisable = false) {
        // No-op: Hires fix is workflow-specific in ComfyUI
        console.warn('toggleHiresFix not applicable to ComfyUI - use LatentUpscale nodes');
    }

    /**
     * Apply a preset (no-op in ComfyUI)
     * ComfyUI uses workflow templates instead of presets
     * @param {string} presetName - Name of the preset to apply
     * @returns {Promise<void>}
     */
    async applyPreset(presetName) {
        // No-op: ComfyUI uses workflow templates
        console.warn('applyPreset not applicable to ComfyUI - load workflow templates instead');
    }

    /**
     * Enable variation generation (not implemented for ComfyUI)
     * @param {number} strength - Variation strength (0-1)
     * @returns {Promise<void>}
     */
    async enableVariations(strength) {
        console.warn('enableVariations not implemented for ComfyUI');
    }

    /**
     * Disable variation generation (not implemented for ComfyUI)
     * @returns {Promise<void>}
     */
    async disableVariations() {
        console.warn('disableVariations not implemented for ComfyUI');
    }

    /**
     * Backup current generation parameters using marker-based discovery
     * @returns {Promise<Object>} Backup object with seeds, control_after_generate, and steps
     */
    async backupGenerationParams() {
        const seed = this.getSeed();
        const controlAfterGenerate = this.getControlAfterGenerate();
        const steps = this.getSteps();

        return {
            seeds: [seed, null],
            controlAfterGenerate: controlAfterGenerate,
            steps: steps
        };
    }

    /**
     * Restore generation parameters from backup using marker-based discovery
     * @param {Object} backup - Backup object from backupGenerationParams()
     */
    restoreGenerationParams(backup) {
        if (backup && backup.seeds && backup.seeds[0] !== null) {
            this.setSeed(backup.seeds[0]);
        }

        if (backup && backup.controlAfterGenerate !== undefined && backup.controlAfterGenerate !== null) {
            this.setControlAfterGenerate(backup.controlAfterGenerate);
        }

        if (backup && backup.steps !== undefined && backup.steps !== null) {
            this.setSteps(backup.steps);
        }
    }

    /**
     * Apply parameters from an image to current generation settings
     * @param {Object} parameters - Image parameters object
     * @param {Object} options - { setSteps: boolean, setDenoising: boolean }
     * @returns {Promise<void>}
     */
    async applyImageParameters(parameters, options = {}) {
        // Set seed if present
        if ('seed' in parameters) {
            this.setSeed(parameters['seed']);
        }

        // Set steps if needed
        if (options.setSteps && 'steps' in parameters) {
            this.setSteps(parameters['steps']);
        }

        // Set denoising if needed
        if (options.setDenoising && 'denoising strength' in parameters) {
            this.setDenoise(parameters['denoising strength']);
        }
    }

    /**
     * Get the current workflow as JSON
     * @returns {Object} The workflow object
     */
    getWorkflow() {
        return getWorkflow(this.app);
    }

    /**
     * Load a workflow from JSON
     * @param {Object} workflow - The workflow to load
     */
    async loadWorkflow(workflow) {
        return await loadWorkflow(this.app, workflow);
    }

    /**
     * Interrupt the current execution
     * @returns {boolean} Whether the interrupt succeeded
     */
    interrupt() {
        try {
            this.api.interrupt();
            return true;
        } catch (e) {
            console.error('Failed to interrupt:', e);
            return false;
        }
    }

    /**
     * Get the platform identifier
     * @returns {string} Platform identifier ('comfyui')
     */
    getPlatform() {
        return 'comfyui';
    }
}
