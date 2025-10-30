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
 * Searches for marker pattern anywhere in the node name
 * @param {string} title - Node title (e.g., "My Checkpoint ib:cp:0" or "ib:cp:0 - Main")
 * @returns {Object|null} - {prefix, type, index} or null
 */
export function parseNodeMarker(title) {
    if (!title || typeof title !== 'string') {
        return null;
    }

    // Match "ib:<type>:<index>" anywhere in the string
    const markerRegex = /\bib:([a-z]+)(:((\d+))\b)?/i;
    const match = title.match(markerRegex);

    if (!match) {
        return null;
    }

    return {
        prefix: 'ib',
        type: match[1],
        index: match[4] ? parseInt(match[4], 10) : null
    };
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

// ==================== LOW-LEVEL NODE DISCOVERY ====================

/**
 * Find a workflow node by its type
 * @param {Object} app - ComfyUI app instance
 * @param {string} nodeType - Node type (e.g., 'KSampler', 'CheckpointLoaderSimple')
 * @returns {Object|null} The node object or null
 */
export function getNodeByType(app, nodeType) {
    if (!app?.graph?.nodes) {
        return null;
    }

    return app.graph.nodes.find(node => node.type === nodeType);
}

/**
 * Get all nodes of a specific type
 * @param {Object} app - ComfyUI app instance
 * @param {string} nodeType - Node type
 * @returns {Array} Array of matching nodes
 */
export function getNodesByType(app, nodeType) {
    if (!app?.graph?.nodes) {
        return [];
    }

    return app.graph.nodes.filter(node => node.type === nodeType);
}

/**
 * Find a node by its marker (e.g., "cp" finds node with "ib:cp:0" in its name)
 * The marker can appear anywhere in the node's title
 * Examples: "ib:cp:0", "My Checkpoint ib:cp:0", "ib:cp:0 - Main Model"
 * @param {Object} app - ComfyUI app instance
 * @param {string} typeMarker - Type marker (e.g., "cp" for checkpoint)
 * @returns {Object|null} The marked node or null
 */
export function getMarkedNode(app, typeMarker) {
    if (!app?.graph?.nodes) {
        return null;
    }

    // Find node whose title contains the marker pattern
    return app.graph.nodes.find(node => {
        const marker = parseNodeMarker(node.title);
        return marker && marker.type === typeMarker;
    });
}

/**
 * Get widget from a marked node using configuration
 * @param {Object} app - ComfyUI app instance
 * @param {string} typeMarker - Type marker (e.g., "cp")
 * @param {Object} nodeConfig - Node configuration object
 * @param {string} configKey - Config key (e.g., "checkpoint")
 * @returns {Object|null} Object with {node, widget, widgetName} or null
 */
export function getMarkedNodeWidget(app, typeMarker, nodeConfig, configKey) {
    const markedNode = getMarkedNode(app, typeMarker);
    if (!markedNode) {
        return null;
    }

    // If no config, return just the node
    if (!nodeConfig || !nodeConfig[configKey]) {
        return { node: markedNode, widget: null, widgetName: null };
    }

    const config = nodeConfig[configKey];
    const widgetNames = config.widgetNames || {};

    // Find the widget name for this node type
    const widgetName = widgetNames[markedNode.type];
    if (!widgetName) {
        console.warn(`No widget name configured for node type ${markedNode.type}`);
        return { node: markedNode, widget: null, widgetName: null };
    }

    const widget = getNodeWidget(markedNode, widgetName);
    return { node: markedNode, widget, widgetName };
}

// ==================== LOW-LEVEL WIDGET MANIPULATION ====================

/**
 * Get a node's widget by name
 * @param {Object} node - The node object
 * @param {string} widgetName - Name of the widget
 * @returns {Object|null} The widget or null
 */
export function getNodeWidget(node, widgetName) {
    if (!node?.widgets) {
        return null;
    }

    return node.widgets.find(w => w.name === widgetName);
}

/**
 * Set a node's widget value
 * @param {Object} node - The node object
 * @param {string} widgetName - Name of the widget
 * @param {any} value - Value to set
 * @returns {boolean} Whether the value was set
 */
export function setNodeWidgetValue(node, widgetName, value) {
    const widget = getNodeWidget(node, widgetName);

    if (!widget) {
        console.warn(`Widget ${widgetName} not found on node ${node.type}`);
        return false;
    }

    widget.value = value;

    // Trigger widget callback if it exists
    if (widget.callback) {
        widget.callback(value);
    }

    return true;
}

// ==================== LOW-LEVEL WORKFLOW OPERATIONS ====================

/**
 * Get the current workflow as JSON
 * @param {Object} app - ComfyUI app instance
 * @returns {Object} The workflow object
 */
export function getWorkflow(app) {
    return app?.graph?.serialize() || {};
}

/**
 * Load a workflow from JSON
 * @param {Object} app - ComfyUI app instance
 * @param {Object} workflow - The workflow to load
 * @returns {Promise<void>}
 */
export async function loadWorkflow(app, workflow) {
    if (!app) {
        throw new Error('ComfyUI app not available');
    }

    await app.loadGraphData(workflow);
}