/**
 * Walking the links of the workflow graph from a marker target (see MarkerTarget in workflow.js).
 * Nodes inside a subgraph keep the subgraph node as their host, so that their widgets are read and set
 * through getTargetWidget(), and links that enter a subgraph through its inputs are followed out to the host graph.
 */

// Graph id of the input node of a subgraph (links from the subgraph inputs start there)
const SUBGRAPH_INPUT_ID = -10;

// Maximum number of nodes visited by a deep walk
const MAX_VISITED = 64;

// Node mode of a bypassed node
export const MODE_BYPASS = 4;
export const MODE_ALWAYS = 0;

function getLink(graph, linkId) {
    return graph?.getLink?.(linkId) ?? graph?.links?.[linkId] ?? null;
}

/**
 * Create the target of a node found in the graph of another target: inside a subgraph the host stays the subgraph node
 * @param {Object} from - MarkerTarget the node was reached from
 * @param {Object} node
 * @param {boolean} inHostGraph - The node is in the graph of the host (the link left the subgraph)
 * @returns {Object} MarkerTarget
 */
function createLinkedTarget(from, node, inHostGraph) {
    if (inHostGraph || from.host === from.source)
        return {host: node, source: node, executionId: String(node.id)};

    const prefix = from.executionId.split(':').slice(0, -1).join(':');
    return {host: from.host, source: node, executionId: `${prefix}:${node.id}`};
}

/**
 * Get the target linked to an input of a target's source node, following Reroute nodes
 * and links that come from the inputs of the subgraph the node is in
 * @param {Object} target - MarkerTarget
 * @param {string|Object} input - Input name or input slot
 * @returns {Object|null} MarkerTarget of the node the input is linked from, with `slot`, the output slot it comes from
 */
export function getLinkedSource(target, input) {
    let current = target;
    let slot = typeof input === 'string' ? current.source.inputs?.find(i => i.name === input) : input;

    for (let hops = 0; slot?.link != null && hops < MAX_VISITED; hops++) {
        const graph = current.source.graph;
        const link = getLink(graph, slot.link);

        if (!link)
            return null;

        // The link comes from an input of the subgraph: continue from the matching input of the subgraph node
        if (link.origin_id === SUBGRAPH_INPUT_ID) {
            if (current.host === current.source)
                return null;

            const hostInput = current.host.inputs?.[link.origin_slot];
            current = {host: current.host, source: current.host, executionId: String(current.host.id)};
            slot = hostInput;
            continue;
        }

        const node = graph.getNodeById(link.origin_id);

        if (!node)
            return null;

        const inHostGraph = current.host === current.source;
        const next = createLinkedTarget(current, node, inHostGraph);

        if (node.type === 'Reroute') {
            current = next;
            slot = node.inputs?.[0];
            continue;
        }

        return {...next, slot: link.origin_slot};
    }

    return null;
}

/**
 * Find a node of the given types upstream of a target
 * @param {Object} target - MarkerTarget to start from
 * @param {Object} locator
 * @param {string[]} [locator.via] - Input names followed one after another from the target
 * @param {boolean|string} [locator.deep] - Then walk further upstream: true through all inputs,
 *   a string through the inputs of that name only, until a node of the types is found
 * @param {string[]} [locator.types] - Accepted node types (any if absent)
 * @param {string[]} [locator.stopTypes] - Node types a deep walk does not pass (e.g. other samplers)
 * @returns {Object|null} MarkerTarget
 */
export function findUpstream(target, {via = [], deep = false, types = null, stopTypes = []}) {
    let current = target;

    for (const name of via) {
        current = current && getLinkedSource(current, name);

        if (!current)
            return null;
    }

    const accepts = node => !types || types.includes(node.type);

    if (accepts(current.source) || !deep)
        return accepts(current.source) ? current : null;

    // Breadth-first, so that the nearest matching node wins
    const queue = [current];
    const visited = new Set([current.source]);

    while (queue.length && visited.size < MAX_VISITED) {
        const node = queue.shift();

        for (const input of node.source.inputs ?? []) {
            if (input.link == null || (typeof deep === 'string' && input.name !== deep))
                continue;

            const next = getLinkedSource(node, input);

            if (!next || visited.has(next.source))
                continue;

            visited.add(next.source);

            if (accepts(next.source))
                return next;

            if (!stopTypes.includes(next.source.type))
                queue.push(next);
        }
    }

    return null;
}

// Input type of the growing input groups of V3 nodes (TextEncodeQwenImage21 "images": images.image_1, ...)
const AUTOGROW_TYPE = 'COMFY_AUTOGROW_V3';

/**
 * Whether an input of a node is optional in its node definition. A slot of an Autogrow group ("images.image_2")
 * is optional beyond the minimum count of its template
 * @param {Object} node
 * @param {string} inputName
 * @returns {boolean}
 */
function isOptionalInput(node, inputName) {
    const definition = node.constructor?.nodeData?.input;

    if (definition?.optional?.[inputName])
        return true;

    const separator = inputName.indexOf('.');

    if (separator < 0)
        return false;

    const group = inputName.slice(0, separator);
    const name = inputName.slice(separator + 1);
    const spec = definition?.required?.[group] ?? definition?.optional?.[group];

    if (spec?.[0] !== AUTOGROW_TYPE)
        return false;

    const template = spec[1]?.template ?? {};
    const index = template.names ? template.names.indexOf(name) : Number(name.slice(template.prefix?.length ?? 0));

    return !!definition.optional?.[group] || index >= (template.min ?? 1);
}

/**
 * Whether bypassing a node passes something through to its outputs: it has an input of an output's type
 * other than the given one (which is being bypassed itself)
 * @param {Object} node
 * @param {Object} bypassedInput
 * @returns {boolean}
 */
function hasPassThrough(node, bypassedInput) {
    const inputTypes = new Set((node.inputs ?? [])
        .filter(input => input !== bypassedInput && input.link != null)
        .map(input => input.type));

    return (node.outputs ?? []).some(output => inputTypes.has(output.type));
}

/**
 * The nodes to bypass together with a node so that the workflow still runs without it: following its outputs,
 * a consumer that takes it through an optional input stays, one that can pass something else through
 * (e.g. ReferenceLatent) is bypassed and ends the chain, and one that cannot (e.g. VAEEncode) is bypassed
 * and followed further. Only nodes of the node's own graph are followed.
 * @param {Object} node
 * @returns {Object[]} The node and the consumers to bypass with it
 */
export function getBypassChain(node) {
    const chain = [node];
    const queue = [node];

    while (queue.length && chain.length < MAX_VISITED) {
        const current = queue.shift();

        for (const output of current.outputs ?? []) {
            for (const linkId of output.links ?? []) {
                const link = getLink(current.graph, linkId);
                const consumer = link && current.graph.getNodeById(link.target_id);
                const input = consumer?.inputs?.[link.target_slot];

                if (!consumer || !input || chain.includes(consumer) || isOptionalInput(consumer, input.name))
                    continue;

                chain.push(consumer);

                if (!hasPassThrough(consumer, input))
                    queue.push(consumer);
            }
        }
    }

    return chain;
}
