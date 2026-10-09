/**
 * ComfyUIOperations - ComfyUI operations facade
 * Provides high-level operations for ComfyUI workflow manipulation
 * Strategies depend on this facade for platform-agnostic interactions
 *
 * Note: This directly interacts with ComfyUI's app and api, no adapter layer needed
 */

import {
    MARKER_ROLES,
    getNodeByType,
    getNodesByType,
    getNodeWidget,
    setNodeWidgetValue,
    createNodeTarget,
    isSameTarget,
    getMarkerTargets,
    getRoleWidgetName,
    getTargetWidget,
    setTargetWidgetValue,
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
     * Get the first target of a marker role (see MarkerTarget in workflow.js)
     * The negative prompt skips the positive prompt target, so one subgraph node marked
     * "ib:pp ib:np" yields its first promoted text encoder as positive and the second as negative
     * @param {Object} role - Entry of MARKER_ROLES
     * @returns {Object|null}
     */
    getRoleTarget(role) {
        const targets = getMarkerTargets(this.app, role, this.nodeConfig);

        if (role === MARKER_ROLES.negativePrompt) {
            const positive = this.getRoleTarget(MARKER_ROLES.positivePrompt);
            return targets.find(target => !isSameTarget(target, positive)) ?? null;
        }

        return targets[0] ?? null;
    }

    /**
     * Get the sampler target using marker-based discovery with fallback to the first KSampler
     * @returns {Object|null}
     */
    getSamplerTarget() {
        return this.getRoleTarget(MARKER_ROLES.sampler)
            ?? createNodeTarget(getNodeByType(this.app, 'KSampler'));
    }

    /**
     * Set a sampler widget value
     * @param {string} widgetName - Widget name on the sampler node
     * @param {any} value
     */
    setSamplerValue(widgetName, value) {
        const target = this.getSamplerTarget();
        if (!target) {
            console.warn(`[ComfyUIOperations] No sampler node found (marked with ib:smp or KSampler) to set ${widgetName}`);
            return;
        }
        setTargetWidgetValue(target, widgetName, value);
    }

    /**
     * Get a sampler widget value
     * @param {string} widgetName - Widget name on the sampler node
     * @returns {any|null}
     */
    getSamplerValue(widgetName) {
        return getTargetWidget(this.getSamplerTarget(), widgetName)?.value ?? null;
    }

    /**
     * Get the model widget of the node marked with ib:cp
     * @returns {Object|null}
     */
    getCheckpointWidget() {
        const role = MARKER_ROLES.checkpoint;
        const target = this.getRoleTarget(role);
        const widgetName = target && getRoleWidgetName(role, this.nodeConfig, target);

        if (!widgetName) {
            if (target) {
                console.warn(`No checkpoint widget name configured for node type ${target.source.type}`);
            }
            return null;
        }

        return getTargetWidget(target, widgetName);
    }

    /**
     * Set the model on the node marked with ib:cp
     * @param {string} modelName
     * @returns {boolean} Whether the model was set
     */
    setCheckpoint(modelName) {
        const widget = this.getCheckpointWidget();
        if (!widget) {
            return false;
        }

        widget.value = modelName;
        widget.callback?.(modelName);
        return true;
    }

    /**
     * Set the text of a prompt role
     * @param {Object} role - MARKER_ROLES.positivePrompt or MARKER_ROLES.negativePrompt
     * @param {Object|null} fallbackNode - CLIPTextEncode node used when nothing is marked
     * @param {string} text
     * @returns {boolean} Whether the prompt was set
     */
    setPromptText(role, fallbackNode, text) {
        const target = this.getRoleTarget(role) ?? createNodeTarget(fallbackNode);
        if (!target) {
            return false;
        }

        const widgetName = getRoleWidgetName(role, this.nodeConfig, target) ?? 'text';
        return setTargetWidgetValue(target, widgetName, text);
    }

    /**
     * Get the execution ids of the current marker targets, used to find them in /history
     * @returns {Object} Execution ids keyed by MARKER_ROLES key
     */
    getMarkerExecutionIds() {
        return Object.fromEntries(Object.entries(MARKER_ROLES)
            .map(([key, role]) => [key, this.getRoleTarget(role)?.executionId]));
    }

    // ==================== HIGH-LEVEL OPERATIONS ====================

    /**
     * Backup current model
     * Uses marker-based discovery to find the node marked with ib:cp
     * @returns {Promise<string>} Current model name
     */
    async backupModel() {
        const widget = this.getCheckpointWidget();
        if (!widget) {
            console.warn('backupModel: No marked checkpoint node found (looking for "ib:cp" in node title)');
            return null;
        }
        return widget.value;
    }

    /**
     * Restore/set model
     * Uses marker-based discovery to set the node marked with ib:cp
     * @param {string} modelName - Model name to set
     * @returns {Promise<void>}
     */
    async restoreModel(modelName) {
        if (!modelName) {
            console.warn('restoreModel: No model name provided');
            return;
        }

        if (!this.setCheckpoint(modelName)) {
            console.error('restoreModel: No marked checkpoint node found (looking for "ib:cp" in node title)');
        }
    }

    /**
     * UI presets are a Forge concept; no-ops in ComfyUI
     */
    async backupUiPreset() {
        return null;
    }

    async restoreUiPreset(preset) {}

    async applyUiPresetForModel(modelName) {}

    /**
     * Per-model generation parameters are applied in SD WebUI only; no-ops in ComfyUI
     */
    async applyGenerationParams(params) {}

    async backupGenerationParams() {
        return null;
    }

    async restoreGenerationParams(backup) {}

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
     * Uses marker-based discovery (ib:smp) or falls back to KSampler
     * @param {number} seed - The seed value
     */
    setSeed(seed) {
        // -1 means a random seed (SD WebUI convention), but ComfyUI rejects negative seeds
        if (seed < 0) {
            seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        }
        this.setSamplerValue('seed', seed);
    }

    /**
     * Get the seed value from sampler
     * @returns {number|null} The seed value or null
     */
    getSeed() {
        return this.getSamplerValue('seed');
    }

    /**
     * Set control_after_generate on sampler
     * For a subgraph node the control widget stays on the inner sampler and drives the promoted seed
     * @param {string} value - Control mode ("fixed", "increment", "decrement", "randomize")
     */
    setControlAfterGenerate(value) {
        this.setSamplerValue('control_after_generate', value);
    }

    /**
     * Get control_after_generate from sampler
     * @returns {string|null} The control mode or null
     */
    getControlAfterGenerate() {
        return this.getSamplerValue('control_after_generate');
    }

    /**
     * Set the steps value
     * Uses marker-based discovery (ib:smp) or falls back to KSampler
     * @param {number} steps - Number of steps
     */
    setSteps(steps) {
        const target = this.getSamplerTarget();
        const widgetName = (target && getRoleWidgetName(MARKER_ROLES.sampler, this.nodeConfig, target)) ?? 'steps';
        this.setSamplerValue(widgetName, steps);
    }

    /**
     * Get the steps value from sampler
     * @returns {number|null} The steps value or null
     */
    getSteps() {
        return this.getSamplerValue('steps');
    }

    /**
     * Set the CFG scale
     * @param {number} cfg - CFG scale value
     */
    setCFG(cfg) {
        this.setSamplerValue('cfg', cfg);
    }

    /**
     * Set the denoising strength
     * @param {number} denoise - Denoise value (0-1)
     */
    setDenoise(denoise) {
        this.setSamplerValue('denoise', denoise);
    }

    /**
     * Set the sampler name
     * @param {string} samplerName - Sampler name
     */
    setSampler(samplerName) {
        this.setSamplerValue('sampler_name', samplerName);
    }

    /**
     * Set the scheduler
     * @param {string} scheduler - Scheduler name
     */
    setScheduler(scheduler) {
        this.setSamplerValue('scheduler', scheduler);
    }

    /**
     * Set the positive prompt
     * Uses marker-based discovery (ib:pp) or falls back to first CLIPTextEncode
     * @param {string} prompt - The prompt text
     */
    setPrompt(prompt) {
        const fallbackNode = getNodesByType(this.app, 'CLIPTextEncode')[0];
        if (!this.setPromptText(MARKER_ROLES.positivePrompt, fallbackNode, prompt)) {
            console.warn('[ComfyUIOperations] No marked positive prompt node found (looking for "ib:pp" in node title) and no CLIPTextEncode nodes found');
        }
    }

    /**
     * Set the negative prompt
     * Uses marker-based discovery (ib:np) or falls back to second CLIPTextEncode
     * @param {string} prompt - The negative prompt text
     */
    setNegativePrompt(prompt) {
        const fallbackNode = getNodesByType(this.app, 'CLIPTextEncode')[1];
        if (!this.setPromptText(MARKER_ROLES.negativePrompt, fallbackNode, prompt)) {
            console.warn('[ComfyUIOperations] No marked negative prompt node found (looking for "ib:np" in node title) and no second CLIPTextEncode node found');
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
            const widget = this.getCheckpointWidget();
            if (!widget) {
                console.warn('MODEL_CHECKPOINT: No marked checkpoint node found (looking for "ib:cp" in node title)');
                return null;
            }
            return widget.value;
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
            if (!this.setCheckpoint(value)) {
                console.error('MODEL_CHECKPOINT: No marked checkpoint node found (looking for "ib:cp" in node title)');
            }
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
