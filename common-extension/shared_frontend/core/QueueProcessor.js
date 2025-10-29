/**
 * QueueProcessor - Base class for queue-based processing strategies
 * Uses Template Method pattern to define the workflow
 * Subclasses implement specific processing logic
 */

export class QueueProcessor {
    /**
     * @param {Object} uiOperations - UI operations facade instance
     * @param {Object} messageBus - Message bus for communication
     */
    constructor(uiOperations, messageBus) {
        this.uiOperations = uiOperations;
        this.messageBus = messageBus;
        this.queue = [];
        this.generationId = null;
        this.totalItems = 0;
        this.isActive = false;
    }

    /**
     * Initialize the processor with options
     * Must be implemented by subclasses
     * @param {Object} options - Processing options
     */
    initialize(options) {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Prepare for processing (setup state, UI, etc.)
     * Must be implemented by subclasses
     * @param {Object} options - Processing options
     * @returns {Promise<void>}
     */
    async prepare(options) {
        throw new Error('prepare() must be implemented by subclass');
    }

    /**
     * Process a single item from the queue
     * Must be implemented by subclasses
     * @param {*} item - Item to process
     * @returns {Promise<void>}
     */
    async processItem(item) {
        throw new Error('processItem() must be implemented by subclass');
    }

    /**
     * Finish processing and cleanup
     * Must be implemented by subclasses
     * @returns {Promise<void>}
     */
    async finish() {
        throw new Error('finish() must be implemented by subclass');
    }

    /**
     * Start processing the queue
     * Template method defining the workflow
     * @param {Object} options - Processing options
     * @returns {Promise<void>}
     */
    async process(options) {
        this.isActive = true;
        this.initialize(options);
        await this.prepare(options);
        
        if (this.queue.length > 0) {
            await this.processNext();
        } else {
            await this.finish();
        }
    }

    /**
     * Process the next item in queue
     * @returns {Promise<void>}
     */
    async processNext() {
        if (!this.isActive) {
            return;
        }

        const item = this.queue.shift();
        
        if (item) {
            await this.processItem(item);
            this.reportProgress();
        } else {
            await this.finish();
        }
    }

    /**
     * Report progress to message bus
     */
    reportProgress() {
        if (this.totalItems === 0) return;
        
        const progress = ((this.totalItems - this.queue.length) / this.totalItems) * 100;
        this.messageBus.publish('GENERATION_PROGRESS', { progress });
    }

    /**
     * Stop processing
     */
    stop() {
        this.isActive = false;
        this.queue = [];
    }

    /**
     * Check if processor is active
     * @returns {boolean}
     */
    isProcessing() {
        return this.isActive;
    }

    /**
     * Get current queue length
     * @returns {number}
     */
    getQueueLength() {
        return this.queue.length;
    }

    /**
     * Generate a unique ID for this processing session
     * @returns {string}
     */
    createGenerationId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const dateString = `${year}${month}${day}`;
        const timeString = `${hours}${minutes}${seconds}`;
        return `gen_${dateString}_${timeString}`;
    }

    /**
     * Save controlnet images for this generation
     * @param {string} generationId - The generation ID to associate images with
     * @returns {Promise<void>}
     */
    async saveControlnetImages(generationId) {
        let controlNetThumbs = this.uiOperations.getAllElements('TXT2IMG_GALLERY');
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
