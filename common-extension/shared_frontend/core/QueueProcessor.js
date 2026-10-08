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
        console.log('[QueueProcessor] Starting process with options:', options);
        this.isActive = true;

        console.log('[QueueProcessor] Calling initialize()');
        this.initialize(options);
        console.log('[QueueProcessor] Queue initialized with', this.queue.length, 'items');

        console.log('[QueueProcessor] Calling prepare()');
        await this.prepare(options);
        console.log('[QueueProcessor] Prepare complete');

        if (this.queue.length > 0) {
            console.log('[QueueProcessor] Queue has items, calling processNext()');
            await this.processNext();
        } else {
            console.log('[QueueProcessor] Queue is empty, calling finish()');
            await this.finish();
        }
    }

    /**
     * Process the next item in queue
     * @returns {Promise<void>}
     */
    async processNext() {
        console.log('[QueueProcessor] processNext() called. Active:', this.isActive, 'Queue length:', this.queue.length);

        if (!this.isActive) {
            console.log('[QueueProcessor] Not active, skipping processNext()');
            return;
        }

        const item = this.queue.shift();

        if (item) {
            console.log('[QueueProcessor] Processing item:', item, 'Remaining queue:', this.queue.length);
            await this.processItem(item);
            console.log('[QueueProcessor] processItem() complete. Reporting progress...');
            this.reportProgress();
            console.log('[QueueProcessor] Progress reported. Waiting for next trigger...');
        } else {
            console.log('[QueueProcessor] No more items in queue, calling finish()');
            await this.finish();
        }
    }

    /**
     * Click generate, or stop the strategy if the UI is not ready to generate,
     * so it does not wait forever for an image that never comes
     * @returns {Promise<boolean>} Whether generation was started
     */
    async clickGenerate() {
        if (await this.uiOperations.clickGenerate())
            return true;

        if (this.isActive) {
            this.messageBus.publish('STRATEGY_FINISH_REQUEST');
            this.messageBus.publish('GENERATION_FINISHED', {});
        }

        return false;
    }

    /**
     * Report progress to message bus
     */
    reportProgress() {
        if (this.totalItems === 0) {
            console.log('[QueueProcessor] reportProgress: totalItems is 0, skipping');
            return;
        }

        const completed = this.totalItems - this.queue.length;
        const progress = (completed / this.totalItems) * 100;
        console.log('[QueueProcessor] Progress:', completed, '/', this.totalItems, '=', progress.toFixed(1) + '%');
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
