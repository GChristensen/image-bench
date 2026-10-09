import { createImageLink, createImageGenerationParams } from '@/sdwebui.js';

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

    if (image.comment) {
      result += '💬 ' + image.comment + '\u000d\u000d';
    }

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
   * Send image to the Image Bench Photoshop plugin, which places it as a layer of the active document
   * @param {boolean} newDocument - Open the image as a new document even if there is an active one
   * @returns {Promise<string|null>} Error message, or null on success
   */
  const sendToPhotoshop = async (image, newDocument = false) => {
    try {
      const imageResponse = await fetch(createImageLink(image));

      if (!imageResponse.ok)
        return `Unable to read the image: ${imageResponse.status}`;

      const blob = await imageResponse.blob();
      const name = encodeURIComponent(image.imagePath || createImageLink(image));
      const response = await fetch(`/image-bench/photoshop/send?name=${name}&new_document=${newDocument}`, {
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
    sendToPhotoshop
  };
}
