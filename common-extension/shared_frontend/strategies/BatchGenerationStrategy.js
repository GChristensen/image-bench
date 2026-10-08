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
        this.savedImages = 0;
    }

    isWebUI() {
        return this.uiOperations.getPlatform() === 'webui';
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
        this.savedImages = 0;

        // Detect platform to determine queue structure
        const platform = this.uiOperations.getPlatform();

        if (platform === 'comfyui') {
            // ComfyUI: Create N queue items (one per image)
            // Each processItem() call queues one workflow
            this.queue = [];
            for (let i = 0; i < this.nImagesToGenerate; i++) {
                this.queue.push({ index: i });
            }
            this.totalItems = this.queue.length;
        } else {
            // SD WebUI: Single queue item, batch count parameter handles multiple images
            this.queue = [true];
            this.totalItems = 1;
        }
    }

    /**
     * Prepare for batch generation
     */
    async prepare(options) {
        this.config = options.config || {};

        // Notify that processing started
        this.messageBus.publish('BEGIN_PROCESSING', {});

        const isImg2ImgTab = this.uiOperations.isImg2ImgTab();
        const platform = this.uiOperations.getPlatform();

        // Set seed
        if (this.isVariations) {
            await this.uiOperations.enableVariations(options.strength);
        } else {
            await this.uiOperations.setInputValue('TXT2IMG_SEED', -1);
        }

        // Set batch count (only for WebUI, no-op in ComfyUI)
        if (platform === 'webui') {
            const nImagesToGenerate = this.nImagesToGenerate || this.config.defaultBatches || 100;
            await this.uiOperations.setBatchCount(nImagesToGenerate);
        }

        // Disable hires fix for txt2img (WebUI only)
        if (platform === 'webui' && !isImg2ImgTab) {
            this.uiOperations.toggleHiresFix(false, true);
        }
    }

    /**
     * Process the batch generation (click generate button)
     */
    async processItem(item) {
        await this.uiOperations.sleep(500);
        await this.clickGenerate();
    }

    /**
     * On WebUI the whole batch is a single generation: processNext() is called on each saved image,
     * which only advances the progress. The strategy is finished by BATCH_GENERATION_FINISHED
     * when the interrupt button is hidden
     */
    async processNext() {
        if (this.isWebUI() && this.queue.length === 0) {
            this.savedImages += 1;
            this.reportProgress();
            return;
        }

        await super.processNext();
    }

    /**
     * On WebUI report the overall progress over the batch: saved images / batch count
     */
    reportProgress() {
        if (!this.isWebUI())
            return super.reportProgress();

        const completed = Math.min(this.savedImages, this.nImagesToGenerate);
        const progress = (completed / this.nImagesToGenerate) * 100;

        this.messageBus.publish('GENERATION_PROGRESS', { progress });
    }

    /**
     * Finish batch generation and cleanup
     */
    async finish() {
        this.isActive = false;

        const platform = this.uiOperations.getPlatform();

        // Reset batch count (only for WebUI)
        if (platform === 'webui') {
            await this.uiOperations.setBatchCount(1);
        }

        // Reset variations if used
        if (this.isVariations) {
            this.isVariations = false;
            await this.uiOperations.disableVariations();
        }

        const tempGenId = this.generationId;
        this.generationId = null;
        this.isImg2Img = false;

        await this.uiOperations.sleep(1000);

        // Save controlnet images if any (WebUI only)
        if (platform === 'webui') {
            await this.saveControlnetImages(tempGenId);
        }

        // Publish GENERATION_FINISHED event
        if (platform === 'comfyui')
            this.messageBus.publish('GENERATION_FINISHED', {});
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
