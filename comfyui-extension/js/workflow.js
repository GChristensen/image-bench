import {getSystemPaths} from "./paths.js";

/**
 * Extract image information from execution output
 */
export async function extractImageInfo(nodeId, output, promptId) {
    const images = [];

    if (output && output.images) {
        // The output already contains all image information we need
        for (const imageData of output.images) {
            try {
                console.log(imageData)
                // Construct full image path
                const imageUrl = `/view?filename=${imageData.filename}&type=${imageData.type || 'output'}&subfolder=${imageData.subfolder || ''}`;
                const imagePath = getSystemPaths().output_dir + "/" + imageData.filename;

                images.push({
                    imageUrl,
                    imagePath,
                    filename: imageData.filename,
                    subfolder: imageData.subfolder || '',
                    type: imageData.type || 'output'
                });
            } catch (e) {
                console.error('[Image Bench] Failed to process image:', imageData, e);
            }
        }
    }

    return images;
}

/**
 * Parse node marker from node title
 * @param {string} title - Node title
 * @returns {Object|null} - {type, index} or null
 */
function parseNodeMarker(title) {
    if (!title) return null;
    const match = title.match(/\bib:([a-z]+)(:(\d+)\b)?/i);
    if (match) {
        return {
            type: match[1],
            index: match[3] ? parseInt(match[3]) : 0
        };
    }
    return null;
}

/**
 * Extract generation parameters from the workflow
 * @param {string} promptId - The ComfyUI prompt ID
 * @param {number} [capturedSeed] - Optional seed captured before execution (fixes race condition)
 */
export function extractParameters(promptId, capturedSeed) {
    // Get the current workflow to extract parameters
    const workflow = app.graph.serialize();
    const params = {
        prompt_id: promptId
    };

    // Try to find common nodes and extract their parameters
    try {
        const nodes = workflow.nodes || [];

        // Find KSampler node
        const sampler = nodes.find(n => n.type === "KSampler");
        if (sampler && sampler.widgets_values) {
            // Use captured seed if provided, otherwise read from workflow
            const workflowSeed = sampler.widgets_values[0];

            if (capturedSeed !== undefined && capturedSeed !== null) {
                params.seed = capturedSeed;

                // Validation logging: check if race condition occurred
                if (workflowSeed !== capturedSeed) {
                    console.log(`[Image Bench] Seed race condition detected and fixed!`);
                    console.log(`  - Captured seed (correct): ${capturedSeed}`);
                    console.log(`  - Workflow seed (would be wrong): ${workflowSeed}`);
                }
            } else {
                params.seed = workflowSeed;
                console.warn('[Image Bench] No captured seed provided - using workflow seed (may be incorrect if randomized)');
            }

            params.steps = sampler.widgets_values[2];
            params.cfg = sampler.widgets_values[3];
            params.sampler = sampler.widgets_values[4];
            params.scheduler = sampler.widgets_values[5];
            params.denoise = sampler.widgets_values[6];
        }

        // Find CheckpointLoaderSimple node
        const checkpoint = nodes.find(n => n.type === "CheckpointLoaderSimple");
        if (checkpoint && checkpoint.widgets_values) {
            params.model = checkpoint.widgets_values[0];
        }

        // Find marked prompt nodes using marker-based discovery
        const positivePromptNode = nodes.find(n => {
            const marker = parseNodeMarker(n.title);
            return marker && marker.type === 'pp';
        });

        const negativePromptNode = nodes.find(n => {
            const marker = parseNodeMarker(n.title);
            return marker && marker.type === 'np';
        });

        if (positivePromptNode && positivePromptNode.widgets_values) {
            params.prompt = positivePromptNode.widgets_values[0] || '';
        }

        if (negativePromptNode && negativePromptNode.widgets_values) {
            params["negative prompt"] = negativePromptNode.widgets_values[0] || '';
        }
    } catch (e) {
        console.error('[Image Bench] Failed to extract parameters:', e);
    }

    return params;
}