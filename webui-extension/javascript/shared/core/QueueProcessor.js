/**
 * QueueProcessor - Base class for queue-based processing strategies
 * Uses Template Method pattern to define the workflow
 * Subclasses implement specific processing logic
 */

export class QueueProcessor {
    /**
     * @param {Object} adapter - DOM adapter instance
     * @param {Object} messageBus - Message bus for communication
     */
    constructor(adapter, messageBus) {
        this.adapter = adapter;
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
}
