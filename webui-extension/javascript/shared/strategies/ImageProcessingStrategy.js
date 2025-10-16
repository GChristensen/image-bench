/**
 * ImageProcessingStrategy
 * Strategy for processing/upscaling images with parameter control
 */

import { QueueProcessor } from '../core/QueueProcessor.js';

export class ImageProcessingStrategy extends QueueProcessor {
    constructor(adapter, messageBus) {
        super(adapter, messageBus);
        this.setSteps = false;
        this.setDenoising = false;
        this.seedsBeforeProcessing = null;
        this.stepsBeforeProcessing = null;
        this.denoisingBeforeProcessing = null;
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
        this.seedsBeforeProcessing = [
            await this.adapter.getInputValue('TXT2IMG_SEED'),
            await this.adapter.getInputValue('TXT2IMG_SUBSEED')
        ];
        this.stepsBeforeProcessing = await this.adapter.getInputValue('TXT2IMG_STEPS');
        this.denoisingBeforeProcessing = await this.adapter.getInputValue('TXT2IMG_DENOISING');

        // Apply preset if specified
        if (options.preset) {
            await this.setConfigPreset(options.preset);
            await this.adapter.sleep(500);
        }

        // Enable hires fix for sequential generation, disable for hires fix mode
        if (!this.setSteps) {
            this.adapter.toggleHiresFix(true);
        }

        // Set batch count to 1 for sequential processing
        await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', 1);

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

        // Set seed
        await this.adapter.setInputValue('TXT2IMG_SEED', parameters['seed']);

        // Set variation seed if present
        if ('variation seed' in parameters) {
            await this.adapter.setInputValue('TXT2IMG_SUBSEED', parameters['variation seed']);
        }

        // Set denoising strength if needed
        if (this.setDenoising && 'denoising strength' in parameters) {
            await this.adapter.setInputValue('TXT2IMG_DENOISING', parameters['denoising strength']);
        }

        // Set steps if needed
        if (this.setSteps || imageData.setSteps) {
            await this.adapter.setInputValue('TXT2IMG_STEPS', parameters['steps']);
        }

        await this.adapter.sleep(500);

        // Click generate button
        const generateButton = this.adapter.getElement('TXT2IMG_GENERATE');
        if (generateButton && this.adapter.isElementVisible(generateButton)) {
            generateButton.click();
        }
    }

    /**
     * Override reportProgress to include sub-progress from current generation
     */
    reportProgress() {
        if (this.totalItems === 0) return;

        const chunk = 1 / this.totalItems;
        let progress = (this.totalItems - this.queue.length - 1) * chunk * 100;
        
        // Add current generation progress
        const currentProgress = this.adapter.getGenerationProgress();
        if (currentProgress !== null && !isNaN(currentProgress) && currentProgress < 100) {
            progress += currentProgress * chunk;
        }

        this.messageBus.publish('GENERATION_PROGRESS', { progress });
    }

    /**
     * Start monitoring progress with sub-progress
     */
    async startProgressMonitoring() {
        this.progressMonitoring = true;

        const monitorProgress = async () => {
            while (this.progressMonitoring && this.isActive) {
                await this.adapter.sleep(1000);
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
        this.revertVaryingParams();

        // Toggle hires fix back if needed
        if (!this.setSteps) {
            this.adapter.toggleHiresFix();
        }

        const tempGenId = this.generationId;
        this.generationId = null;
        this.seedsBeforeProcessing = null;
        this.stepsBeforeProcessing = null;
        this.denoisingBeforeProcessing = null;
        this.setDenoising = false;
        this.setSteps = false;

        this.messageBus.publish('GENERATION_FINISHED', {});

        await this.adapter.sleep(1000);
        await this.saveControlnetImages(tempGenId);
    }

    /**
     * Restore backed up parameters
     */
    revertVaryingParams() {
        if (this.seedsBeforeProcessing) {
            this.adapter.setInputValue('TXT2IMG_SEED', this.seedsBeforeProcessing[0]);
            this.adapter.setInputValue('TXT2IMG_SUBSEED', this.seedsBeforeProcessing[1]);
        }

        if (this.stepsBeforeProcessing) {
            this.adapter.setInputValue('TXT2IMG_STEPS', this.stepsBeforeProcessing);
        }

        if (this.denoisingBeforeProcessing) {
            this.adapter.setInputValue('TXT2IMG_DENOISING', this.denoisingBeforeProcessing);
        }
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

    /**
     * Set config preset
     */
    async setConfigPreset(preset) {
        const presetDropdown = this.adapter.getElement('CONFIG_PRESET_TXT2IMG_DROPDOWN');

        if (presetDropdown) {
            if (presetDropdown.value === preset) {
                await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', 'None');
                await this.adapter.sleep(333);
            }

            await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', preset);
        }
    }

    /**
     * Save controlnet images for this generation
     */
    async saveControlnetImages(generationId) {
        let controlNetThumbs = this.adapter.getAllElements('TXT2IMG_GALLERY');
        controlNetThumbs = Array.from(controlNetThumbs);

        if (controlNetThumbs.length) {
            let controlNetImages = new Set(controlNetThumbs.map(t => t.src));
            controlNetImages = Array.from(controlNetImages);

            const body = {
                generation_id: generationId,
                images: []
            };

            for (const image of controlNetImages) {
                if (image.includes("file=")) {
                    let imagePath = image.split("file=").at(-1);
                    imagePath = imagePath.replace(/\?.*$/, "");
                    body.images.push(imagePath);
                }
            }

            if (body.images.length > 0) {
                await fetch("/image-bench/save_controlnet_images", {
                    method: "post",
                    body: JSON.stringify(body)
                });
            }
        }
    }
}
