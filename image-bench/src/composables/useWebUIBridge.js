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

  const batchGenerate = (nImagesToGenerate = 100) => {
    sendWebUIMessage({ type: 'BATCH_GENERATE', generateImages: nImagesToGenerate });
  };

  const generateVariations = (strength, nImagesToGenerate = 100) => {
    sendWebUIMessage({ type: 'GENERATE_VARIATIONS', strength, generateImages: nImagesToGenerate });
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

  return {
    initializePrompts,
    setImageSeed,
    setImageParams,
    upscaleImages,
    batchGenerate,
    generateVariations,
    generateVaryingSteps,
    upscaleVaryingDenoising,
    stopGeneration
  };
}
