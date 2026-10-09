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
 * Marker roles: the marker type that tags a node and the node_config.json section describing it.
 * A `marker` set in node_config.json overrides the default type.
 * `requireWidget` - a subgraph node only counts if the role's configured widget is promoted to it.
 */
export const MARKER_ROLES = {
    checkpoint: {marker: 'cp', configKey: 'checkpoint', requireWidget: true},
    sampler: {marker: 'smp', configKey: 'sampler', requireWidget: false},
    positivePrompt: {marker: 'pp', configKey: 'positive_prompt', requireWidget: true},
    negativePrompt: {marker: 'np', configKey: 'negative_prompt', requireWidget: true}
};

/**
 * Parse all node markers from a node title
 * Markers may appear anywhere in the title, and one title may carry several (e.g. "Text to Image ib:pp ib:smp ib:cp")
 * @param {string} title - Node title
 * @returns {Array<{prefix: string, type: string, index: number|null}>}
 */
export function parseNodeMarkers(title) {
    if (!title || typeof title !== 'string') {
        return [];
    }

    // Match "ib:<type>" or "ib:<type>:<index>" anywhere in the string
    const markerRegex = /\bib:([a-z]+)(?::(\d+))?\b/gi;

    return [...title.matchAll(markerRegex)].map(match => ({
        prefix: 'ib',
        type: match[1].toLowerCase(),
        index: match[2] ? parseInt(match[2], 10) : null
    }));
}

/**
 * Parse the first node marker from a node title
 * @param {string} title - Node title (e.g., "My Checkpoint ib:cp:0" or "ib:cp:0 - Main")
 * @returns {Object|null} - {prefix, type, index} or null
 */
export function parseNodeMarker(title) {
    return parseNodeMarkers(title)[0] ?? null;
}

/**
 * Check whether a node title carries a marker of the given type
 * @param {string} title - Node title
 * @param {string} typeMarker - Marker type (e.g., "cp")
 * @returns {boolean}
 */
export function hasNodeMarker(title, typeMarker) {
    return parseNodeMarkers(title).some(marker => marker.type === typeMarker);
}

/**
 * Get the marker type of a role, honoring an override in node_config.json
 * @param {Object} role - Entry of MARKER_ROLES
 * @param {Object} nodeConfig - Node configuration object
 * @returns {string}
 */
export function getRoleMarker(role, nodeConfig) {
    return nodeConfig?.[role.configKey]?.marker || role.marker;
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
        const positivePromptNode = nodes.find(n => hasNodeMarker(n.title, 'pp'));

        const negativePromptNode = nodes.find(n => hasNodeMarker(n.title, 'np'));

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

// ==================== MARKER TARGETS ====================

/**
 * A marker target describes where a role's values live.
 * `source` is the node of the role's type (e.g. a KSampler). `host` is the node whose widgets the user edits:
 * the source itself for a plain node, or the subgraph node a marker was put on, in which case the source is
 * the inner node its promoted widgets come from.
 * `executionId` is the source's id in the queued prompt and in /history ("<subgraph node id>:<inner id>" for subgraphs).
 * @typedef {{host: Object, source: Object, executionId: string}} MarkerTarget
 */

function isSubgraphNode(node) {
    return !!node?.isSubgraphNode?.();
}

/**
 * Create a target for a plain (non-subgraph) node
 * @param {Object|null} node
 * @returns {MarkerTarget|null}
 */
export function createNodeTarget(node) {
    return node ? {host: node, source: node, executionId: String(node.id)} : null;
}

/**
 * Check whether two targets point to the same source node
 */
export function isSameTarget(a, b) {
    return !!a && !!b && a.host === b.host && a.source === b.source;
}

/**
 * Resolve the inner node and widget a subgraph node input is promoted from, following nested subgraphs
 * @param {Object} hostNode - Subgraph node
 * @param {Object} input - Widget input of the subgraph node
 * @returns {{node: Object, widget: Object, path: Array}|null} path - node ids from inside the host down to the source
 */
function resolvePromotedSource(hostNode, input) {
    const subgraph = hostNode.subgraph;

    for (const linkId of input?._subgraphSlot?.linkIds ?? []) {
        const link = subgraph?.getLink?.(linkId);
        const inner = link && subgraph.getNodeById(link.target_id);
        const innerInput = inner?.inputs?.[link.target_slot];
        if (!innerInput) {
            continue;
        }

        if (isSubgraphNode(inner)) {
            const nested = resolvePromotedSource(inner, innerInput);
            if (nested) {
                return {...nested, path: [inner.id, ...nested.path]};
            }
            continue;
        }

        const widget = inner.getWidgetFromSlot?.(innerInput) ?? getNodeWidget(inner, innerInput.widget?.name);
        if (widget) {
            return {node: inner, widget, path: [inner.id]};
        }
    }

    return null;
}

/**
 * List the widgets promoted to a subgraph node together with the inner widgets they drive
 * Inputs connected to an outer link are skipped: their value does not come from the widget
 * @param {Object} hostNode - Subgraph node
 * @returns {Array<{hostWidget: Object, sourceNode: Object, sourceWidget: Object, path: Array}>}
 */
function getPromotedWidgets(hostNode) {
    const promoted = [];

    for (const input of hostNode.inputs ?? []) {
        // Promoted inputs carry a widgetId (also those migrated from legacy properties.proxyWidgets)
        if (!(input.widget || input.widgetId) || input.link != null) {
            continue;
        }

        const hostWidget = hostNode.getWidgetFromSlot?.(input) ?? getNodeWidget(hostNode, input.widget?.name ?? input.name);
        const source = resolvePromotedSource(hostNode, input);
        if (hostWidget && source) {
            promoted.push({hostWidget, sourceNode: source.node, sourceWidget: source.widget, path: source.path});
        }
    }

    return promoted;
}

/**
 * Find all targets of a marker role, in graph order
 * A plain node is a target when its title carries the role's marker.
 * A marked subgraph node yields one target per inner node of an accepted type that has widgets promoted to it
 * (with role.requireWidget, the role's configured widget must be among them).
 * @param {Object} app - ComfyUI app instance
 * @param {Object} role - Entry of MARKER_ROLES
 * @param {Object} nodeConfig - Node configuration object
 * @returns {Array<MarkerTarget>}
 */
export function getMarkerTargets(app, role, nodeConfig) {
    const typeMarker = getRoleMarker(role, nodeConfig);
    const roleConfig = nodeConfig?.[role.configKey];
    const targets = [];

    for (const node of app?.graph?.nodes ?? []) {
        if (!hasNodeMarker(node.title, typeMarker)) {
            continue;
        }

        if (!isSubgraphNode(node)) {
            targets.push(createNodeTarget(node));
            continue;
        }

        const seen = new Set();
        for (const {sourceNode, sourceWidget, path} of getPromotedWidgets(node)) {
            if (seen.has(sourceNode) || (roleConfig && !roleConfig.nodeTypes?.includes(sourceNode.type))) {
                continue;
            }
            if (role.requireWidget && roleConfig && roleConfig.widgetNames?.[sourceNode.type] !== sourceWidget.name) {
                continue;
            }

            seen.add(sourceNode);
            targets.push({host: node, source: sourceNode, executionId: [node.id, ...path].join(':')});
        }

        if (!seen.size) {
            console.warn(`[Image Bench] Subgraph node "${node.title}" is marked ib:${typeMarker}, but no matching widget is promoted to it`);
        }
    }

    return targets;
}

/**
 * Get the role's configured widget name for a target's source node type
 * @param {Object} role - Entry of MARKER_ROLES
 * @param {Object} nodeConfig - Node configuration object
 * @param {MarkerTarget} target
 * @returns {string|null}
 */
export function getRoleWidgetName(role, nodeConfig, target) {
    return nodeConfig?.[role.configKey]?.widgetNames?.[target.source.type] ?? null;
}

/**
 * Get the widget that holds a source widget's value for a target:
 * the node's own widget, the subgraph node widget promoted from it, or, if it is not promoted,
 * the inner widget itself (unless its input is linked)
 * @param {MarkerTarget} target
 * @param {string} widgetName - Widget name on the source node
 * @returns {Object|null}
 */
export function getTargetWidget(target, widgetName) {
    if (!target) {
        return null;
    }

    if (target.host === target.source) {
        return getNodeWidget(target.source, widgetName);
    }

    const promoted = getPromotedWidgets(target.host)
        .find(p => p.sourceNode === target.source && p.sourceWidget.name === widgetName);
    if (promoted) {
        return promoted.hostWidget;
    }

    const widget = getNodeWidget(target.source, widgetName);
    const slot = widget && target.source.getSlotFromWidget?.(widget);
    return slot?.link != null ? null : widget;
}

/**
 * Set a widget value on a target
 * @param {MarkerTarget} target
 * @param {string} widgetName - Widget name on the source node
 * @param {any} value
 * @returns {boolean} Whether the value was set
 */
export function setTargetWidgetValue(target, widgetName, value) {
    const widget = getTargetWidget(target, widgetName);

    if (!widget) {
        console.warn(`Widget ${widgetName} not found on node ${target?.source?.type}`);
        return false;
    }

    setWidgetValue(widget, value);
    return true;
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

    setWidgetValue(widget, value);
    return true;
}

/**
 * Set a widget value and trigger its callback
 * @param {Object} widget - The widget
 * @param {any} value - Value to set
 */
function setWidgetValue(widget, value) {
    widget.value = value;

    // Trigger widget callback if it exists
    if (widget.callback) {
        widget.callback(value);
    }
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

// ==================== HISTORY-BASED PARAMETER EXTRACTION ====================
// These functions extract parameters from ComfyUI's history API (read-only, after generation)
// For setting values in live workflows, use the functions above

/**
 * Find a node in history prompt by execution id, marker or node types
 * @param {Object} historyPrompt - History prompt object from api.getHistory()[prompt_id].prompt
 * @param {string} [markerType] - Optional marker type to search for (e.g., "smp", "pp", "np", "cp")
 * @param {Array<string>} [nodeTypes] - Optional array of node types to search for (fallback)
 * @param {string} [executionId] - Optional execution id of the marker target resolved in the live graph
 *                                 (the only way to find nodes marked through a subgraph node)
 * @returns {Object|null} Node data with {nodeId, class_type, inputs} or null
 */
function findNodeInHistory(historyPrompt, markerType, nodeTypes, executionId) {
    if (!historyPrompt) {
        return null;
    }

    if (executionId && historyPrompt[executionId]) {
        console.log(`[Image Bench] Found node by marker target '${markerType}':`, executionId);
        return { nodeId: executionId, ...historyPrompt[executionId] };
    }

    // Try marker-based discovery first (if marker provided)
    if (markerType) {
        for (const [nodeId, nodeData] of Object.entries(historyPrompt)) {
            const title = nodeData._meta?.title;
            if (title) {
                if (hasNodeMarker(title, markerType)) {
                    console.log(`[Image Bench] Found node by marker '${markerType}':`, nodeId, title);
                    return { nodeId, ...nodeData };
                }
            }
        }
    }

    // Fallback to type-based discovery (if types provided)
    if (nodeTypes && Array.isArray(nodeTypes)) {
        for (const [nodeId, nodeData] of Object.entries(historyPrompt)) {
            if (nodeTypes.includes(nodeData.class_type)) {
                console.log(`[Image Bench] Found node by type '${nodeData.class_type}':`, nodeId);
                return { nodeId, ...nodeData };
            }
        }
    }

    return null;
}

/**
 * Extract sampler parameters from history prompt
 * Uses marker-based discovery (ib:smp:*) with type-based fallback
 * @param {Object} historyPrompt - History prompt object
 * @param {Object} nodeConfig - Node configuration
 * @param {Object} [executionIds] - Execution ids of the live marker targets
 * @returns {Object} Sampler parameters (seed, steps, cfg, etc.)
 */
function extractSamplerFromHistory(historyPrompt, nodeConfig, executionIds) {
    const params = {};

    // Get sampler marker and types from config
    const samplerMarker = nodeConfig?.sampler?.marker || 'smp';
    const samplerTypes = nodeConfig?.sampler?.nodeTypes || ['KSampler'];

    // Try marker-based first, fall back to type-based
    const samplerNode = findNodeInHistory(historyPrompt, samplerMarker, samplerTypes, executionIds?.sampler);

    if (samplerNode && samplerNode.inputs) {
        const inputs = samplerNode.inputs;

        // Extract standard sampler parameters
        if (inputs.seed !== undefined) params.seed = inputs.seed;
        if (inputs.steps !== undefined) params.steps = inputs.steps;
        if (inputs.cfg !== undefined) params.cfg = inputs.cfg;
        if (inputs.sampler_name !== undefined) params.sampler = inputs.sampler_name;
        if (inputs.scheduler !== undefined) params.scheduler = inputs.scheduler;
        if (inputs.denoise !== undefined) params.denoise = inputs.denoise;

        console.log('[Image Bench] Extracted sampler params from history:', params);
    } else {
        console.warn('[Image Bench] No sampler node found in history');
    }

    return params;
}

/**
 * Extract checkpoint/model from history prompt
 * Uses marker-based discovery (ib:cp:*) with type-based fallback
 * @param {Object} historyPrompt - History prompt object
 * @param {Object} nodeConfig - Node configuration
 * @param {Object} [executionIds] - Execution ids of the live marker targets
 * @returns {Object} Checkpoint parameters {model}
 */
function extractCheckpointFromHistory(historyPrompt, nodeConfig, executionIds) {
    const params = {};

    // Get checkpoint marker and types from config
    const checkpointMarker = nodeConfig?.checkpoint?.marker || 'cp';
    const checkpointTypes = nodeConfig?.checkpoint?.nodeTypes || ['CheckpointLoaderSimple'];

    // Try marker-based first, fall back to type-based
    const checkpointNode = findNodeInHistory(historyPrompt, checkpointMarker, checkpointTypes, executionIds?.checkpoint);

    if (checkpointNode && checkpointNode.inputs) {
        // Get widget name for this node type
        const widgetNames = nodeConfig?.checkpoint?.widgetNames || {};
        const widgetName = widgetNames[checkpointNode.class_type] || 'ckpt_name';

        if (checkpointNode.inputs[widgetName] !== undefined) {
            params.model = checkpointNode.inputs[widgetName];
            console.log('[Image Bench] Extracted checkpoint from history:', params.model);
        }
    } else {
        console.warn('[Image Bench] No checkpoint node found in history');
    }

    return params;
}

/**
 * Extract prompts from history prompt
 * Uses marker-based discovery (ib:pp:* and ib:np:*) with type-based fallback
 * @param {Object} historyPrompt - History prompt object
 * @param {Object} nodeConfig - Node configuration
 * @param {Object} [executionIds] - Execution ids of the live marker targets
 * @returns {Object} Prompt parameters {prompt, "negative prompt"}
 */
function extractPromptsFromHistory(historyPrompt, nodeConfig, executionIds) {
    const params = {};
    console.log(historyPrompt)
    // Get prompt markers and types from config
    const positiveMarker = nodeConfig?.positive_prompt?.marker || 'pp';
    const negativeMarker = nodeConfig?.negative_prompt?.marker || 'np';
    const positiveTypes = nodeConfig?.positive_prompt?.nodeTypes || ['CLIPTextEncode'];
    const negativeTypes = nodeConfig?.negative_prompt?.nodeTypes || ['CLIPTextEncode'];

    // Extract positive prompt (marker-based first, type-based fallback)
    const positiveNode = findNodeInHistory(historyPrompt, positiveMarker, positiveTypes, executionIds?.positivePrompt);
    if (positiveNode && positiveNode.inputs) {
        // Get widget name for this node type from config
        const positiveWidgetNames = nodeConfig?.positive_prompt?.widgetNames || {};
        const positiveWidgetName = positiveWidgetNames[positiveNode.class_type] || 'text';

        console.log([positiveNode, positiveNode.class_type, positiveWidgetNames, positiveWidgetName]);

        if (positiveNode.inputs[positiveWidgetName] !== undefined) {
            params.prompt = positiveNode.inputs[positiveWidgetName];
            console.log('[Image Bench] Extracted positive prompt from history');
        }
    }

    // Extract negative prompt (marker-based first, type-based fallback)
    const negativeNode = findNodeInHistory(historyPrompt, negativeMarker, negativeTypes, executionIds?.negativePrompt);
    if (negativeNode && negativeNode.inputs) {
        // Get widget name for this node type from config
        const negativeWidgetNames = nodeConfig?.negative_prompt?.widgetNames || {};
        const negativeWidgetName = negativeWidgetNames[negativeNode.class_type] || 'text';

        if (negativeNode.inputs[negativeWidgetName] !== undefined) {
            params["negative prompt"] = negativeNode.inputs[negativeWidgetName];
            console.log('[Image Bench] Extracted negative prompt from history');
        }
    }

    return params;
}

/**
 * Extract generation parameters from ComfyUI history API
 * This is the SOURCE OF TRUTH for what was actually generated (no race conditions)
 * @param {string} promptId - The ComfyUI prompt ID
 * @param {Object|Array} historyPrompt - History prompt from api.getHistory()[promptId].prompt (may be array)
 * @param {Object} nodeConfig - Node configuration for node type discovery
 * @param {Object} [executionIds] - Execution ids of the live marker targets, keyed by MARKER_ROLES key
 * @returns {Object} Parameters object with all extracted values
 */
export function extractParametersFromHistory(promptId, historyPrompt, nodeConfig, executionIds) {
    console.log('[Image Bench] Extracting parameters from history for prompt:', promptId);

    const params = {
        prompt_id: promptId
    };

    if (!historyPrompt) {
        console.warn('[Image Bench] No history prompt provided, returning minimal params');
        return params;
    }

    // Handle array structure: ComfyUI's prompt can be an array containing the nodes object
    let nodesObject = historyPrompt;
    if (Array.isArray(historyPrompt)) {
        console.log('[Image Bench] History prompt is an array, finding nodes object...');
        // Find the nodes object (has node IDs as string keys like "15", "118", etc.)
        nodesObject = historyPrompt.find(item =>
            typeof item === 'object' &&
            item !== null &&
            !Array.isArray(item) &&
            Object.keys(item).length > 0
        );

        if (!nodesObject) {
            console.warn('[Image Bench] No nodes object found in history prompt array');
            return params;
        }
        console.log('[Image Bench] Found nodes object with', Object.keys(nodesObject).length, 'nodes');
    }

    try {
        // Extract sampler parameters (seed, steps, cfg, etc.)
        Object.assign(params, extractSamplerFromHistory(nodesObject, nodeConfig, executionIds));

        // Extract checkpoint/model
        Object.assign(params, extractCheckpointFromHistory(nodesObject, nodeConfig, executionIds));

        // Extract prompts (positive and negative)
        Object.assign(params, extractPromptsFromHistory(nodesObject, nodeConfig, executionIds));

        console.log('[Image Bench] Successfully extracted parameters from history:', params);
    } catch (error) {
        console.error('[Image Bench] Error extracting parameters from history:', error);
    }

    return params;
}