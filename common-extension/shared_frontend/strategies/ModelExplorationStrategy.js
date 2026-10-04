/**
 * ModelExplorationStrategy
 * Strategy for exploring different models by generating images with each
 */

import { QueueProcessor } from '../core/QueueProcessor.js';

export class ModelExplorationStrategy extends QueueProcessor {
    constructor(uiOperations, messageBus) {
        super(uiOperations, messageBus);
        this.currentModel = null;
        this.modelBeforeExplore = null;
        this.uiPresetBeforeExplore = null;
        this.invalidated = false;
    }

    /**
     * Initialize the exploration queue
     * @param {Object} options - { models: [], generateImages: number }
     */
    initialize(options) {
        console.log('[ModelExploration] initialize() called with options:', options);

        if (!options.models || !options.models.length) {
            console.error('[ModelExploration] No models provided!');
            throw new Error('No models provided for exploration');
        }

        // Build queue of model entries
        this.queue = [];
        for (const model of options.models) {
            for (let i = 0; i < options.generateImages; i++) {
                this.queue.push(model);
            }
        }

        this.totalItems = this.queue.length;
        this.generationId = this.createGenerationId();
        this.currentModel = options.models[0];

        console.log('[ModelExploration] Queue built with', this.totalItems, 'items');
        console.log('[ModelExploration] Models to explore:', options.models.map(m => m.title).join(', '));
        console.log('[ModelExploration] Images per model:', options.generateImages);
        console.log('[ModelExploration] Generation ID:', this.generationId);
    }

    /**
     * Prepare for exploration - set initial model and parameters
     */
    async prepare(options) {
        console.log('[ModelExploration] prepare() starting...');

        // Save current model to restore later
        console.log('[ModelExploration] Backing up current model...');
        this.modelBeforeExplore = await this.uiOperations.backupModel();
        console.log('[ModelExploration] Backed up model:', this.modelBeforeExplore);
        this.uiPresetBeforeExplore = await this.uiOperations.backupUiPreset();

        // Set initial model
        console.log('[ModelExploration] Setting initial model to:', this.currentModel.title);
        await this.uiOperations.applyUiPresetForModel(this.currentModel.title);
        await this.uiOperations.restoreModel(this.currentModel.title);

        // Configure generation parameters
        console.log('[ModelExploration] Configuring generation parameters (seed=-1, batch=1)');
        await this.uiOperations.setupBasicGeneration(-1, 1);

        // Notify that processing started
        console.log('[ModelExploration] Publishing BEGIN_PROCESSING event');
        this.messageBus.publish('BEGIN_PROCESSING', {});
        console.log('[ModelExploration] prepare() complete');
    }

    /**
     * Process a single model exploration
     * @param {Object} model - Model object with title property
     */
    async processItem(model) {
        console.log('[ModelExploration] processItem() called for model:', model.title);
        console.log('[ModelExploration] Current model:', this.currentModel.title);

        // Switch model if different from current
        if (this.currentModel.title !== model.title) {
            console.log('[ModelExploration] Switching model from', this.currentModel.title, 'to', model.title);
            await this.uiOperations.applyUiPresetForModel(model.title);
            await this.uiOperations.restoreModel(model.title);
            this.currentModel = model;
            console.log('[ModelExploration] Model switched successfully');
        } else {
            console.log('[ModelExploration] Model is already loaded, skipping switch');
        }

        console.log('[ModelExploration] Waiting 1 second before generation...');
        await this.uiOperations.sleep(1000);

        // Click generate button
        console.log('[ModelExploration] Clicking generate button');
        this.uiOperations.clickGenerate();
        console.log('[ModelExploration] Generate button clicked, waiting for image callback...');
    }

    /**
     * Finish exploration and restore original model
     */
    async finish() {
        console.log('[ModelExploration] finish() called');
        this.isActive = false;
        this.queue = [];

        // Restore original model if saved
        if (this.modelBeforeExplore) {
            console.log('[ModelExploration] Restoring original model:', this.modelBeforeExplore);
            await this.uiOperations.restoreUiPreset(this.uiPresetBeforeExplore);
            await this.uiOperations.restoreModel(this.modelBeforeExplore);
            this.modelBeforeExplore = null;
            this.uiPresetBeforeExplore = null;
        } else {
            console.log('[ModelExploration] No model to restore');
        }

        this.generationId = null;
        console.log('[ModelExploration] Publishing GENERATION_FINISHED event');
        this.messageBus.publish('GENERATION_FINISHED', {});
        console.log('[ModelExploration] Exploration finished');
    }

    /**
     * Invalidate this exploration (called when "Send to Txt2Img" is used)
     */
    invalidate() {
        this.invalidated = true;
    }

    /**
     * Check if exploration is invalidated
     */
    isInvalidated() {
        return this.invalidated;
    }

    /**
     * Get message parameters for saved images
     */
    getMessageParams() {
        return {
            generationId: this.generationId
        };
    }
}
