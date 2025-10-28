/**
 * BatchGenerationStrategy
 * Strategy for batch generation with optional variations
 */

import { QueueProcessor } from '../core/QueueProcessor.js';

export class BatchGenerationStrategy extends QueueProcessor {
    constructor(uiOperations, messageBus) {
        super(uiOperations, messageBus);
        this.isImg2Img = false;
        this.isVariations = false;
        this.nImagesToGenerate = 100;
        this.config = null;
    }

    /**
     * Initialize batch generation
     * @param {Object} options - { img2img: boolean, strength: number (for variations), preset: string }
     */
    initialize(options) {
        this.isImg2Img = options.img2img || false;
        this.isVariations = options.strength !== undefined;
        this.nImagesToGenerate = options.generateImages || 100;
        this.generationId = this.createGenerationId();
        
        // Batch generation doesn't use a queue in the traditional sense
        // The batch count is handled by the WebUI itself
        this.queue = [true]; // Single item to trigger generation
        this.totalItems = 1;
    }

    /**
     * Prepare for batch generation
     */
    async prepare(options) {
        this.config = options.config || {};
        
        // Notify that processing started
        this.messageBus.publish('BEGIN_PROCESSING', {});
        
        const isImg2ImgTab = this.uiOperations.isImg2ImgTab();

        // Set seed
        if (this.isVariations) {
            await this.uiOperations.enableVariations(options.strength);
        } else {
            await this.uiOperations.setInputValue('TXT2IMG_SEED', -1);
        }

        const nImagesToGenerate = this.nImagesToGenerate || this.config.defaultBatches || 100;
        await this.uiOperations.setBatchCount(nImagesToGenerate);

        // Disable hires fix for txt2img
        if (!isImg2ImgTab) {
            this.uiOperations.toggleHiresFix(false, true);
        }
    }

    /**
     * Process the batch generation (click generate button)
     */
    async processItem(item) {
        await this.uiOperations.sleep(500);
        this.uiOperations.clickGenerate();
    }

    /**
     * Finish batch generation and cleanup
     */
    async finish() {
        this.isActive = false;

        // Reset batch count
        await this.uiOperations.setBatchCount(1);

        // Reset variations if used
        if (this.isVariations) {
            this.isVariations = false;
            await this.uiOperations.disableVariations();
        }

        const tempGenId = this.generationId;
        this.generationId = null;
        this.isImg2Img = false;

        await this.uiOperations.sleep(1000);

        // Save controlnet images if any
        await this.saveControlnetImages(tempGenId);
    }

    /**
     * Get message parameters for saved images
     */
    getMessageParams() {
        const params = {
            generationId: this.generationId
        };

        if (this.isImg2Img) {
            params.img2img = true;
        }

        return params;
    }
}
