/**
 * Lightweight storage for seed values captured before execution.
 *
 * This module addresses the race condition where ComfyUI randomizes
 * the KSampler seed for the next generation during execution. By
 * capturing the seed before queueing, we can retrieve the correct
 * seed value used for image generation.
 */

class SeedStorage {
    constructor() {
        // Map: prompt_id -> { seed, timestamp }
        this.storage = new Map();

        // Auto-cleanup after 5 minutes to prevent memory leaks
        this.maxAge = 5 * 60 * 1000;

        // Maximum entries before forcing cleanup
        this.maxEntries = 100;
    }

    /**
     * Store a seed value for a prompt_id
     * @param {string} promptId - The ComfyUI prompt ID
     * @param {number} seed - The seed value captured before execution
     */
    store(promptId, seed) {
        if (!promptId) {
            console.warn('[SeedStorage] Cannot store seed: missing prompt_id');
            return;
        }

        this.storage.set(promptId, {
            seed: seed,
            timestamp: Date.now()
        });

        // Trigger cleanup if we exceed max entries
        if (this.storage.size > this.maxEntries) {
            this.cleanup();
        }
    }

    /**
     * Retrieve and remove a seed value for a prompt_id
     * @param {string} promptId - The ComfyUI prompt ID
     * @returns {number|null} The stored seed value, or null if not found
     */
    retrieve(promptId) {
        if (!promptId) {
            console.warn('[SeedStorage] Cannot retrieve seed: missing prompt_id');
            return null;
        }

        const entry = this.storage.get(promptId);

        if (!entry) {
            console.warn(`[SeedStorage] No seed found for prompt_id: ${promptId}`);
            return null;
        }

        // Remove after retrieval to prevent memory leaks
        this.storage.delete(promptId);

        return entry.seed;
    }

    /**
     * Manually clear a specific prompt_id without retrieving
     * @param {string} promptId - The ComfyUI prompt ID
     */
    clear(promptId) {
        this.storage.delete(promptId);
    }

    /**
     * Remove all stored seeds
     */
    clearAll() {
        this.storage.clear();
    }

    /**
     * Remove entries older than maxAge
     */
    cleanup() {
        const now = Date.now();
        const entriesToDelete = [];

        for (const [promptId, entry] of this.storage.entries()) {
            if (now - entry.timestamp > this.maxAge) {
                entriesToDelete.push(promptId);
            }
        }

        entriesToDelete.forEach(promptId => {
            this.storage.delete(promptId);
            console.log(`[SeedStorage] Cleaned up old entry: ${promptId}`);
        });

        if (entriesToDelete.length > 0) {
            console.log(`[SeedStorage] Cleanup removed ${entriesToDelete.length} old entries`);
        }
    }

    /**
     * Get current storage size (for debugging)
     * @returns {number}
     */
    size() {
        return this.storage.size;
    }

    /**
     * Get all stored prompt_ids (for debugging)
     * @returns {string[]}
     */
    getStoredPromptIds() {
        return Array.from(this.storage.keys());
    }
}

// Export singleton instance
export const seedStorage = new SeedStorage();

// Export class for testing
export { SeedStorage };
