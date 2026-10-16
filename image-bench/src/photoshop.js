/**
 * Images sent from the popup to the Image Bench Photoshop plugin
 */
import {toastPending} from "@/toast.js";

/**
 * Send an image to the Photoshop plugin, which opens it as a new document or places it as a layer of the active
 * document. A notice shows the transfer until the plugin reports the image is in Photoshop
 * @param {string} url - Image URL (also a data URL)
 * @param {string} name - File name or path; Photoshop names the layer after it
 * @param {boolean} newDocument - Open the image as a new document even if there is an active one
 * @returns {Promise<string|null>} Error message, or null on success
 */
export async function sendUrlToPhotoshop(url, name, newDocument = false) {
  const pending = toastPending(newDocument ? "Opening in Photoshop…" : "Placing in Photoshop…");
  const {error, timeout} = await sendImage(url, name, newDocument);

  if (error)
    pending.dismiss();
  else if (timeout)
    pending.done("Sent to Photoshop");
  else
    pending.done(newDocument ? "Opened in Photoshop" : "Placed in Photoshop");

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
    const response = await fetch(`/image-bench/photoshop/send?name=${encodeURIComponent(name)}&new_document=${newDocument}`, {
      method: 'POST',
      headers: {'Content-Type': blob.type},
      body: blob
    });

    if (!response.ok)
      return {error: `Unable to send the image: ${await response.text()}`};

    const {clients, done, error} = await response.json();

    if (!clients)
      return {error: 'Photoshop is not connected. Please open the Image Bench panel in Photoshop.'};

    return error ? {error: `Photoshop: ${error}`} : {timeout: !done};
  } catch (error) {
    return {error: `Unable to send the image: ${error.message}`};
  }
}
