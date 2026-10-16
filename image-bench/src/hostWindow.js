import {computed, ref, shallowRef, watch} from "vue";

/**
 * The host page (SD WebUI / ComfyUI) the popup talks to: the opener window that opened the popup, or, in the
 * embedded mode (the popup opened through ?embedded, see shared_backend/launcher.html), the host page loaded in
 * the popup's own iframe (HostFrame.vue). All direct access to the host window goes through here
 */

export const EMBEDDED = new URLSearchParams(window.location.search).has("embedded");

// The host page of the embedded mode looks for this flag on its parent to attach to it (shared_frontend/popup.js)
if (EMBEDDED)
  window.imageBenchEmbedded = true;

const frameWindow = shallowRef(null);
// Whether the host page in the iframe has attached (HOST_READY) and not left since (HOST_DETACHED)
const frameAttached = ref(false);
// Counts the HOST_READY messages: a new host page, which knows nothing of the popup
const hostSession = ref(0);

/**
 * Set the window of the host iframe (embedded mode)
 * @param {Window|null} win
 */
export function setHostFrameWindow(win) {
  frameWindow.value = win;
}

/**
 * @returns {Window|null} The host window, null if it is closed or not loaded
 */
export function getHostWindow() {
  const win = EMBEDDED ? frameWindow.value : window.opener;
  return win && !win.closed ? win : null;
}

// Whether the host window is there; the opener is not reactive and is read once
export const hostConnected = computed(() => EMBEDDED ? frameAttached.value : !!window.opener);

/**
 * Handle the attachment messages of the host page in the iframe
 * @param {Object} e - Message of the host page
 * @returns {boolean} Whether the message was one of them
 */
export function handleHostAttachment(e) {
  if (e.type === "HOST_READY") {
    frameAttached.value = true;
    hostSession.value++;
    return true;
  }

  if (e.type === "HOST_DETACHED") {
    frameAttached.value = false;
    // The function of the leaving page; the next one injects its own
    delete window.getGenerationState;
    return true;
  }

  return false;
}

/**
 * Run a callback whenever a host page attaches (embedded mode), to send it the state it has to know
 * @param {Function} callback
 * @returns {Function} Stops watching
 */
export function onHostReady(callback) {
  return watch(hostSession, () => callback());
}
