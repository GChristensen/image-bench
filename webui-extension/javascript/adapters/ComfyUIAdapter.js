/**
 * ComfyUIAdapter
 * ComfyUI-specific implementation of DOMAdapter
 *
 * Note: ComfyUI uses a node-based workflow system, which is fundamentally different
 * from SD WebUI's form-based interface. Many methods are adapted to work with workflows.
 */

import { DOMAdapter } from './DOMAdapter.js';

export class ComfyUIAdapter extends DOMAdapter {
    constructor(app, api) {
        super();
        this.app = app; // ComfyUI app instance
        this.api = api; // ComfyUI api instance
    }

    /**
     * Find a workflow node by its type
     * @param {string} nodeType - Node type (e.g., 'KSampler', 'CheckpointLoaderSimple')
     * @returns {Object|null} The node object or null
     */
    getNodeByType(nodeType) {
        if (!this.app?.graph?.nodes) {
            return null;
        }

        return this.app.graph.nodes.find(node => node.type === nodeType);
    }

    /**
     * Get all nodes of a specific type
     * @param {string} nodeType - Node type
     * @returns {Array} Array of matching nodes
     */
    getNodesByType(nodeType) {
        if (!this.app?.graph?.nodes) {
            return [];
        }

        return this.app.graph.nodes.filter(node => node.type === nodeType);
    }

    /**
     * Get a node's widget by name
     * @param {Object} node - The node object
     * @param {string} widgetName - Name of the widget
     * @returns {Object|null} The widget or null
     */
    getNodeWidget(node, widgetName) {
        if (!node?.widgets) {
            return null;
        }

        return node.widgets.find(w => w.name === widgetName);
    }

    /**
     * Set a node's widget value
     * @param {Object} node - The node object
     * @param {string} widgetName - Name of the widget
     * @param {any} value - Value to set
     * @returns {boolean} Whether the value was set
     */
    setNodeWidgetValue(node, widgetName, value) {
        const widget = this.getNodeWidget(node, widgetName);

        if (!widget) {
            console.warn(`Widget ${widgetName} not found on node ${node.type}`);
            return false;
        }

        widget.value = value;

        // Trigger widget callback if it exists
        if (widget.callback) {
            widget.callback(value);
        }

        return true;
    }

    /**
     * Get the value of an input element (adapted for ComfyUI)
     * For ComfyUI, this gets a widget value from a specific node type
     * @param {string} selectorKey - Format: "NodeType:widgetName"
     * @returns {any|null} The widget value
     */
    getInputValue(selectorKey) {
        const [nodeType, widgetName] = selectorKey.split(':');
        const node = this.getNodeByType(nodeType);

        if (!node) {
            return null;
        }

        const widget = this.getNodeWidget(node, widgetName);
        return widget?.value ?? null;
    }

    /**
     * Set the value of an input element (adapted for ComfyUI)
     * @param {string} selectorKey - Format: "NodeType:widgetName"
     * @param {any} value - The value to set
     * @param {boolean} triggerEvents - Whether to trigger callbacks (default: true)
     */
    setInputValue(selectorKey, value, triggerEvents = true) {
        const [nodeType, widgetName] = selectorKey.split(':');
        const node = this.getNodeByType(nodeType);

        if (!node) {
            console.warn(`Node type ${nodeType} not found`);
            return;
        }

        this.setNodeWidgetValue(node, widgetName, value);
    }

    /**
     * Set the value of a checkbox element (adapted for ComfyUI)
     * In ComfyUI, this maps to boolean widgets
     * @param {string} selectorKey - Format: "NodeType:widgetName"
     * @param {boolean} checked - Whether to check or uncheck
     */
    setCheckboxValue(selectorKey, checked) {
        this.setInputValue(selectorKey, checked, true);
    }

    /**
     * Set the value of a dropdown element (adapted for ComfyUI)
     * @param {string} selectorKey - Format: "NodeType:widgetName"
     * @param {string} value - The value to select
     * @returns {Promise<void>}
     */
    async setDropdownValue(selectorKey, value) {
        this.setInputValue(selectorKey, value, true);
    }

    /**
     * Click a button element
     * In ComfyUI, this primarily means queueing the prompt
     * @param {string} selectorKey - "GENERATE" to queue prompt
     * @returns {boolean} Whether the action succeeded
     */
    clickButton(selectorKey) {
        if (selectorKey === 'GENERATE' || selectorKey === 'TXT2IMG_GENERATE') {
            return this.queuePrompt();
        }

        if (selectorKey === 'INTERRUPT' || selectorKey === 'TXT2IMG_INTERRUPT') {
            return this.interrupt();
        }

        return false;
    }

    /**
     * Queue the current workflow for execution
     * @returns {boolean} Whether the prompt was queued
     */
    queuePrompt() {
        try {
            this.app.queuePrompt(0, 1); // Queue with batch count 1
            return true;
        } catch (e) {
            console.error('Failed to queue prompt:', e);
            return false;
        }
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
     * Check if an element is visible
     * Not applicable to ComfyUI's node-based system
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
     * Get element by selector key
     * For ComfyUI, this returns the app or api object for specific keys
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
        return this.getNodeByType(selectorKey);
    }

    /**
     * Get all elements matching selector key
     * For ComfyUI, returns all nodes of a specific type
     * @param {string} selectorKey - Node type
     * @returns {Array}
     */
    getAllElements(selectorKey) {
        return this.getNodesByType(selectorKey);
    }

    /**
     * Toggle hires fix checkbox
     * In ComfyUI, this would be handled via latent upscaling nodes
     * @param {boolean} onlyEnable - Only enable, don't toggle off
     * @param {boolean} onlyDisable - Only disable, don't toggle on
     */
    toggleHiresFix(onlyEnable = false, onlyDisable = false) {
        // Not directly applicable to ComfyUI
        // Hires fix in ComfyUI is done via LatentUpscale nodes
        console.warn('toggleHiresFix not implemented for ComfyUI');
    }

    /**
     * Check if currently on img2img tab
     * In ComfyUI, check if workflow has img2img nodes
     * @returns {boolean}
     */
    isImg2ImgTab() {
        // Check if workflow contains LoadImage node (common in img2img workflows)
        const loadImageNode = this.getNodeByType('LoadImage');
        return loadImageNode !== null;
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
     * Dispatch a mouse event on an element
     * @param {HTMLElement} element - Target element
     * @param {string} eventType - Event type
     */
    dispatchMouseEvent(element, eventType) {
        if (!element) {
            return;
        }

        const mouseEvent = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0
        });

        element.dispatchEvent(mouseEvent);
    }

    /**
     * Get the current workflow as JSON
     * @returns {Object} The workflow object
     */
    getWorkflow() {
        return this.app?.graph?.serialize() || {};
    }

    /**
     * Load a workflow from JSON
     * @param {Object} workflow - The workflow to load
     */
    async loadWorkflow(workflow) {
        if (!this.app) {
            throw new Error('ComfyUI app not available');
        }

        await this.app.loadGraphData(workflow);
    }

    /**
     * Set the seed value
     * @param {number} seed - The seed value
     */
    setSeed(seed) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'seed', seed);
        }
    }

    /**
     * Set the steps value
     * @param {number} steps - Number of steps
     */
    setSteps(steps) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'steps', steps);
        }
    }

    /**
     * Set the CFG scale
     * @param {number} cfg - CFG scale value
     */
    setCFG(cfg) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'cfg', cfg);
        }
    }

    /**
     * Set the model checkpoint
     * @param {string} modelName - Model name
     */
    async setModel(modelName) {
        const checkpoint = this.getNodeByType('CheckpointLoaderSimple');
        if (checkpoint) {
            this.setNodeWidgetValue(checkpoint, 'ckpt_name', modelName);
        }
    }

    /**
     * Set the sampler name
     * @param {string} samplerName - Sampler name
     */
    setSampler(samplerName) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'sampler_name', samplerName);
        }
    }

    /**
     * Set the scheduler
     * @param {string} scheduler - Scheduler name
     */
    setScheduler(scheduler) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'scheduler', scheduler);
        }
    }

    /**
     * Set the denoising strength
     * @param {number} denoise - Denoise value (0-1)
     */
    setDenoise(denoise) {
        const sampler = this.getNodeByType('KSampler');
        if (sampler) {
            this.setNodeWidgetValue(sampler, 'denoise', denoise);
        }
    }

    /**
     * Set the positive prompt
     * @param {string} prompt - The prompt text
     */
    setPrompt(prompt) {
        const promptNodes = this.getNodesByType('CLIPTextEncode');
        if (promptNodes.length > 0) {
            // First CLIPTextEncode is usually positive prompt
            this.setNodeWidgetValue(promptNodes[0], 'text', prompt);
        }
    }

    /**
     * Set the negative prompt
     * @param {string} prompt - The negative prompt text
     */
    setNegativePrompt(prompt) {
        const promptNodes = this.getNodesByType('CLIPTextEncode');
        if (promptNodes.length > 1) {
            // Second CLIPTextEncode is usually negative prompt
            this.setNodeWidgetValue(promptNodes[1], 'text', prompt);
        }
    }
}
