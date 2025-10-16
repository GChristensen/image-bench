/**
 * BatchGenerationStrategy
 * Strategy for batch generation with optional variations
 */

import { QueueProcessor } from '../core/QueueProcessor.js';

export class BatchGenerationStrategy extends QueueProcessor {
    constructor(adapter, messageBus) {
        super(adapter, messageBus);
        this.isImg2Img = false;
        this.isVariations = false;
        this.config = null;
    }

    /**
     * Initialize batch generation
     * @param {Object} options - { img2img: boolean, strength: number (for variations), preset: string }
     */
    initialize(options) {
        this.isImg2Img = options.img2img || false;
        this.isVariations = options.strength !== undefined;
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
        
        const isImg2ImgTab = this.adapter.isImg2ImgTab();
        
        // Set seed
        if (this.isVariations) {
            await this.adapter.setCheckboxValue('TXT2IMG_SUBSEED_SHOW', true);
            await this.adapter.setInputValue('TXT2IMG_SUBSEED', -1);
            await this.adapter.setInputValue('TXT2IMG_SUBSEED_STRENGTH', options.strength);
        } else {
            await this.adapter.setInputValue('TXT2IMG_SEED', -1);
        }
        
        // Set batch count or apply preset
        if (options.preset && !isImg2ImgTab) {
            // If preset is specified, use it (this will set batch count via preset)
            const presetDropdown = this.adapter.getElement('CONFIG_PRESET_TXT2IMG_DROPDOWN');
            if (presetDropdown) {
                if (presetDropdown.value === options.preset) {
                    await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', 'None');
                    await this.adapter.sleep(333);
                }
                await this.adapter.setDropdownValue('CONFIG_PRESET_TXT2IMG_DROPDOWN', options.preset);
            }
        } else {
            // Set batch count directly
            const defaultBatches = this.config.defaultBatches || 100;
            if (isImg2ImgTab) {
                await this.adapter.setInputValue('IMG2IMG_BATCH_COUNT', defaultBatches);
            } else {
                await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', defaultBatches);
            }
        }
        
        // Disable hires fix for txt2img
        if (!isImg2ImgTab) {
            this.adapter.toggleHiresFix(false, true);
        }
    }

    /**
     * Process the batch generation (click generate button)
     */
    async processItem(item) {
        await this.adapter.sleep(500);
        
        const isImg2ImgTab = this.adapter.isImg2ImgTab();
        const buttonKey = isImg2ImgTab ? 'IMG2IMG_GENERATE' : 'TXT2IMG_GENERATE';
        const generateButton = this.adapter.getElement(buttonKey);
        
        if (generateButton && this.adapter.isElementVisible(generateButton)) {
            generateButton.click();
        }
    }

    /**
     * Finish batch generation and cleanup
     */
    async finish() {
        this.isActive = false;
        
        const isImg2ImgTab = this.adapter.isImg2ImgTab();
        
        // Reset batch count
        if (isImg2ImgTab) {
            await this.adapter.setInputValue('IMG2IMG_BATCH_COUNT', 1);
        } else {
            await this.adapter.setInputValue('TXT2IMG_BATCH_COUNT', 1);
        }
        
        // Reset variations if used
        if (this.isVariations) {
            this.isVariations = false;
            await this.adapter.setInputValue('TXT2IMG_SUBSEED_STRENGTH', 0);
            await this.adapter.setCheckboxValue('TXT2IMG_SUBSEED_SHOW', false);
        }
        
        const tempGenId = this.generationId;
        this.generationId = null;
        this.isImg2Img = false;
        
        await this.adapter.sleep(1000);
        
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
