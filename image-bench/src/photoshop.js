/**
 * Images sent from the popup to the Image Bench Photoshop plugin
 */

/**
 * Send an image to the Photoshop plugin, which places it as a layer of the active document
 * @param {string} url - Image URL (also a data URL)
 * @param {string} name - File name or path; Photoshop names the layer after it
 * @param {boolean} newDocument - Open the image as a new document even if there is an active one
 * @returns {Promise<string|null>} Error message, or null on success
 */
export async function sendUrlToPhotoshop(url, name, newDocument = false) {
  try {
    const imageResponse = await fetch(url);

    if (!imageResponse.ok)
      return `Unable to read the image: ${imageResponse.status}`;

    const blob = await imageResponse.blob();
    const response = await fetch(`/image-bench/photoshop/send?name=${encodeURIComponent(name)}&new_document=${newDocument}`, {
      method: 'POST',
      headers: {'Content-Type': blob.type},
      body: blob
    });

    if (!response.ok)
      return `Unable to send the image: ${await response.text()}`;

    const {clients} = await response.json();
    return clients ? null : 'Photoshop is not connected. Please open the Image Bench panel in Photoshop.';
  } catch (error) {
    return `Unable to send the image: ${error.message}`;
  }
}
