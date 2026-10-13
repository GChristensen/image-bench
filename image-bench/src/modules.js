/**
 * VAE / Text Encoder modules of Forge Neo (the "VAE / Text Encoder" dropdown of WebUI).
 * The list comes from /image-bench/modules as [{name, kind}], kind "vae" or "te" by the folder of the file;
 * the infotext names a module without its file extension ("Module 1: ae").
 */

export const MODULE_KIND_LABELS = {vae: "VAE", te: "Text encoder"};

let modulesRequest = null;

/**
 * @param {boolean} reload - Request the list again (after the models were refreshed)
 * @returns {Promise<{name: string, kind: string}[]>}
 */
export function fetchModules(reload = false) {
  if (reload || !modulesRequest)
    modulesRequest = fetch("/image-bench/modules")
      .then(r => r.ok ? r.json() : [])
      .catch(() => {
        modulesRequest = null;
        return [];
      });

  return modulesRequest;
}

export const stripExtension = name => String(name).replace(/\.(safetensors|sft|gguf|ckpt|pt|pth|bin)$/i, "");

/**
 * Whether a module name (with or without the extension) is the file name of a module
 */
export const isModule = (name, fileName) => name === fileName || stripExtension(name) === stripExtension(fileName);

/**
 * @param {string[]|null} modules
 * @returns {string} Names without extensions joined by " + ", empty if none
 */
export function modulesSummary(modules) {
  return (modules ?? []).map(stripExtension).join(" + ");
}

/**
 * Modules of image parameters: the "Module 1", "Module 2", ... infotext entries, in their order
 * @param {Object} parameters - Image parameters, with lowercase keys
 * @returns {string[]} Names without the extension
 */
export function getImageModules(parameters) {
  return Object.keys(parameters ?? {})
    .map(key => key.match(/^module (\d+)$/))
    .filter(Boolean)
    .sort((a, b) => a[1] - b[1])
    .map(match => String(parameters[match[0]]));
}

const commonPrefixLength = (a, b) => {
  let i = 0;

  while (i < a.length && i < b.length && a[i] === b[i])
    i++;

  return i;
};

/**
 * Modules of an image with one text encoder replaced by another: the image's encoder most like the new one
 * (by the common start of the names), so that e.g. T5 is replaced and CLIP-L kept; added if the image has none
 * @param {string[]} imageModules - From getImageModules()
 * @param {string[]} encoderNames - Text encoder file names of /image-bench/modules
 * @param {string} encoder - File name of the new text encoder
 * @returns {string[]}
 */
export function replaceTextEncoder(imageModules, encoderNames, encoder) {
  const encoderIndexes = imageModules
    .map((name, index) => encoderNames.some(fileName => isModule(name, fileName)) ? index : -1)
    .filter(index => index !== -1);

  if (!encoderIndexes.length)
    return [...imageModules, encoder];

  const target = encoder.toLowerCase();
  const replaced = encoderIndexes.reduce((best, index) =>
    commonPrefixLength(imageModules[index].toLowerCase(), target) > commonPrefixLength(imageModules[best].toLowerCase(), target)
      ? index : best);

  return imageModules.map((name, index) => index === replaced ? encoder : name);
}
