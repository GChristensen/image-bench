import {computed, ref, watch} from "vue";
import {backendConnected, onBackendReconnected} from "@/backendStatus.js";
import {copyText} from "@/clipboard.js";
import {dialog} from "@/dialogs/useDialog.js";
import {HOST_NAME} from "@/host.js";
import {toast} from "@/toast.js";

/**
 * Restart of a hung or dead host from the popup (console drawer, the plug icon of the tab bar).
 * A hung host cannot restart itself: the backend starts a sidecar process (shared_backend/host_supervisor.py) that
 * kills the host's process tree and runs the start script named in store/host_restart.json, a file edited by hand.
 * While the host answers, a restart goes through it (POST /image-bench/host_restart). Otherwise the popup asks the
 * sidecar itself: /image-bench/host_restart tells its port, scheme and token while the host runs, and the popup keeps
 * them. The sidecar listens where the host does (on the network with --listen) with the host's TLS certificate, so it
 * is reached at the host name of the page; a self-signed certificate is accepted for its port once.
 */

const ENDPOINT = "/image-bench/host_restart";
const TOKEN_HEADER = "X-Image-Bench-Token";
const STATUS_INTERVAL = 5000;

// {configured, command, cwd, configPath, detected, port, scheme, network, token, running} of the backend, null until read
export const restartInfo = ref(null);
// {state, error, hostAlive, memory, configured} of the sidecar, polled while the host is lost
export const sidecarStatus = ref(null);
// A restart was asked for and the host is not back yet
const restartRequested = ref(false);

// The address of the sidecar for this browser: the host name of the page if it listens on the network
export const sidecarUrl = computed(() => {
  const info = restartInfo.value;

  if (!info?.port)
    return null;

  return `${info.scheme || "http"}://${info.network ? location.hostname : "127.0.0.1"}:${info.port}`;
});

export const canRestart = computed(() => !!(restartInfo.value?.configured && restartInfo.value?.port));

export const restarting = computed(() =>
  sidecarStatus.value?.state === "restarting" || (restartRequested.value && !sidecarStatus.value));

let started = false;
let statusTimer = 0;

/**
 * Read the restart settings of the backend (again: the config file may have been written since)
 */
export async function loadRestartInfo() {
  try {
    const response = await fetch(ENDPOINT, {cache: "no-store"});

    if (response.ok)
      restartInfo.value = await response.json();
  } catch {
    // The host is down: the settings read before stay
  }

  return restartInfo.value;
}

class UnreachableError extends Error {}

async function requestSidecar(path, method = "GET") {
  if (!sidecarUrl.value)
    throw new Error("The restart helper is not running");

  let response;

  try {
    response = await fetch(`${sidecarUrl.value}${path}`, {method, headers: {[TOKEN_HEADER]: restartInfo.value.token},
      cache: "no-store"});
  } catch {
    throw new UnreachableError(`The restart helper does not answer at ${sidecarUrl.value}`);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok)
    throw new Error(body.error || `Error ${response.status}`);

  return body;
}

async function pollStatus() {
  try {
    sidecarStatus.value = await requestSidecar("/status");
  } catch {
    sidecarStatus.value = null;
  }
}

function watchStatus(connected) {
  clearInterval(statusTimer);
  statusTimer = 0;

  if (connected || !canRestart.value) {
    sidecarStatus.value = null;
    return;
  }

  // The polls also keep the sidecar running while the host is gone
  pollStatus();
  statusTimer = setInterval(pollStatus, STATUS_INTERVAL);
}

/**
 * Read the settings and follow the sidecar while the host is lost (once per page)
 */
export function startHostRestart() {
  if (started)
    return;

  started = true;
  loadRestartInfo();
  watch(backendConnected, watchStatus);

  onBackendReconnected(() => {
    restartRequested.value = false;
    loadRestartInfo();
  });
}

function formatMemory(bytes) {
  return bytes ? ` (${(bytes / 2 ** 30).toFixed(1)} GB)` : "";
}

/**
 * The title of the plug icon shown while the host is lost
 */
export const backendDownTitle = computed(() => {
  const status = sidecarStatus.value;
  const lost = `${HOST_NAME} is not running (the connection to its server was lost).`;

  if (restarting.value)
    return `${HOST_NAME} is restarting…`;

  if (!status)
    return canRestart.value ? `${lost} Click to restart it` : `${lost} Waiting for it to start…`;

  if (status.state === "failed")
    return `The restart of ${HOST_NAME} failed: ${status.error}. Click to try again`;

  if (status.hostAlive)
    return `${HOST_NAME} does not respond, but its process is running${formatMemory(status.memory)}. `
      + "Click to restart it";

  return `${HOST_NAME} has exited. Click to start it again`;
});

async function explainSetup(info) {
  const config = JSON.stringify({command: info.detected || "<the start script>"}, null, 2);
  const message = `To restart ${HOST_NAME} from Image Bench, create this file:\n\n${info.configPath}\n\n`
    + `with the script that starts ${HOST_NAME}:\n\n${config}\n\nIt is read without restarting ${HOST_NAME}.`;

  if (await dialog.confirm(message, {title: `Restart ${HOST_NAME}`, okText: "Copy the file content"})
      && await copyText(config))
    toast("The file content is copied");
}

function confirmText() {
  const status = sidecarStatus.value;

  if (backendConnected.value)
    return `${HOST_NAME} is running. Kill it with its console window and start it again? A running generation `
      + "is lost.";

  if (status?.hostAlive)
    return `${HOST_NAME} does not respond, but its process is running${formatMemory(status.memory)}. `
      + "Kill it with its console window and start it again?";

  return `Start ${HOST_NAME} again?`;
}

/** Restart through the host's backend, which reaches the sidecar on its own computer */
async function requestBackendRestart() {
  let response;

  try {
    response = await fetch(ENDPOINT, {method: "POST", cache: "no-store"});
  } catch {
    // The backend may be killed before its reply leaves
    return;
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok)
    throw new Error(body.error || `Error ${response.status}`);
}

/** The browser refuses the sidecar: most likely its self-signed certificate, which is accepted for each port */
async function explainUnreachable(e) {
  if (restartInfo.value?.scheme !== "https") {
    toast(`Unable to restart ${HOST_NAME}: ${e.message}`, {kind: "error"});
    return;
  }

  const message = `${e.message}.\n\nIf ${HOST_NAME} uses a self-signed certificate, the browser has to accept it `
    + `for the port of the restart helper too: open ${sidecarUrl.value}, accept the certificate, then try again. `
    + "This is needed once.";

  if (await dialog.confirm(message, {title: `Restart ${HOST_NAME}`, okText: "Open the restart helper"}))
    window.open(`${sidecarUrl.value}/`, "_blank");
}

/**
 * Restart the host after a confirmation, or tell how to set the restart up
 */
export async function restartHost() {
  const info = backendConnected.value ? await loadRestartInfo() : restartInfo.value;

  if (!info) {
    toast(`${HOST_NAME} has not answered since the window was opened`, {kind: "error"});
    return;
  }

  if (!info.configured)
    return explainSetup(info);

  if (!info.port) {
    toast("The restart helper is not running. See the log in the store folder of the extension", {kind: "error"});
    return;
  }

  if (!await dialog.confirm(confirmText(), {title: `Restart ${HOST_NAME}`, okText: "Restart", danger: true}))
    return;

  try {
    if (backendConnected.value)
      await requestBackendRestart();
    else
      await requestSidecar("/restart", "POST");

    restartRequested.value = true;
    toast(`Restarting ${HOST_NAME}…`);
  } catch (e) {
    if (e instanceof UnreachableError)
      await explainUnreachable(e);
    else
      toast(`Unable to restart ${HOST_NAME}: ${e.message}`, {kind: "error"});
  }
}
