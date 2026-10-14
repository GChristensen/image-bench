/**
 * Parameters of the projects of the Library tab, the ComfyUI counterpart of captureProject() and restoreProject()
 * of webui-extension/javascript/core.js with the same messages: the parameters of the Generate tab, the enabled
 * ControlNet units with their images, and the workflow, which is loaded first when a project is restored.
 */

/**
 * @param {Object} ctx - {app, ops, popup: {sendMessage}}
 * @param {Object} modules - {mirror, controlNet}
 */
export function createProjects({app, ops, popup}, {mirror, controlNet}) {
    /**
     * Answer a request of the popup with HOST_RESPONSE
     */
    async function respond(payload, handler) {
        try {
            popup.sendMessage({type: "HOST_RESPONSE", requestId: payload.requestId, result: await handler()});
        } catch (error) {
            console.error('[Image Bench] Project request failed:', error);
            popup.sendMessage({type: "HOST_RESPONSE", requestId: payload.requestId, error: error.message || String(error)});
        }
    }

    async function capture() {
        const mode = mirror.getMode();

        return {
            mode,
            params: ops.params.read(mode).params,
            controlnet: {tab: 'txt2img', units: await controlNet.captureUnits()},
            workflow: app.graph.serialize()
        };
    }

    /**
     * @param {Object} snapshot - {mode, params, controlnet: {units}, workflow, name} with the ControlNet images as files
     * @returns {Promise<{missingUnits: number[]}>}
     */
    async function restore({params, controlnet, workflow, name}) {
        if (workflow)
            await loadWorkflow(workflow, name);

        ops.params.apply(params || {}, mirror.getMode());

        const missingUnits = controlnet ? await controlNet.restoreUnits(controlnet.units || [], !!workflow) : [];

        app.graph.setDirtyCanvas(true, true);
        mirror.pollIfActive();
        return {missingUnits};
    }

    /**
     * Load the workflow of a project, in a workflow tab named after the project where the frontend has them
     */
    async function loadWorkflow(workflow, name) {
        try {
            await app.loadGraphData(workflow, true, true, name || null);
        } catch (error) {
            console.warn('[Image Bench] Loading the workflow by name failed, loading it in place:', error);
            await app.loadGraphData(workflow);
        }
    }

    const handlers = {
        PROJECT_CAPTURE: payload => respond(payload, capture),
        PROJECT_RESTORE: payload => respond(payload, () => restore(payload.snapshot))
    };

    return {handlers};
}
