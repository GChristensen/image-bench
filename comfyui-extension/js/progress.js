/**
 * Progress of the running generation from the ComfyUI api events: whether ComfyUI is busy (running or with
 * queued prompts), the sampling progress and the latent preview. While the popup is open (watch(), for the run
 * indicator of its tab bar) or the Generate tab is shown, the progress goes to the popup (LIVE_PROGRESS), as in SD WebUI.
 *
 * The progress is that of the whole prompt, split into its sampling passes as WebUI splits the first pass and Hires.
 * fix: (finished passes + step / steps) / passes. The passes are the sampler nodes of the prompt (node_config.json
 * "sampler" types) that run: not cached, and not the Hires. fix sampler (ib:smp:1) while the ib:hr switch is off.
 * Progress of other nodes (e.g. a tiled upscale model) is ignored.
 */

import {parseNodeMarkers} from "./workflow.js";

/**
 * @param {Object} ctx - {api, ops, popup: {sendMessage, isOpen}}
 */
export function createProgress({api, ops, popup}) {
    let running = false;
    let queueRemaining = 0;
    let progress = null;
    let preview = null;
    let subscribed = false;
    let watching = false;
    let lastLive = null;
    // A run started since the mirror last read the busy state: a cached run may end between two polls
    let unreported = false;
    // Sampling passes of the running prompt: {promptId, samplers: Set of node ids (null until known), cached: Set,
    // done: Set, current: node id}
    let passes = null;

    api.addEventListener('status', e => {
        queueRemaining = e.detail?.exec_info?.queue_remaining ?? 0;
        send();
    });

    api.addEventListener('execution_start', e => {
        running = true;
        unreported = true;
        progress = 0;
        passes = {promptId: e.detail?.prompt_id, samplers: null, cached: new Set(), done: new Set(), current: null};
        loadPasses(passes);
        setPreview(null);
        send();
    });

    api.addEventListener('execution_cached', e => {
        if (passes && e.detail?.prompt_id === passes.promptId)
            for (const node of e.detail.nodes ?? [])
                passes.cached.add(String(node));
    });

    api.addEventListener('progress', e => {
        const {value, max, node} = e.detail ?? {};

        if (!max)
            return;

        const fraction = promptFraction(node == null ? null : String(node), value / max);

        // Never back: a pass that is not counted, or events out of order
        if (fraction !== null && Math.round(fraction * 100) > (progress ?? 0)) {
            progress = Math.round(fraction * 100);
            send();
        }
    });

    /**
     * Fraction of the prompt done at the step of a node, null for a node that is no sampling pass
     * @param {string|null} node
     * @param {number} fraction - Fraction of the node's steps
     * @returns {number|null}
     */
    function promptFraction(node, fraction) {
        // Not known (yet): the node's own progress
        if (!passes?.samplers)
            return fraction;

        if (!passes.samplers.has(node))
            return null;

        if (node !== passes.current) {
            if (passes.current !== null)
                passes.done.add(passes.current);

            passes.current = node;
        }

        const count = [...passes.samplers].filter(id => !passes.cached.has(id)).length;

        if (count <= 1)
            return fraction;

        return Math.min(1, (passes.done.size + fraction) / count);
    }

    /**
     * Find the sampler nodes of the running prompt in the queue
     * @param {Object} current - The passes of the prompt
     */
    async function loadPasses(current) {
        try {
            const response = await api.fetchApi('/queue');
            const queue = await response.json();
            const entry = queue.queue_running?.find(item => item[1] === current.promptId);

            if (passes === current && entry)
                current.samplers = getSamplerNodes(entry[2] ?? {});
        } catch (error) {
            console.warn('[Image Bench] Unable to read the running prompt:', error);
        }
    }

    /**
     * Sampler nodes of an API prompt that run
     * @param {Object} prompt - {node id: {class_type, inputs, _meta: {title}}}
     * @returns {Set<string>}
     */
    function getSamplerNodes(prompt) {
        const config = ops?.nodeConfig ?? {};
        const samplerTypes = new Set(config.sampler?.nodeTypes ?? []);
        const samplerMarker = config.sampler?.marker || 'smp';
        const hiresMarker = config.hires_fix?.marker || 'hr';
        const switchWidgets = config.hires_fix?.widgetNames ?? {};
        const markers = node => parseNodeMarkers(node?._meta?.title);

        const switchValue = node => {
            let value = node.inputs?.[switchWidgets[node.class_type]];

            // Linked to a primitive ([node id, slot])
            if (Array.isArray(value))
                value = prompt[value[0]]?.inputs?.value;

            return value;
        };

        const hiresOff = Object.values(prompt)
            .some(node => markers(node).some(marker => marker.type === hiresMarker) && switchValue(node) === false);

        const isHiresSampler = node => markers(node).some(marker => marker.type === samplerMarker && marker.index === 1);

        return new Set(Object.entries(prompt)
            .filter(([, node]) => samplerTypes.has(node.class_type) && !(hiresOff && isHiresSampler(node)))
            .map(([id]) => id));
    }

    // The latent preview arrives as a blob; the popup has the same origin, so its object URL works there
    api.addEventListener('b_preview', e => {
        if (e.detail instanceof Blob) {
            setPreview(URL.createObjectURL(e.detail));
            send();
        }
    });

    for (const type of ['execution_success', 'execution_error', 'execution_interrupted'])
        api.addEventListener(type, () => {
            running = false;
            progress = null;
            passes = null;
            setPreview(null);
            send();
        });

    function setPreview(url) {
        if (preview)
            URL.revokeObjectURL(preview);

        preview = url;
    }

    function isBusy() {
        return running || queueRemaining > 0;
    }

    /**
     * The busy state for the mirror, which polls it: busy at least once for each run, so that the Generate tab sees a
     * run that ended between two polls end (it ends a single generation when the host goes from busy to idle)
     * @returns {boolean}
     */
    function takeBusy() {
        const busy = isBusy() || unreported;
        unreported = false;
        return busy;
    }

    /**
     * @returns {number|null} Progress of the running prompt (0-100), null if none is running
     */
    function getProgress() {
        return running ? progress : null;
    }

    /**
     * Send the progress to the popup while the Generate tab is shown; one final message when ComfyUI is idle
     */
    function send() {
        if (!subscribed && !watching)
            return;

        if (!popup.isOpen()) {
            subscribed = false;
            watching = false;
            return;
        }

        const busy = isBusy();

        if (!busy && !lastLive?.active)
            return;

        const live = busy
            ? {active: true, progress: progress ?? 0, preview}
            : {active: false, progress: 100, preview: null};

        if (live.active !== lastLive?.active || live.progress !== lastLive.progress || live.preview !== lastLive.preview) {
            lastLive = live;
            popup.sendMessage({type: "LIVE_PROGRESS", ...live});
        }
    }

    /**
     * Start or stop sending the progress (the Generate tab is shown or hidden)
     * @param {boolean} active
     */
    function subscribe(active) {
        subscribed = active;

        // The popup may keep the progress of a generation that ended meanwhile
        if (active) {
            lastLive = {active: true};
            send();
        }
    }

    /**
     * Send the progress while the popup is open, in any of its tabs
     */
    function watch() {
        watching = true;
        lastLive = {active: true};
        send();
    }

    return {isBusy, takeBusy, getProgress, subscribe, watch};
}
