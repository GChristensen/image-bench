/**
 * Progress of the running generation from the ComfyUI api events: whether ComfyUI is busy (running or with
 * queued prompts), the sampling progress and the latent preview. While the Generate tab is shown the progress
 * goes to the popup (LIVE_PROGRESS), as in SD WebUI.
 */

/**
 * @param {Object} ctx - {api, popup: {sendMessage, isOpen}}
 */
export function createProgress({api, popup}) {
    let running = false;
    let queueRemaining = 0;
    let progress = null;
    let preview = null;
    let subscribed = false;
    let lastLive = null;
    // A run started since the mirror last read the busy state: a cached run may end between two polls
    let unreported = false;

    api.addEventListener('status', e => {
        queueRemaining = e.detail?.exec_info?.queue_remaining ?? 0;
        send();
    });

    api.addEventListener('execution_start', () => {
        running = true;
        unreported = true;
        progress = 0;
        setPreview(null);
        send();
    });

    api.addEventListener('progress', e => {
        const {value, max} = e.detail ?? {};

        if (max) {
            progress = Math.round(value / max * 100);
            send();
        }
    });

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
        if (!subscribed)
            return;

        if (!popup.isOpen()) {
            subscribed = false;
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

    return {isBusy, takeBusy, getProgress, subscribe};
}
