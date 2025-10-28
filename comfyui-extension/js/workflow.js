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
 * Extract generation parameters from the workflow
 */
export function extractParameters(promptId) {
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
            params.seed = sampler.widgets_values[0];
            params.steps = sampler.widgets_values[2];
            params.cfg = sampler.widgets_values[3];
            params.sampler_name = sampler.widgets_values[4];
            params.scheduler = sampler.widgets_values[5];
            params.denoise = sampler.widgets_values[6];
        }

        // Find CheckpointLoaderSimple node
        const checkpoint = nodes.find(n => n.type === "CheckpointLoaderSimple");
        if (checkpoint && checkpoint.widgets_values) {
            params.model = checkpoint.widgets_values[0];
        }

        // Find CLIPTextEncode nodes for prompts
        const promptNodes = nodes.filter(n => n.type === "CLIPTextEncode");
        if (promptNodes.length > 0) {
            params.prompt = promptNodes[0].widgets_values?.[0] || '';
        }
        if (promptNodes.length > 1) {
            params.negative_prompt = promptNodes[1].widgets_values?.[0] || '';
        }
    } catch (e) {
        console.error('[Image Bench] Failed to extract parameters:', e);
    }

    return params;
}