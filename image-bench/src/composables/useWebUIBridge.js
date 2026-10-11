import { sendWebUIMessage } from '@/sdwebui.js';

/**
 * Composable for WebUI communication operations
 * Centralizes all WebUI message sending to avoid direct calls throughout components
 */
export function useWebUIBridge() {
  const initializePrompts = () => {
    sendWebUIMessage({ type: 'INITIALIZE_PROMPTS' });
  };

  const setImageSeed = (parameters) => {
    sendWebUIMessage({ type: 'SET_IMAGE_SEED', parameters });
  };

  const setImageParams = (parameters) => {
    sendWebUIMessage({ type: 'SET_IMAGE_PARAMS', parameters });
  };

  const upscaleImages = (images) => {
    const options = { type: 'UPSCALE_IMAGES', images };
    sendWebUIMessage(options);
  };

  // txt2img: switch WebUI to txt2img first (the Generate tab mirrors it)
  const batchGenerate = (nImagesToGenerate = 100, { txt2img = false } = {}) => {
    sendWebUIMessage({ type: 'BATCH_GENERATE', generateImages: nImagesToGenerate, txt2img });
  };

  // A single txt2img image with the current parameters, the popup stays on the Generate tab
  const generateImage = () => {
    sendWebUIMessage({ type: 'GENERATE_IMAGE' });
  };

  // Start or stop mirroring the txt2img parameters (WEBUI_PARAMS and LIVE_PROGRESS messages)
  const subscribeMirror = (active) => {
    sendWebUIMessage({ type: 'MIRROR_SUBSCRIBE', active });
  };

  const setWebUIParams = (params) => {
    sendWebUIMessage({ type: 'SET_WEBUI_PARAMS', params });
  };

  const reuseSeed = (which) => {
    sendWebUIMessage({ type: 'REUSE_SEED', which });
  };

  const lockWebUIPrompts = (locked) => {
    sendWebUIMessage({ type: 'LOCK_WEBUI_PROMPTS', locked });
  };

  const generateVariations = (strength, nImagesToGenerate = 100, { txt2img = false } = {}) => {
    sendWebUIMessage({ type: 'GENERATE_VARIATIONS', strength, generateImages: nImagesToGenerate, txt2img });
  };

  const generateVaryingSteps = (image, steps) => {
    sendWebUIMessage({ type: 'GENERATE_VARYING_STEPS', image, steps });
  };

  const upscaleVaryingDenoising = (image, denoising) => {
    sendWebUIMessage({ type: 'UPSCALE_VARYING_DENOISING', image, denoising });
  };

  const stopGeneration = () => {
    sendWebUIMessage({ type: 'STOP_GENERATION' });
  };

  // Skip the image being generated, WebUI continues with the next one of the batch
  const skipGeneration = () => {
    sendWebUIMessage({ type: 'SKIP_GENERATION' });
  };

  return {
    initializePrompts,
    setImageSeed,
    setImageParams,
    upscaleImages,
    batchGenerate,
    generateImage,
    subscribeMirror,
    setWebUIParams,
    reuseSeed,
    lockWebUIPrompts,
    generateVariations,
    generateVaryingSteps,
    upscaleVaryingDenoising,
    stopGeneration,
    skipGeneration
  };
}
