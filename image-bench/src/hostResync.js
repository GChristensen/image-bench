import {EMBEDDED, getHostWindow} from "@/hostWindow.js";
import {requestHost} from "@/hostRequest.js";
import {isWebUI} from "@/host.js";

/**
 * Bring the host page up to date when its backend is back after a restart (backendStatus.js:onBackendReconnected).
 * A WebUI page is dead without its server-side Gradio session and is reloaded; the new page attaches as usual and
 * receives the state of the popup on HOST_READY. A ComfyUI page reconnects by itself and keeps its graph: it only
 * ends a run the restart left waiting
 */

// Gives the server a moment to serve its UI after the socket routes are up
const RELOAD_DELAY = 1000;
const ADOPT_POLL_INTERVAL = 500;
const ADOPT_TIMEOUT = 60000;
const RESYNC_TIMEOUT = 5000;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @returns {Promise<void>} Resolves when the host page has been dealt with
 */
export async function resyncHost() {
  if (!isWebUI) {
    try {
      await requestHost({type: "BACKEND_RECONNECTED"}, RESYNC_TIMEOUT);
    } catch (error) {
      console.warn("[Image Bench] The host page did not answer after the backend restart:", error);
    }
    return;
  }

  await delay(RELOAD_DELAY);

  if (EMBEDDED)
    getHostWindow()?.location.reload();
  else
    reloadOpener();
}

/**
 * Reload the opener page, which would close the popup on pagehide unless it lets the popup go first,
 * then wait for the new page and hand the popup over to it (shared_frontend/popup.js: release(), adopt())
 */
async function reloadOpener() {
  const opener = getHostWindow();

  if (!opener)
    return;

  const oldDocument = opener.document;
  opener.imageBenchReleasePopup?.();
  opener.location.reload();

  for (let waited = 0; waited < ADOPT_TIMEOUT; waited += ADOPT_POLL_INTERVAL) {
    await delay(ADOPT_POLL_INTERVAL);

    if (opener.closed)
      return;

    try {
      // The old page keeps its functions until it is replaced
      if (opener.document !== oldDocument && opener.imageBenchAdoptPopup) {
        opener.imageBenchAdoptPopup(window);
        return;
      }
    } catch {
      // The page is between documents
    }
  }

  console.warn("[Image Bench] The reloaded host page did not take over the popup");
}
