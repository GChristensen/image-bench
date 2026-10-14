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

  // mode (from the Generate tab): show the WebUI tab of the mode first; null keeps the shown tab
  const batchGenerate = (nImagesToGenerate = 100, { mode } = {}) => {
    sendWebUIMessage({ type: 'BATCH_GENERATE', generateImages: nImagesToGenerate, mode });
  };

  // A single image with the current parameters of a mode, the popup stays on the Generate tab
  const generateImage = (mode = null) => {
    sendWebUIMessage({ type: 'GENERATE_IMAGE', mode });
  };

  // Show the WebUI tab of a generation mode and apply the parameters remembered for it (null: none)
  const setGenerationMode = (mode, params = null) => {
    sendWebUIMessage({ type: 'SET_GENERATION_MODE', mode, params });
  };

  // Open a saved ComfyUI workflow by its path, or switch to its tab if it is open
  const loadWorkflow = (path) => {
    sendWebUIMessage({ type: 'LOAD_WORKFLOW', path });
  };

  // Read the saved ComfyUI workflows again
  const syncWorkflows = () => {
    sendWebUIMessage({ type: 'SYNC_WORKFLOWS' });
  };

  // Put an image file into the input of the shown img2img mode
  const setInputImage = (kind, file) => {
    sendWebUIMessage({ type: 'SET_INPUT_IMAGE', kind, file });
  };

  // Edit the reference images of the shown WebUI tab: {add: File[]} | {remove: index} | {clear: true}
  const editReferences = (edit) => {
    sendWebUIMessage({ type: 'EDIT_REFERENCES', edit });
  };

  // Where images sent from Photoshop go: 'input' or 'reference'
  const setPhotoshopTarget = (target) => {
    sendWebUIMessage({ type: 'SET_PHOTOSHOP_TARGET', target });
  };

  // Start or stop mirroring a ControlNet unit (CONTROLNET_STATE and CONTROLNET_IMAGES messages);
  // the unit also receives the images sent to ControlNet from Photoshop
  const subscribeControlNet = (active, unit) => {
    sendWebUIMessage({ type: 'CONTROLNET_SUBSCRIBE', active, unit });
  };

  const setControlNetParams = (unit, params) => {
    sendWebUIMessage({ type: 'SET_CONTROLNET_PARAMS', unit, params });
  };

  // action: 'run' (the preprocessor), 'refresh' (the models), 'clearImage', 'clearMask' or 'clearPreview'
  const controlNetAction = (unit, action) => {
    sendWebUIMessage({ type: 'CONTROLNET_ACTION', unit, action });
  };

  // Put an image file into a ControlNet unit: kind 'image' or 'mask'
  const setControlNetImage = (unit, kind, file) => {
    sendWebUIMessage({ type: 'SET_CONTROLNET_IMAGE', unit, kind, file });
  };

  // Render a pose edited in the OpenPose editor (JSON data URL) into the preview of a ControlNet unit
  const setControlNetPose = (unit, pose) => {
    sendWebUIMessage({ type: 'SET_CONTROLNET_POSE', unit, pose });
  };

  // Show the WebUI generation tab whose ControlNet is mirrored: 'txt2img' or 'img2img'
  const setControlNetTab = (tab) => {
    sendWebUIMessage({ type: 'SET_CONTROLNET_TAB', tab });
  };

  // Start or stop mirroring the generation parameters (WEBUI_PARAMS, INPUT_IMAGES and LIVE_PROGRESS messages)
  const subscribeMirror = (active) => {
    sendWebUIMessage({ type: 'MIRROR_SUBSCRIBE', active });
  };

  // Refresh the checkpoint and LoRA lists of the host UI
  const refreshModels = () => {
    sendWebUIMessage({ type: 'REFRESH_MODELS' });
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

  const generateVariations = (strength, nImagesToGenerate = 100, { mode } = {}) => {
    sendWebUIMessage({ type: 'GENERATE_VARIATIONS', strength, generateImages: nImagesToGenerate, mode });
  };

  const generateVaryingSteps = (image, steps) => {
    sendWebUIMessage({ type: 'GENERATE_VARYING_STEPS', image, steps });
  };

  // Generate an image again with each set of VAE / Text Encoder modules (file names)
  const generateVaryingModules = (image, moduleSets) => {
    sendWebUIMessage({ type: 'GENERATE_VARYING_MODULES', image, moduleSets });
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
    setGenerationMode,
    loadWorkflow,
    syncWorkflows,
    setInputImage,
    editReferences,
    setPhotoshopTarget,
    subscribeMirror,
    subscribeControlNet,
    setControlNetParams,
    controlNetAction,
    setControlNetImage,
    setControlNetPose,
    setControlNetTab,
    refreshModels,
    setWebUIParams,
    reuseSeed,
    lockWebUIPrompts,
    generateVariations,
    generateVaryingSteps,
    generateVaryingModules,
    upscaleVaryingDenoising,
    stopGeneration,
    skipGeneration
  };
}
