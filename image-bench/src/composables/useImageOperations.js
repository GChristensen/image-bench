import { createImageLink, createImageGenerationParams } from '@/sdwebui.js';
import { sendUrlToEditor } from '@/editor.js';
import { sendWebUIMessage } from '@/sdwebui.js';
import { useControlNetStore } from '@/stores/controlnet.js';

/**
 * Composable for common image operations
 * Handles image manipulation, data extraction, and utility functions
 */
export function useImageOperations() {
  /**
   * Get the image link for display
   */
  const getImageLink = (image) => {
    return createImageLink(image);
  };

  /**
   * Get generation parameters as formatted text
   */
  const getImageParams = (image) => {
    return createImageGenerationParams(image);
  };

  /**
   * Create tooltip text for an image
   */
  const createImageTooltip = (image) => {
    let result = '';

    for (const key in image.parameters) {
      if (key !== 'prompt' && key !== 'negative prompt' && key !== 'version') {
        let value = image.parameters[key];

        if (typeof value === 'object') {
          continue;
        }

        result += key.charAt(0).toUpperCase() + key.slice(1) + ': ' + value + '\u000d';
      }
    }

    return result;
  };

  /**
   * Clone an image object (deep copy)
   */
  const cloneImage = (image) => {
    return JSON.parse(JSON.stringify(image));
  };

  /**
   * Check if image is img2img type
   */
  const isImg2ImgImage = (image) => {
    return !!image.img2img;
  };

  /**
   * Check if image has been upscaled
   */
  const isUpscaledImage = (image) => {
    return !!image.parameters?.['hires upscale'];
  };

  /**
   * Check if image has custom steps
   */
  const hasCustomSteps = (image) => {
    return !!image.setSteps;
  };

  /**
   * Open image in new window
   */
  const openImageInNewWindow = (image) => {
    const imageLink = createImageLink(image);
    window.open(imageLink, '_blank');
  };

  /**
   * Send image to the connected editor plugin, which places it as a layer of the active document
   * @param {boolean} newDocument - Open the image as a new document even if there is an active one
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendToEditor = (image, newDocument = false) =>
    sendUrlToEditor(createImageLink(image), image.imagePath || createImageLink(image), newDocument);

  /**
   * Send the image file to the host page in a message made by createMessage(file)
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendImageFile = (image, createMessage) =>
    sendUrlFile(createImageLink(image), (image.imagePath || 'image.png').split(/[\\/]/).pop(), createMessage);

  /**
   * Send the image at a URL to the host page as a file in a message made by createMessage(file)
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendUrlFile = async (url, name, createMessage) => {
    try {
      const response = await fetch(url);

      if (!response.ok)
        return `Unable to read the image: ${response.status}`;

      const blob = await response.blob();

      sendWebUIMessage(createMessage(new File([blob], name, {type: blob.type})));
      return null;
    } catch (error) {
      return `Unable to read the image: ${error.message}`;
    }
  };

  /**
   * Put an image into the control image of the unit chosen in the ControlNet tab
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendToControlNet = (image) => sendImageFile(image, file =>
    ({type: 'SET_CONTROLNET_IMAGE', unit: useControlNetStore().selectedUnit, kind: 'image', file}));

  /**
   * Put an already preprocessed image (a ControlNet input of a generated image) into the control image of the unit
   * chosen in the ControlNet tab, used without a preprocessor
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendProcessedToControlNet = (url) => sendUrlFile(url, 'control.png', file =>
    ({type: 'SET_CONTROLNET_IMAGE', unit: useControlNetStore().selectedUnit, kind: 'image', file, processed: true}));

  /**
   * Put an image into the inpaint upload image (WebUI, switching to img2img › Inpaint upload)
   * or the node marked ib:img (ComfyUI)
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendToInpaint = (image) => sendImageFile(image, file =>
    ({type: 'SET_INPUT_IMAGE', mode: 'inpaint', kind: 'image', file}));

  /**
   * Put an image into the img2img canvas (WebUI, switching to img2img › img2img)
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendToImg2Img = (image) => sendImageFile(image, file =>
    ({type: 'SET_INPUT_IMAGE', mode: 'img2img', kind: 'image', file}));

  /**
   * Whether images can be put on the clipboard (needs a secure context, e.g. localhost)
   */
  const canCopyImage = () => !!(window.ClipboardItem && navigator.clipboard?.write);

  /**
   * Put an image on the clipboard as PNG, the only image type browsers accept there
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const copyImage = async (image) => {
    try {
      const response = await fetch(createImageLink(image));

      if (!response.ok)
        return `Unable to read the image: ${response.status}`;

      let blob = await response.blob();

      if (blob.type !== 'image/png') {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }

      await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
      return null;
    } catch (error) {
      return `Unable to copy the image: ${error.message}`;
    }
  };

  return {
    getImageLink,
    getImageParams,
    createImageTooltip,
    cloneImage,
    isImg2ImgImage,
    isUpscaledImage,
    hasCustomSteps,
    openImageInNewWindow,
    sendToEditor,
    sendToControlNet,
    sendProcessedToControlNet,
    sendToInpaint,
    sendToImg2Img,
    canCopyImage,
    copyImage
  };
}
