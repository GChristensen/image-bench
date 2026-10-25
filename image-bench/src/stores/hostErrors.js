import {defineStore} from "pinia";
import {shallowRef} from "vue";
import {dialog} from "@/dialogs/useDialog.js";
import {EMBEDDED, getHostWindow} from "@/hostWindow.js";
import {sendWebUIMessage} from "@/sdwebui.js";
import {HOST_NAME} from "@/host.js";

/**
 * Errors of the host, fed from App.vue in every tab (ComfyUI, feature hostErrors): the last refused or failed run
 * (GENERATION_ERROR, until the next run begins) and the nodes and files the workflow uses that the host does not
 * have (`problems` of WEBUI_PARAMS, sent while the Generate tab is shown). Errors are those of the host page's
 * runErrors.js: {kind: "queue"|"execution", message, nodes: [{id, title, type, errors: [{message, details, input, value}]}]}
 */
export const useHostErrorsStore = defineStore("hostErrors", () => {
  const runError = shallowRef(null);
  const problems = shallowRef(null);

  function onSDEvent(e) {
    if (e.type === "GENERATION_ERROR")
      runError.value = normalize(e.error);
    else if (e.type === "BEGIN_PROCESSING")
      runError.value = null;
    else if (e.type === "WEBUI_PARAMS")
      problems.value = e.problems ?? null;
  }

  // A host page of an older version sends the message only
  function normalize(error) {
    return typeof error === "object" && error
      ? {...error, nodes: error.nodes ?? []}
      : {kind: "execution", message: String(error || "The generation failed"), nodes: []};
  }

  function clearRunError() {
    runError.value = null;
  }

  return {runError, problems, onSDEvent, clearRunError};
});

/**
 * One line of an error for a status pill or a toast: the first node with its first message, else the message
 * @param {Object} error
 * @returns {string}
 */
export function summarizeHostError(error) {
  const node = error.nodes.find(item => item.errors?.length) ?? error.nodes[0];
  const message = node?.errors?.[0]?.message ?? error.message;
  return node ? `${node.title}: ${message}` : message;
}

/**
 * Title of the details dialog
 * @param {Object|null} error
 * @param {string} hostName
 * @returns {string}
 */
export function hostErrorTitle(error, hostName) {
  if (!error)
    return "Workflow problems";
  return error.kind === "queue" ? `${hostName} refused the workflow` : "The generation failed";
}

/**
 * Show the details dialog; "Show in <host>" selects the node in the host page and shows it: the host tab in the
 * embedded mode, the host window otherwise
 * @param {{error?: Object|null, problems?: Object|null}} details
 * @param {Object} router - The app router (not imported here: the router imports the views that use this)
 */
export async function showHostErrors({error = null, problems = null}, router) {
  const nodeId = await dialog.hostErrors({title: hostErrorTitle(error, HOST_NAME), error, problems});

  if (nodeId == null)
    return;

  sendWebUIMessage({type: "SHOW_NODE", id: nodeId});

  if (EMBEDDED)
    router.push("/host");
  else
    getHostWindow()?.focus();
}
