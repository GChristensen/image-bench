import {sendWebUIMessage} from "@/sdwebui.js";
import {getHostWindow} from "@/hostWindow.js";
import {backendConnected} from "@/backendStatus.js";
import {HOST_NAME} from "@/host.js";

/**
 * Requests to the host page answered with HOST_RESPONSE {requestId, result | error}, for operations whose result
 * the popup needs (the parameters of a project)
 */

let nextRequestId = 1;
const pending = new Map();

/**
 * Send a message to the host page and wait for its answer
 * @param {Object} message - {type, ...}
 * @param {number} timeout - ms
 * @returns {Promise<any>} The result; rejects with the error of the host page or on timeout
 */
export function requestHost(message, timeout = 60000) {
  if (!getHostWindow())
    return Promise.reject(new Error("The host page is closed. Reopen Image Bench from it."));

  if (!backendConnected.value)
    return Promise.reject(new Error(`${HOST_NAME} is not running. Try again when it has started.`));

  const requestId = nextRequestId++;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("The host page did not answer. Reload it if Image Bench was updated."));
    }, timeout);

    pending.set(requestId, {resolve, reject, timer});
    sendWebUIMessage({...message, requestId});
  });
}

/**
 * Settle the request a HOST_RESPONSE answers
 * @param {Object} e - Message of the host page
 * @returns {boolean} Whether the message was a response
 */
export function handleHostResponse(e) {
  if (e.type !== "HOST_RESPONSE")
    return false;

  const request = pending.get(e.requestId);

  if (request) {
    pending.delete(e.requestId);
    clearTimeout(request.timer);

    if (e.error)
      request.reject(new Error(e.error));
    else
      request.resolve(e.result);
  }

  return true;
}
