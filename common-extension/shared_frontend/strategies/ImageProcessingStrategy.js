/**
 * ImageProcessingStrategy
 * Strategy for processing/upscaling images with parameter control
 */

import { QueueProcessor } from '../core/QueueProcessor.js';

export class ImageProcessingStrategy extends QueueProcessor {
    constructor(uiOperations, messageBus) {
        super(uiOperations, messageBus);
        this.setSteps = false;
        this.setDenoising = false;
        this.paramsBackup = null;
        this.progressMonitoring = false;
    }

    /**
     * Initialize image processing queue
     * @param {Object} options - { images: [], setSteps: boolean, setDenoising: boolean, preset: string }
     */
    initialize(options) {
        if (!options.images || !options.images.length) {
            throw new Error('No images provided for processing');
        }

        this.queue = [...options.images];
        this.totalItems = options.images.length;
        this.generationId = this.createGenerationId();
        this.setSteps = options.setSteps || false;
        this.setDenoising = options.setDenoising || false;
    }

    /**
     * Prepare for processing - backup parameters and configure
     */
    async prepare(options) {
        // Notify that processing started
        this.messageBus.publish('BEGIN_PROCESSING', {});

        // Backup current parameters
        this.paramsBackup = await this.uiOperations.backupGenerationParams();

        // Apply preset if specified
        if (options.preset) {
            await this.uiOperations.applyPreset(options.preset);
            await this.uiOperations.sleep(500);
        }

        // Enable hires fix for sequential generation, disable for hires fix mode
        if (!this.setSteps) {
            this.uiOperations.toggleHiresFix(true);
        }

        // Set batch count to 1 for sequential processing
        await this.uiOperations.setBatchCount(1);

        // Start progress monitoring
        this.startProgressMonitoring();
    }

    /**
     * Process a single image
     * @param {Object} imageData - Image data with parameters
     */
    async processItem(imageData) {
        if (!imageData || !imageData.parameters) {
            return;
        }

        const parameters = imageData.parameters;

        // Apply image parameters
        await this.uiOperations.applyImageParameters(parameters, {
            setSteps: this.setSteps || imageData.setSteps,
            setDenoising: this.setDenoising
        });

        await this.uiOperations.sleep(500);

        // Click generate button
        await this.clickGenerate();
    }

    /**
     * Override reportProgress to include sub-progress from current generation
     */
    reportProgress() {
        if (this.totalItems === 0) return;

        const chunk = 1 / this.totalItems;
        const completed = this.getCompletedItems();
        let progress = completed * chunk * 100;

        // Add current generation progress
        const currentProgress = this.uiOperations.getGenerationProgress();
        if (currentProgress !== null && !isNaN(currentProgress) && currentProgress < 100) {
            progress += currentProgress * chunk;
        }

        this.messageBus.publish('GENERATION_PROGRESS', { progress, completed, total: this.totalItems });
    }

    /**
     * Start monitoring progress with sub-progress
     */
    async startProgressMonitoring() {
        this.progressMonitoring = true;

        const monitorProgress = async () => {
            while (this.progressMonitoring && this.isActive) {
                await this.uiOperations.sleep(1000);
                this.reportProgress();
            }
        };

        // Start monitoring in background
        monitorProgress();
    }

    /**
     * Finish processing and restore parameters
     */
    async finish() {
        this.isActive = false;
        this.progressMonitoring = false;
        this.queue = [];

        // Restore parameters
        if (this.paramsBackup) {
            this.uiOperations.restoreGenerationParams(this.paramsBackup);
        }

        // Toggle hires fix back if needed
        if (!this.setSteps) {
            this.uiOperations.toggleHiresFix();
        }

        const tempGenId = this.generationId;
        this.generationId = null;
        this.paramsBackup = null;
        this.setDenoising = false;
        this.setSteps = false;

        this.messageBus.publish('GENERATION_FINISHED', {});

        await this.uiOperations.sleep(1000);
        await this.saveControlnetImages(tempGenId);
    }

    /**
     * Get message parameters for saved images
     */
    getMessageParams() {
        const params = {
            generationId: this.generationId
        };

        if (this.setSteps) {
            params.setSteps = true;
        }

        return params;
    }
}
