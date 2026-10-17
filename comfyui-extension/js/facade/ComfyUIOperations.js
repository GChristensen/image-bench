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
    loadWorkflow,
    getNodeMarkerIndex,
    getRoleMarker
} from '../workflow.js';
import {createParamRegistry} from '../params.js';
import {setLoadImage} from '../images.js';

// Strength widgets of LoRA loaders (LoraLoaderModelOnly has only strength_model)
const LORA_STRENGTH_WIDGETS = ['strength_model', 'strength_clip'];

// Roles that skip the target of another role accepting the same node types
const PRECEDING_ROLES = new Map([
    [MARKER_ROLES.negativePrompt, MARKER_ROLES.positivePrompt],
    [MARKER_ROLES.mask, MARKER_ROLES.image]
]);

const isSet = value => value !== undefined && value !== null;

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
        // Generation parameters located through the sampler (node_config.json generation_params)
        this.params = createParamRegistry(this);
        // Generation progress (progress.js), attached by core.js
        this.progress = null;
    }

    // ==================== NODE DISCOVERY METHODS ====================

    /**
     * Get the first target of a marker role (see MarkerTarget in workflow.js)
     * The negative prompt skips the positive prompt target, so one subgraph node marked
     * "ib:pp ib:np" yields its first promoted text encoder as positive and the second as negative.
     * Likewise the mask skips the image target, so the mask never replaces the image in a shared node
     * @param {Object} role - Entry of MARKER_ROLES
     * @returns {Object|null}
     */
    getRoleTarget(role) {
        const targets = getMarkerTargets(this.app, role, this.nodeConfig);
        const precedingRole = PRECEDING_ROLES.get(role);

        // A node holding both values in different widgets (TextEncodeQwenImage21: prompt, negative_prompt) is not skipped
        if (precedingRole) {
            const preceding = this.getRoleTarget(precedingRole);
            const widgetName = target => getRoleWidgetName(role, this.nodeConfig, target);
            const precedingWidgetName = preceding && getRoleWidgetName(precedingRole, this.nodeConfig, preceding);

            return targets.find(target => !isSameTarget(target, preceding) || widgetName(target) !== precedingWidgetName)
                ?? null;
        }

        return targets[0] ?? null;
    }

    /**
     * Get the target of a marker role with the given index ("ib:smp:1"); a marker without an index is index 0
     * @param {Object} role - Entry of MARKER_ROLES
     * @param {number} index
     * @returns {Object|null}
     */
    getRoleTargetAt(role, index) {
        const marker = getRoleMarker(role, this.nodeConfig);
        return getMarkerTargets(this.app, role, this.nodeConfig)
            .find(target => getNodeMarkerIndex(target.host, marker) === index) ?? null;
    }

    /**
     * Get the sampler target (ib:smp or ib:smp:0) with fallback to the first KSampler
     * @returns {Object|null}
     */
    getSamplerTarget() {
        return this.getRoleTargetAt(MARKER_ROLES.sampler, 0)
            ?? createNodeTarget(getNodeByType(this.app, 'KSampler'));
    }

    /**
     * Get the sampler of the second pass (Hires. fix), marked ib:smp:1
     * @returns {Object|null}
     */
    getHiresSamplerTarget() {
        return this.getRoleTargetAt(MARKER_ROLES.sampler, 1);
    }

    /**
     * Get the switches of the Hires. fix pass (ib:hr, e.g. an If/Else Switch choosing the image of the first
     * or the second pass)
     * @returns {Array<{target: Object, widgetName: string}>}
     */
    getHiresFixSwitches() {
        const role = MARKER_ROLES.hiresFix;

        return getMarkerTargets(this.app, role, this.nodeConfig)
            .map(target => ({target, widgetName: getRoleWidgetName(role, this.nodeConfig, target)}))
            .filter(({target, widgetName}) => widgetName && getTargetWidget(target, widgetName));
    }

    /**
     * @returns {boolean|null} Whether Hires. fix is on, null if the workflow has no switch for it
     */
    getHiresFix() {
        const [first] = this.getHiresFixSwitches();
        return first ? !!getTargetWidget(first.target, first.widgetName).value : null;
    }

    /**
     * Set all Hires. fix switches
     * @param {boolean} enabled
     * @returns {boolean} Whether the workflow has a switch
     */
    setHiresFix(enabled) {
        const switches = this.getHiresFixSwitches();

        for (const {target, widgetName} of switches)
            setTargetWidgetValue(target, widgetName, !!enabled);

        return switches.length > 0;
    }

    /**
     * Report a parameter that is not found in the workflow
     * @param {string} name
     * @param {boolean} found
     */
    warnIfMissing(name, found) {
        if (!found)
            console.warn(`[ComfyUIOperations] No ${name} found through the sampler (marked with ib:smp or KSampler)`);
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
     * Get the target and widget name of a prompt: the node marked ib:pp / ib:np,
     * else the first / second CLIPTextEncode
     * @param {'positive'|'negative'} kind
     * @returns {{target: Object, widgetName: string}|null}
     */
    getPromptTarget(kind) {
        const role = kind === 'negative' ? MARKER_ROLES.negativePrompt : MARKER_ROLES.positivePrompt;
        const fallbackNode = getNodesByType(this.app, 'CLIPTextEncode')[kind === 'negative' ? 1 : 0];
        const target = this.getRoleTarget(role) ?? createNodeTarget(fallbackNode);

        return target && {target, widgetName: getRoleWidgetName(role, this.nodeConfig, target) ?? 'text'};
    }

    /**
     * @param {'positive'|'negative'} kind
     * @returns {Object|null} The text widget of a prompt
     */
    getPromptWidget(kind) {
        const prompt = this.getPromptTarget(kind);
        return prompt && getTargetWidget(prompt.target, prompt.widgetName);
    }

    /**
     * Set the text of a prompt
     * @param {'positive'|'negative'} kind
     * @param {string} text
     * @returns {boolean} Whether the prompt was set
     */
    setPromptWidgetValue(kind, text) {
        const prompt = this.getPromptTarget(kind);
        return !!prompt && setTargetWidgetValue(prompt.target, prompt.widgetName, text);
    }

    /**
     * Get the execution ids of the current marker targets, used to find them in /history
     * @returns {Object} Execution ids keyed by MARKER_ROLES key
     */
    getMarkerExecutionIds() {
        return {
            ...Object.fromEntries(Object.entries(MARKER_ROLES)
                .map(([key, role]) => [key, this.getRoleTarget(role)?.executionId])),
            sampler: this.getSamplerTarget()?.executionId,
            // Execution ids and widget names of the located generation parameters
            params: this.params.getExecutionIds()
        };
    }

    // ==================== LORA ====================

    /**
     * Get the LoRA loader target (node marked with ib:lora)
     * @returns {Object|null}
     */
    getLoraTarget() {
        return this.getRoleTarget(MARKER_ROLES.lora);
    }

    /**
     * Get the strength widgets of a LoRA loader target, keyed by widget name
     * @param {Object} target
     * @returns {Object}
     */
    getLoraStrengthWidgets(target) {
        return Object.fromEntries(LORA_STRENGTH_WIDGETS
            .map(name => [name, getTargetWidget(target, name)])
            .filter(([, widget]) => widget));
    }

    /**
     * Backup the LoRA, strengths and mode of the node marked with ib:lora
     * @returns {Promise<Object|null>}
     */
    async backupLora() {
        const target = this.getLoraTarget();
        if (!target) {
            return null;
        }

        const widgetName = getRoleWidgetName(MARKER_ROLES.lora, this.nodeConfig, target) ?? 'lora_name';
        const strengths = Object.fromEntries(Object.entries(this.getLoraStrengthWidgets(target))
            .map(([name, widget]) => [name, widget.value]));

        return {
            name: getTargetWidget(target, widgetName)?.value ?? null,
            strengths,
            // The mode of a subgraph host is left alone: bypassing it would bypass the whole subgraph
            mode: target.host === target.source ? target.host.mode : undefined
        };
    }

    /**
     * Set the LoRA of the node marked with ib:lora
     * A null LoRA (the LoRA-free run) sets the strengths to 0, which makes ComfyUI skip loading the LoRA
     * @param {Object|null} lora - {name, weight} or null
     * @returns {Promise<boolean>} Whether the LoRA was set
     */
    async setLora(lora) {
        const target = this.getLoraTarget();
        if (!target) {
            console.warn('setLora: No marked LoRA loader node found (looking for "ib:lora" in node title)');
            return false;
        }

        // Make sure a bypassed or muted loader runs
        if (target.host === target.source) {
            target.host.mode = 0;
        }

        if (lora) {
            const widgetName = getRoleWidgetName(MARKER_ROLES.lora, this.nodeConfig, target) ?? 'lora_name';
            setTargetWidgetValue(target, widgetName, lora.name);
        }

        const strength = lora ? Number(lora.weight ?? 1) : 0;
        for (const name of Object.keys(this.getLoraStrengthWidgets(target))) {
            setTargetWidgetValue(target, name, strength);
        }

        this.app.graph.setDirtyCanvas(true, true);
        return true;
    }

    /**
     * Restore the node marked with ib:lora from a backupLora() result
     * @param {Object|null} backup
     */
    async restoreLora(backup) {
        const target = backup && this.getLoraTarget();
        if (!target) {
            return;
        }

        if (backup.mode !== undefined && target.host === target.source) {
            target.host.mode = backup.mode;
        }

        if (backup.name !== null) {
            const widgetName = getRoleWidgetName(MARKER_ROLES.lora, this.nodeConfig, target) ?? 'lora_name';
            setTargetWidgetValue(target, widgetName, backup.name);
        }

        for (const [name, value] of Object.entries(backup.strengths)) {
            setTargetWidgetValue(target, name, value);
        }

        this.app.graph.setDirtyCanvas(true, true);
    }

    // ==================== INPAINT IMAGES ====================

    /**
     * Load an image sent from the editor into the node marked with ib:img (kind=image) or ib:mask (kind=mask)
     * @param {'image'|'mask'} kind - Image kind
     * @param {string} filename - Name of the file in the ComfyUI input directory
     * @returns {boolean} Whether a marked node was found
     */
    setInpaintUploadImage(kind, filename) {
        const role = kind === 'mask' ? MARKER_ROLES.mask : MARKER_ROLES.image;
        const target = this.getRoleTarget(role);
        const widgetName = target && (getRoleWidgetName(role, this.nodeConfig, target) ?? 'image');

        if (!widgetName || !setLoadImage(target, widgetName, filename)) {
            return false;
        }

        this.app.graph.setDirtyCanvas(true, true);
        return true;
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
     * Per-model generation parameters are applied in SD WebUI only; no-op in ComfyUI
     */
    async applyGenerationParams(params) {}

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
        this.warnIfMissing('seed', this.params.setValue('seed', seed));
    }

    /**
     * Get the seed value from sampler
     * @returns {number|null} The seed value or null
     */
    getSeed() {
        return this.params.getValue('seed');
    }

    /**
     * Set control_after_generate on sampler
     * For a subgraph node the control widget stays on the inner sampler and drives the promoted seed
     * @param {string} value - Control mode ("fixed", "increment", "decrement", "randomize")
     */
    setControlAfterGenerate(value) {
        this.params.setSeedControl(value);
    }

    /**
     * Get control_after_generate from sampler
     * @returns {string|null} The control mode or null
     */
    getControlAfterGenerate() {
        return this.params.getSeedControl();
    }

    /**
     * Set the steps value
     * Uses marker-based discovery (ib:smp) or falls back to KSampler
     * @param {number} steps - Number of steps
     */
    setSteps(steps) {
        this.warnIfMissing('steps', this.params.setValue('steps', steps));
    }

    /**
     * Get the steps value from sampler
     * @returns {number|null} The steps value or null
     */
    getSteps() {
        return this.params.getValue('steps');
    }

    /**
     * Set the CFG scale
     * @param {number} cfg - CFG scale value
     */
    setCFG(cfg) {
        this.warnIfMissing('cfg', this.params.setValue('cfg', cfg));
    }

    /**
     * Set the denoising strength
     * @param {number} denoise - Denoise value (0-1)
     */
    setDenoise(denoise) {
        this.warnIfMissing('denoise', this.params.setValue('denoise', denoise));
    }

    /**
     * Set the sampler name
     * @param {string} samplerName - Sampler name
     */
    setSampler(samplerName) {
        this.warnIfMissing('sampler', this.params.setValue('sampler', samplerName));
    }

    /**
     * Set the scheduler
     * @param {string} scheduler - Scheduler name
     */
    setScheduler(scheduler) {
        this.warnIfMissing('scheduler', this.params.setValue('scheduler', scheduler));
    }

    /**
     * Get the positive prompt
     * Uses marker-based discovery (ib:pp) or falls back to first CLIPTextEncode
     * @returns {Promise<string|null>}
     */
    async getPrompt() {
        return this.getPromptWidget('positive')?.value ?? null;
    }

    /**
     * Set the positive prompt
     * Uses marker-based discovery (ib:pp) or falls back to first CLIPTextEncode
     * @param {string} prompt - The prompt text
     */
    setPrompt(prompt) {
        if (!this.setPromptWidgetValue('positive', prompt)) {
            console.warn('[ComfyUIOperations] No marked positive prompt node found (looking for "ib:pp" in node title) and no CLIPTextEncode nodes found');
        }
    }

    /**
     * Set the negative prompt
     * Uses marker-based discovery (ib:np) or falls back to second CLIPTextEncode
     * @param {string} prompt - The negative prompt text
     */
    setNegativePrompt(prompt) {
        if (!this.setPromptWidgetValue('negative', prompt)) {
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
        // The batch strategy sets the seed to -1: randomized after each queued generation, as in the Generate tab
        if (selectorKey === 'TXT2IMG_SEED' || selectorKey === 'IMG2IMG_SEED') {
            this.params.apply({seed: value}, 'txt2img');
            return;
        }

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
        // Tracked from the api progress events (progress.js)
        return this.progress?.getProgress() ?? null;
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
     * Toggle the Hires. fix switches (ib:hr), like the WebUI checkbox; nothing without them
     * @param {boolean} onlyEnable - Only enable, don't toggle off
     * @param {boolean} onlyDisable - Only disable, don't toggle on
     */
    toggleHiresFix(onlyEnable = false, onlyDisable = false) {
        const enabled = this.getHiresFix();

        if (enabled !== null)
            this.setHiresFix(onlyEnable ? true : onlyDisable ? false : !enabled);
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
     * Backup everything applyImageParameters() may change: prompts, checkpoint and the located parameters
     * @returns {Promise<Object>}
     */
    async backupImageParams() {
        // read() reports a randomized seed as -1, the seed value and its control are kept apart
        const params = {...this.params.read('txt2img').params, seed: this.getSeed()};

        return {
            params,
            denoise: this.params.getValue('denoise'),
            seedControl: this.getControlAfterGenerate()
        };
    }

    /**
     * Restore the parameters saved by backupImageParams()
     * @param {Object} backup
     * @returns {Promise<void>}
     */
    async restoreImageParams(backup) {
        if (!backup) {
            return;
        }

        this.params.apply(backup.params, 'txt2img');

        if (backup.denoise !== null) {
            this.params.setValue('denoise', backup.denoise);
        }

        if (backup.seedControl !== null) {
            this.setControlAfterGenerate(backup.seedControl);
        }

        this.app.graph.setDirtyCanvas(true, true);
    }

    /**
     * Set all generation parameters of an image found in the workflow.
     * Choices unknown to the workflow (e.g. WebUI sampler names of a WebUI image) are skipped
     * @param {Object} parameters - Image parameters object (from /history or a WebUI infotext)
     * @param {Object} options - { setDenoising: boolean (denoising strength of the parameters),
     *   upscale: boolean (switch Hires. fix on) }
     * @returns {Promise<void>}
     */
    async applyImageParameters(parameters, options = {}) {
        const accepts = (widget, value) => {
            const choices = widget?.options?.values;
            const list = typeof choices === 'function' ? choices() : choices;
            return !Array.isArray(list) || list.includes(value);
        };
        const choice = (widget, value) => isSet(value) && accepts(widget, value) ? value : undefined;
        // A WebUI infotext has the size as "1024x768"
        const [sizeWidth, sizeHeight] = String(parameters['size'] ?? '').split('x').map(Number);

        this.params.apply({
            prompt: parameters['prompt'],
            negativePrompt: parameters['negative prompt'],
            checkpoint: choice(this.getCheckpointWidget(), parameters['model']),
            seed: parameters['seed'],
            steps: parameters['steps'],
            cfg: parameters['cfg'] ?? parameters['cfg scale'],
            sampler: choice(this.params.locate('sampler')?.widget, parameters['sampler']),
            scheduler: choice(this.params.locate('scheduler')?.widget,
                parameters['scheduler'] ?? parameters['schedule type']),
            width: parameters['width'] ?? (sizeWidth || undefined),
            height: parameters['height'] ?? (sizeHeight || undefined),
            // The Generate tab's shift field: Distilled CFG (FluxGuidance) or Shift, whichever the workflow has
            shift: parameters['guidance'] ?? parameters['distilled cfg scale'] ?? parameters['shift']
        }, 'txt2img');

        // The denoising strength of the parameters is that of Hires. fix (as in WebUI txt2img), if the workflow has it
        if (options.setDenoising) {
            const name = this.getHiresSamplerTarget() ? 'hiresDenoise' : 'denoise';
            const denoising = parameters['denoising strength'];

            if (isSet(denoising))
                this.warnIfMissing(name, this.params.setValue(name, denoising));
        }
        else if (isSet(parameters['denoise'])) {
            this.setDenoise(parameters['denoise']);
        }

        // Upscaling regenerates the image with the Hires. fix pass of the workflow switched on
        if (options.upscale) {
            this.setHiresFix(true);
        }

        this.app.graph.setDirtyCanvas(true, true);
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
