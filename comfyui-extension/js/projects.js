/**
 * Parameters of the projects of the Library tab, the ComfyUI counterpart of captureProject() and restoreProject()
 * of webui-extension/javascript/core.js with the same messages: the parameters of the Generate tab, the enabled
 * ControlNet units with their images, and the workflow, which is loaded first when a project is restored.
 */

// Key of the graph's extra data holding the name of the saved workflow a restored project graph comes from
const WORKFLOW_NAME_KEY = 'imageBenchWorkflow';

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

    /**
     * Name of the saved workflow the graph comes from: that of the tab, else the one a project restore recorded in the
     * graph (its tab is temporary), so a project saved again keeps it
     */
    function workflowName() {
        const active = app.extensionManager?.workflow?.activeWorkflow;
        const name = active && !active.isTemporary ? active.key ?? active.filename : app.graph.extra?.[WORKFLOW_NAME_KEY];

        return name ? name.split('/').pop().replace(/\.json$/i, '') : null;
    }

    async function capture() {
        const mode = mirror.getMode();

        return {
            mode,
            params: ops.params.read(mode).params,
            controlnet: {tab: 'txt2img', units: await controlNet.captureUnits()},
            workflow: app.graph.serialize(),
            workflowName: workflowName()
        };
    }

    /**
     * @param {Object} snapshot - {mode, params, controlnet: {units}, workflow, workflowName, name} with the ControlNet
     *   images as files
     * @returns {Promise<{missingUnits: number[]}>}
     */
    async function restore({params, controlnet, workflow, workflowName, name}) {
        if (workflow)
            await loadWorkflow(workflow, workflowName, name);

        ops.params.apply(params || {}, mirror.getMode());

        const missingUnits = controlnet ? await controlNet.restoreUnits(controlnet.units || [], !!workflow) : [];

        app.graph.setDirtyCanvas(true, true);
        mirror.pollIfActive();
        return {missingUnits};
    }

    /**
     * Load the workflow of a project in a new tab, "<workflow> (<project>)", or the project name without a workflow
     * name; no saved workflow is changed. The project keeps the workflow (ib_project/workflow.json)
     */
    async function loadWorkflow(workflow, workflowName, name) {
        if (workflowName)
            workflow = {...workflow, extra: {...workflow.extra, [WORKFLOW_NAME_KEY]: workflowName}};

        try {
            await app.loadGraphData(workflow, true, true, workflowName ? `${workflowName} (${name})` : name || null);
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
