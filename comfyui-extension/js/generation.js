/**
 * Generation requests of the Generate tab: a single image (queued with the workflow as it is, shown in the tab),
 * skipping the image being generated and stopping everything.
 */

/**
 * @param {Object} ctx - {app, api, popup: {sendMessage, isOpen}}
 * @param {Object} hooks
 * @param {() => void} hooks.onSkipped - An interrupted prompt was skipped: a running strategy continues
 * @param {() => Promise<void>} hooks.onStop - Stop the running strategy
 */
export function createGeneration({app, api, popup}, {onSkipped, onStop}) {
    // Prompts queued from the Generate tab that have not started yet: their BEGIN_PROCESSING is marked single,
    // so that the popup stays on the tab
    let pendingSingle = 0;
    let skipping = false;

    api.addEventListener('execution_interrupted', () => {
        if (skipping) {
            skipping = false;
            onSkipped();
        }
    });

    async function generateImage() {
        pendingSingle++;

        try {
            if (await app.queuePrompt(0, 1) === false)
                throw new Error('The workflow was not queued');
        } catch (error) {
            console.error('[Image Bench] Unable to queue the workflow:', error);
            pendingSingle = Math.max(0, pendingSingle - 1);
            popup.sendMessage({type: "GENERATION_FINISHED"});
        }
    }

    /**
     * Whether a starting prompt was queued from the Generate tab
     * @returns {boolean}
     */
    function takeSingle() {
        if (!pendingSingle)
            return false;

        pendingSingle--;
        return true;
    }

    // Interrupting a prompt lets ComfyUI continue with the queue
    async function skip() {
        skipping = true;
        await api.interrupt();
    }

    // Clear the queue, interrupt the running prompt and stop the running strategy
    async function stop() {
        pendingSingle = 0;
        skipping = false;

        try {
            await api.clearItems('queue');
        } catch (error) {
            console.error('[Image Bench] Unable to clear the queue:', error);
        }

        await api.interrupt();
        await onStop();
        popup.sendMessage({type: "GENERATION_STOPPED"});
    }

    const handlers = {
        GENERATE_IMAGE: () => generateImage(),
        SKIP_GENERATION: () => skip(),
        STOP_GENERATION: () => stop()
    };

    return {handlers, takeSingle};
}
