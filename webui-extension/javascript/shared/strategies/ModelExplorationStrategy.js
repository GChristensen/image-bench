/**
 * ModelExplorationStrategy
 * Strategy for exploring different models by generating images with each
 */

import { QueueProcessor } from '../core/QueueProcessor.js';
import { SELECTORS } from '../../adapters/selectors.js';

export class ModelExplorationStrategy extends QueueProcessor {
    constructor(adapter, messageBus) {
        super(adapter, messageBus);
        this.currentModel = null;
        this.modelBeforeExplore = null;
        this.invalidated = false;
    }

    /**
     * Initialize the exploration queue
     * @param {Object} options - { models: [], generateImages: number }
     */
    initialize(options) {
        if (!options.models || !options.models.length) {
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
    }

    /**
     * Prepare for exploration - set initial model and parameters
     */
    async prepare(options) {
        // Save current model to restore later
        this.modelBeforeExplore = await this.adapter.getInputValue('MODEL_CHECKPOINT');
        
        // Set initial model
        await this.adapter.setDropdownValue('MODEL_CHECKPOINT', this.currentModel.title);
        
        // Configure generation parameters
        await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', 1);
        await this.adapter.setInputValue('TXT2IMG_SEED', -1);
        
        // Notify that processing started
        this.messageBus.publish('BEGIN_PROCESSING', {});
    }

    /**
     * Process a single model exploration
     * @param {Object} model - Model object with title property
     */
    async processItem(model) {
        // Switch model if different from current
        if (this.currentModel.title !== model.title) {
            await this.adapter.setDropdownValue('MODEL_CHECKPOINT', model.title);
            this.currentModel = model;
        }

        await this.adapter.sleep(1000);

        // Click generate button
        const generateButton = this.adapter.getElement('TXT2IMG_GENERATE');
        if (generateButton && this.adapter.isElementVisible(generateButton)) {
            generateButton.click();
        }
    }

    /**
     * Finish exploration and restore original model
     */
    async finish() {
        this.isActive = false;
        this.queue = [];

        // Restore original model if saved
        if (this.modelBeforeExplore) {
            await this.adapter.setDropdownValue('MODEL_CHECKPOINT', this.modelBeforeExplore);
            this.modelBeforeExplore = null;
        }

        this.generationId = null;
        this.messageBus.publish('GENERATION_FINISHED', {});
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
