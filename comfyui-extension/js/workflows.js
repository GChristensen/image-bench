/**
 * Workflows of the Generate tab dropdown: the saved workflows of ComfyUI's Workflows sidebar (its workflow store,
 * app.extensionManager.workflow). The chosen one is opened as the sidebar does, which switches to its tab if it is
 * open (keeping its changes).
 */

/**
 * The saved workflows and the active one, for WEBUI_PARAMS. name is the path below the workflows folder without
 * .json ("portraits/anima/base"), which the popup groups by folder
 * @param {Object} app
 * @returns {{workflow: {path: string, name: string, modified: boolean}|null, workflows: {path: string, name: string}[]}}
 */
export function captureWorkflows(app) {
    const store = app.extensionManager?.workflow;
    const nameOf = workflow => (workflow.key ?? workflow.filename ?? "").replace(/\.json$/i, "");
    const active = store?.activeWorkflow;

    return {
        workflow: active ? {path: active.path, name: nameOf(active), modified: !!active.isModified} : null,
        workflows: (store?.persistedWorkflows ?? []).map(workflow => ({path: workflow.path, name: nameOf(workflow)}))
    };
}

/**
 * @param {Object} ctx - {app, popup: {sendMessage}, showAlert}
 */
export function createWorkflows({app, popup, showAlert}) {
    /**
     * Open a saved workflow as ComfyUI's workflowService.openWorkflow() does
     * @param {{path: string}} payload - Path of the workflow in the store ("workflows/name.json")
     */
    async function openWorkflow({path}) {
        const store = app.extensionManager?.workflow;
        const workflow = path && store?.getWorkflowByPath?.(path);

        try {
            if (!workflow)
                throw new Error("it is not among the saved workflows.");

            if (store.activeWorkflow === workflow)
                return;

            if (!workflow.isLoaded)
                await workflow.load();

            // The state is reactive (a proxy, which structuredClone refuses): the graph gets a plain copy
            await app.loadGraphData(JSON.parse(JSON.stringify(workflow.activeState)), true, true, workflow);
        } catch (error) {
            console.error('[Image Bench] Unable to open the workflow:', error);
            showAlert(`Unable to open the workflow "${path}": ${error.message || error}`);
        }
    }

    // Read the saved workflows again (files added or removed outside of the sidebar)
    async function syncWorkflows() {
        try {
            await app.extensionManager?.workflow?.syncWorkflows?.();
        } catch (error) {
            console.warn('[Image Bench] Unable to read the saved workflows:', error);
        }
    }

    /**
     * Save the active workflow without the dialogs of ComfyUI, which the popup would hide: a saved workflow as
     * Comfy.SaveWorkflow (Ctrl+S) does, an unsaved one under the name given in the popup
     * @param {{name?: string}} payload - Name of an unsaved workflow below the workflows folder ("portraits/base")
     * @returns {Promise<{path: string}>}
     */
    async function saveWorkflow({name}) {
        const store = app.extensionManager?.workflow;
        const workflow = store?.activeWorkflow;

        if (!workflow)
            throw new Error("There is no active workflow.");

        if (!workflow.isTemporary) {
            const command = app.extensionManager?.command;

            if (command?.execute)
                await command.execute("Comfy.SaveWorkflow");
            else {
                workflow.changeTracker?.prepareForSave?.();
                await store.saveWorkflow(workflow);
            }

            return {path: workflow.path};
        }

        name = (name ?? "").trim().replace(/\\/g, "/").replace(/\.json$/i, "").replace(/^\/+|\/+$/g, "");

        if (!name || name.split("/").some(part => !part.trim() || part === "." || part === ".."))
            throw new Error("Enter a name for the workflow.");

        const path = `workflows/${name}.json`;

        if (store.getWorkflowByPath?.(path) && !store.getWorkflowByPath(path).isTemporary)
            throw new Error(`A workflow named "${name}" already exists.`);

        // As ComfyUI's saveWorkflowAs() does with a temporary workflow
        await store.renameWorkflow(workflow, path);
        workflow.changeTracker?.prepareForSave?.();
        await store.saveWorkflow(workflow);

        return {path: workflow.path};
    }

    // Answer a request of the popup with HOST_RESPONSE
    async function respond(payload, handler) {
        try {
            popup.sendMessage({type: "HOST_RESPONSE", requestId: payload.requestId, result: await handler(payload)});
        } catch (error) {
            console.error('[Image Bench] Unable to save the workflow:', error);
            popup.sendMessage({type: "HOST_RESPONSE", requestId: payload.requestId, error: error.message || String(error)});
        }
    }

    const handlers = {
        LOAD_WORKFLOW: payload => openWorkflow(payload),
        SYNC_WORKFLOWS: () => syncWorkflows(),
        SAVE_WORKFLOW: payload => respond(payload, saveWorkflow)
    };

    return {handlers};
}
