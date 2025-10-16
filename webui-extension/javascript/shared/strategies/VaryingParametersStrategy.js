/**
 * VaryingParametersStrategy
 * Strategy for generating images with varying parameter values (steps, denoising, etc.)
 * This strategy creates a queue and delegates to ImageProcessingStrategy
 */

import { ImageProcessingStrategy } from './ImageProcessingStrategy.js';

export class VaryingParametersStrategy extends ImageProcessingStrategy {
    /**
     * Create queue from parameter variations
     * @param {Object} options - { image: object, steps: string, denoising: string }
     */
    initialize(options) {
        const images = [];
        
        // Varying steps
        if (options.steps) {
            const stepValues = options.steps.split(',').map(s => s.trim());
            
            for (const stepValue of stepValues) {
                const nextImage = { ...options.image };
                nextImage.parameters = { ...options.image.parameters };
                nextImage.parameters['steps'] = parseInt(stepValue);
                images.push(nextImage);
            }
            
            this.setSteps = true;
        }
        
        // Varying denoising
        if (options.denoising) {
            const denoisingLevels = options.denoising.split(',').map(s => s.trim());
            
            for (const level of denoisingLevels) {
                const nextImage = { ...options.image };
                nextImage.parameters = { ...options.image.parameters };
                nextImage.parameters['denoising strength'] = parseFloat(level);
                images.push(nextImage);
            }
            
            this.setDenoising = true;
        }
        
        // Initialize with created image queue
        this.queue = images;
        this.totalItems = images.length;
        this.generationId = this.createGenerationId();
    }
}
