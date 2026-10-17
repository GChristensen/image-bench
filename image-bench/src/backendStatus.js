import {ref, watch} from "vue";
import {toast} from "@/toast.js";
import {HOST_NAME} from "@/host.js";

/**
 * Whether the backend of the host (SD WebUI / ComfyUI) is running, told by a socket kept open to
 * /image-bench/heartbeat: the socket closes at once when the server process exits. The pings cover a remote host
 * that is lost without closing the connection
 */

const ENDPOINT = "/image-bench/heartbeat";
const RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 10000;
const PING_INTERVAL = 15000;
const PONG_TIMEOUT = 10000;
const NOTICE_INTERVAL = 3000;

// Assumed running until a socket closes, so that nothing is shown at startup
export const backendConnected = ref(true);
// Counts the connections opened after a loss
const reconnections = ref(0);

let socket = null;
let started = false;
let lost = false;
let retryDelay = RETRY_DELAY;
let pingTimer = null;
let pongTimer = null;
let lastNotice = 0;

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}${ENDPOINT}`);
  socket = ws;

  ws.onopen = () => {
    retryDelay = RETRY_DELAY;
    backendConnected.value = true;
    pingTimer = setInterval(() => ping(ws), PING_INTERVAL);

    if (lost) {
      lost = false;
      reconnections.value++;
    }
  };

  ws.onmessage = () => clearTimeout(pongTimer);

  ws.onclose = () => {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);

    if (socket !== ws)
      return;

    lost = true;
    backendConnected.value = false;
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
  };
}

function ping(ws) {
  if (ws.readyState !== WebSocket.OPEN)
    return;

  ws.send("ping");
  clearTimeout(pongTimer);
  pongTimer = setTimeout(() => ws.close(), PONG_TIMEOUT);
}

/**
 * Show that an operation is not possible while the backend is down (once in a few seconds)
 */
export function notifyBackendDown() {
  const now = Date.now();

  if (now - lastNotice < NOTICE_INTERVAL)
    return;

  lastNotice = now;
  toast(`${HOST_NAME} is not running. Waiting for it to start…`, {kind: "error"});
}

// Requests of the popup fail at once while the server is down: tell why instead of failing silently
function onUnhandledRejection(e) {
  if (!backendConnected.value && e.reason instanceof TypeError) {
    e.preventDefault();
    notifyBackendDown();
  }
}

/**
 * Start watching the backend (once per page)
 */
export function startBackendMonitor() {
  if (started)
    return;

  started = true;
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  connect();
}

/**
 * Run a callback whenever the backend is back after a loss
 * @param {Function} callback
 * @returns {Function} Stops watching
 */
export function onBackendReconnected(callback) {
  return watch(reconnections, () => callback());
}
