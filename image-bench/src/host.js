/**
 * Host platform of the popup ("webui" or "comfy") and the features of the views it supports.
 * A view shows a feature if it is enabled here and the host page does not report it missing
 * (the `features` map of WEBUI_PARAMS / CONTROLNET_STATE, see useFeatures.js).
 * ComfyUI has no fixed controls: the host page reports which parameters it found in the workflow.
 */

export const HOST = import.meta.env.MODE;

export const isWebUI = HOST === "webui";
export const isComfy = HOST === "comfy";

// Name of the host application shown in the views
export const HOST_NAME = isComfy ? "ComfyUI" : "WebUI";

const WEBUI_FEATURES = {
  generate: {
    modeSwitch: true,
    variations: true,
    variationSeed: true,
    uiPreset: true,
    // VAE / Text Encoder dropdown of Forge Neo, switched with the checkpoint dropdown
    modules: true,
    tokens: true,
    promptLock: true,
    img2imgOptions: true,
    referencesEnabled: true,
    referenceMaxSize: true
  },
  controlnet: {
    tabSwitch: true,
    independent: true,
    controlType: true,
    controlMode: true,
    resizeMode: true,
    allowPreview: true,
    clearImage: true,
    // Resolution and threshold sliders of the preprocessor
    preprocessorParams: true,
    // Editing the pose of openpose previews in sd-webui-openpose-editor
    openposeEditor: true
  },
  images: {
    sendToControlNet: true
  }
};

const COMFY_FEATURES = {
  generate: {
    modeSwitch: false,
    variations: false,
    variationSeed: false,
    uiPreset: false,
    modules: false,
    tokens: false,
    promptLock: false,
    img2imgOptions: false,
    referencesEnabled: false,
    referenceMaxSize: false
  },
  controlnet: {
    tabSwitch: false,
    independent: false,
    controlType: false,
    controlMode: false,
    resizeMode: false,
    allowPreview: false,
    clearImage: false,
    preprocessorParams: false,
    openposeEditor: false
  },
  images: {
    sendToControlNet: true
  }
};

export const HOST_FEATURES = isComfy ? COMFY_FEATURES : WEBUI_FEATURES;

/**
 * Whether the host supports a feature at all; features not listed are supported
 * @param {string} scope - generate, controlnet or images
 * @param {string} name
 * @returns {boolean}
 */
export function hostHas(scope, name) {
  return HOST_FEATURES[scope]?.[name] ?? true;
}
