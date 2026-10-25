/**
 * Errors of ComfyUI runs as the popup shows them (GENERATION_ERROR, the problems of WEBUI_PARAMS):
 * queueing the workflow and telling why ComfyUI refused it, the error of a failed run, and a check of the workflow
 * for nodes and files that ComfyUI does not have.
 * The error is {kind: 'queue'|'execution', message, nodes: [{id, title, type, errors: [{message, details, input, value}]}]},
 * where id is the execution id ("12", "5:3" inside the subgraph node 5).
 */

import {getWidgetChoices} from './params.js';
import {MODE_ALWAYS} from './graph.js';

const REFUSED_MESSAGE = 'ComfyUI refused the workflow';

// Widget options of the upload widgets, whose lists lag behind the files uploaded by Image Bench
const UPLOAD_OPTIONS = ['image_upload', 'video_upload', 'audio_upload'];

/**
 * The node of an execution id, following the ids into subgraphs
 * @param {Object} app
 * @param {string} executionId
 * @returns {Object|null}
 */
function getExecutionNode(app, executionId) {
    let graph = app.graph;
    let node = null;

    for (const id of String(executionId).split(':')) {
        node = graph?.getNodeById?.(Number(id)) ?? graph?.getNodeById?.(id) ?? null;

        if (!node)
            return null;

        graph = node.subgraph;
    }

    return node;
}

function describeNode(app, id, type) {
    const node = getExecutionNode(app, id);
    return {id: String(id), title: node?.title || type || node?.type || `Node ${id}`, type: type || node?.type || null};
}

/**
 * Why ComfyUI refused the workflow, from the node errors its frontend recorded for the /prompt answer
 * @param {Object} app
 * @returns {Object} The error
 */
export function describeQueueError(app) {
    return describeNodeErrors(app, app.lastNodeErrors);
}

/**
 * @param {Object} app
 * @param {Object|null} nodeErrors - node_errors of a /prompt answer
 * @param {string} [message] - Error message of the answer
 * @returns {Object} The error
 */
export function describeNodeErrors(app, nodeErrors, message = null) {
    const nodes = Object.entries(nodeErrors ?? {}).map(([id, entry]) => ({
        ...describeNode(app, id, entry?.class_type),
        errors: (entry?.errors ?? []).map(error => ({
            message: error.message ?? String(error),
            details: error.details || null,
            input: error.extra_info?.input_name ?? null,
            value: error.extra_info?.received_value ?? null
        }))
    }));

    // Without node errors the usual cause is a node type ComfyUI does not have (missing_node_type)
    if (!nodes.length)
        nodes.push(...checkWorkflow(app)?.missingNodes.map(node => ({...node, errors: [{message: 'Node type not installed'}]})) ?? []);

    return {kind: 'queue', message: message || REFUSED_MESSAGE, nodes};
}

/**
 * The text of a /prompt answer that refused a prompt made by Image Bench itself (its node ids are not those of the
 * graph): one line per node error, "<node type>: <message> (<details>)"
 * @param {string} text - Body of the answer
 * @returns {string}
 */
export function formatPromptRefusal(text) {
    let answer = null;

    try {
        answer = JSON.parse(text);
    } catch (error) {
        return text;
    }

    const lines = Object.values(answer?.node_errors ?? {}).flatMap(entry => (entry?.errors ?? []).map(error =>
        `${entry.class_type}: ${error.message}${error.details ? ` (${error.details})` : ''}`));

    return lines.length ? lines.join('\n') : answer?.error?.message ?? text;
}

/**
 * The error of a failed run (execution_error)
 * @param {Object} app
 * @param {Object} detail - {node_id, node_type, exception_type, exception_message}
 * @returns {Object} The error
 */
export function describeExecutionError(app, detail) {
    const message = detail?.exception_message?.trim() || detail?.exception_type || 'The generation failed';
    const nodes = detail?.node_id != null
        ? [{...describeNode(app, detail.node_id, detail.node_type), errors: [{message}]}]
        : [];

    return {kind: 'execution', message, exceptionType: detail?.exception_type ?? null, nodes};
}

/**
 * Queue the workflow once, as the Queue button does
 * @param {Object} app
 * @returns {Promise<{ok: boolean, error?: Object}>}
 */
export async function queueWorkflow(app) {
    try {
        // While another call is queueing, queuePrompt() returns false but that call queues this prompt too
        const busy = !!app.processingQueue;

        if (await app.queuePrompt(0, 1) !== false || busy)
            return {ok: true};

        return {ok: false, error: describeQueueError(app)};
    } catch (error) {
        console.error('[Image Bench] Unable to queue the workflow:', error);
        return {ok: false, error: {kind: 'queue', message: error?.message || REFUSED_MESSAGE, nodes: []}};
    }
}

// ---------- Workflow check ----------

function isSubgraphNode(node) {
    return !!node?.isSubgraphNode?.();
}

/**
 * Whether ComfyUI runs a node: not bypassed or muted, and an output node or one whose output is used
 */
function isRun(node) {
    return node.mode === MODE_ALWAYS
        && (!!node.constructor?.nodeData?.output_node || (node.outputs ?? []).some(output => output.links?.length));
}

function isLinkedWidget(node, widget) {
    return (node.inputs ?? []).some(input => input.widget?.name === widget.name && input.link != null);
}

function hasUploadWidget(node, widget) {
    return UPLOAD_OPTIONS.some(name => widget.options?.[name])
        || (node.widgets ?? []).some(other => other.name === 'upload');
}

/**
 * Nodes and files of the workflow that ComfyUI does not have: node types that are not installed, and combo values
 * that are not in their list (model files). The lists are those of the page, which ComfyUI refreshes only on
 * request, so a file added since may be reported until then
 * @param {Object} app
 * @returns {{missingNodes: Object[], missingFiles: Object[]}|null} null if there are none
 */
export function checkWorkflow(app) {
    const registered = window.LiteGraph?.registered_node_types;
    const missingNodes = [];
    const missingFiles = [];

    function visit(graph, prefix) {
        for (const node of graph?.nodes ?? []) {
            const id = prefix + node.id;

            if (!isRun(node))
                continue;

            if (isSubgraphNode(node)) {
                visit(node.subgraph, `${id}:`);
                continue;
            }

            if (registered && !registered[node.type]) {
                missingNodes.push({id, title: node.title || node.type, type: node.type});
                continue;
            }

            for (const widget of node.widgets ?? []) {
                const choices = typeof widget.value === 'string' && widget.value && getWidgetChoices(widget);

                if (!choices?.length || choices.includes(widget.value) || isLinkedWidget(node, widget)
                        || hasUploadWidget(node, widget))
                    continue;

                missingFiles.push({id, title: node.title || node.type, type: node.type, input: widget.name,
                                   value: widget.value});
            }
        }
    }

    try {
        visit(app.graph, '');
    } catch (error) {
        console.warn('[Image Bench] Unable to check the workflow:', error);
        return null;
    }

    return missingNodes.length || missingFiles.length ? {missingNodes, missingFiles} : null;
}

/**
 * Select and center a node of an execution id on the canvas (its top-level node for a node inside a subgraph)
 * @param {Object} app
 * @param {string} executionId
 */
export function showNode(app, executionId) {
    const node = app.graph?.getNodeById?.(Number(String(executionId).split(':')[0]));
    const canvas = app.canvas;

    if (!node || !canvas)
        return;

    canvas.selectNode?.(node);

    if (canvas.animateToBounds && node.boundingRect)
        canvas.animateToBounds(node.boundingRect);
    else
        canvas.centerOnNode?.(node);

    canvas.setDirty?.(true, true);
}
