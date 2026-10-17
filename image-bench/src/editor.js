/**
 * Images sent from the popup to the connected editor plugin (Photoshop, Krita; editor-extensions/). One editor is
 * connected at a time; its name, reported by the backend (/image-bench/editor/status), labels the send actions
 */
import {ref} from "vue";
import {toastPending} from "@/toast.js";
import {onBackendReconnected} from "@/backendStatus.js";

const NAME_KEY = "imageBench_editorName";
const DEFAULT_NAME = "Photoshop";

// The known editors: icon (components/icons.js) and short name
const EDITORS = {
  Photoshop: {icon: "photoshop", short: "Ps"},
  Krita: {icon: "krita", short: "Kr"}
};

function readStoredName() {
  try {
    return localStorage.getItem(NAME_KEY) || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

/**
 * The connected editor, or the one connected last while none is
 */
export const editorName = ref(readStoredName());

function setEditorName(name) {
  if (!name || name === editorName.value)
    return;

  editorName.value = name;

  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // The name is only remembered for the next session
  }
}

export function editorIcon() {
  return EDITORS[editorName.value]?.icon ?? "layers";
}

export function editorShortName() {
  return EDITORS[editorName.value]?.short ?? editorName.value;
}

/**
 * Read the name of the connected editor; the last one is kept while none is connected
 */
export async function refreshEditorName() {
  try {
    const response = await fetch("/image-bench/editor/status");

    if (response.ok)
      setEditorName((await response.json()).editor);
  } catch {
    // The backend is down: keep the name
  }
}

refreshEditorName();
window.addEventListener("focus", refreshEditorName);
onBackendReconnected(refreshEditorName);

/**
 * Send an image to the editor plugin, which opens it as a new document or places it as a layer of the active
 * document. A notice shows the transfer until the plugin reports the image is in the editor
 * @param {string} url - Image URL (also a data URL)
 * @param {string} name - File name or path; the editor names the layer after it
 * @param {boolean} newDocument - Open the image as a new document even if there is an active one
 * @returns {Promise<string|null>} Error message, or null on success
 */
export async function sendUrlToEditor(url, name, newDocument = false) {
  const pending = toastPending(newDocument ? `Opening in ${editorName.value}…` : `Placing in ${editorName.value}…`);
  const {error, timeout} = await sendImage(url, name, newDocument);
  const editor = editorName.value;

  if (error)
    pending.dismiss();
  else if (timeout)
    pending.done(`Sent to ${editor}`);
  else
    pending.done(newDocument ? `Opened in ${editor}` : `Placed in ${editor}`);

  return error ?? null;
}

/**
 * @returns {Promise<{error?: string, timeout?: boolean}>} timeout: the plugin did not report the result in time
 *   or is too old to report it, the image may still arrive
 */
async function sendImage(url, name, newDocument) {
  try {
    const imageResponse = await fetch(url);

    if (!imageResponse.ok)
      return {error: `Unable to read the image: ${imageResponse.status}`};

    const blob = await imageResponse.blob();
    const response = await fetch(`/image-bench/editor/send?name=${encodeURIComponent(name)}&new_document=${newDocument}`, {
      method: 'POST',
      headers: {'Content-Type': blob.type},
      body: blob
    });

    if (!response.ok)
      return {error: `Unable to send the image: ${await response.text()}`};

    const {clients, editor, done, error} = await response.json();

    if (!clients)
      return {error: 'No editor is connected. Please open the Image Bench panel in Photoshop or the Image Bench docker in Krita.'};

    setEditorName(editor);
    return error ? {error: `${editor}: ${error}`} : {timeout: !done};
  } catch (error) {
    return {error: `Unable to send the image: ${error.message}`};
  }
}
