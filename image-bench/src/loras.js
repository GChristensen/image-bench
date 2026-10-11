import {isComfy} from "@/host.js";

/**
 * LoRA prompt strings, shared by the Explore and Generate tabs
 * A LoRA is {name, preferredWeight?, activationText?} as returned by /image-bench/loras,
 * optionally with params: {weight?, text?} set in the Explore tab
 */

export function getLoraDefaults(lora) {
  return {
    weight: lora?.preferredWeight ?? 1,
    text: lora?.activationText ?? ""
  };
}

export function getLoraWeight(lora) {
  return lora.params?.weight ?? getLoraDefaults(lora).weight;
}

/**
 * Build the prompt string of a LoRA: <lora:name:weight> followed by the extra text
 * The file name is used rather than the alias: aliases come from the ss_output_name metadata,
 * which trainers often leave generic (e.g. AI Toolkit's "aitk_lora"), and WebUI rejects shared aliases
 * ComfyUI explores the LoRA in the node marked ib:lora, so its prompt string there is only the extra text;
 * the Generate tab always writes the tag, which the Image Bench Prompt node applies in ComfyUI
 * @param {Object} lora
 * @param {{tag?: boolean}} options - tag: include the <lora:...> tag
 */
export function createLoraPrompt(lora, {tag = !isComfy} = {}) {
  const text = lora.params?.text ?? getLoraDefaults(lora).text;

  if (!tag)
    return text;

  return `<lora:${lora.name}:${getLoraWeight(lora)}>` + (text ? ` ${text}` : "");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// <lora:name> or <lora:name:weight...> of the given LoRA (case-insensitive, as WebUI matches names)
function loraTagPattern(name, flags = "i") {
  return new RegExp(`<lora:${escapeRegExp(name)}(?::[^>]*)?>`, flags);
}

/**
 * Whether the prompt contains a <lora:...> tag of the LoRA
 * @param {string} prompt
 * @param {string} name - LoRA name
 * @returns {boolean}
 */
export function hasLoraTag(prompt, name) {
  return loraTagPattern(name).test(prompt || "");
}

/**
 * Append the prompt string of a LoRA to the prompt, separated by a comma
 * @param {string} prompt
 * @param {Object} lora
 * @returns {string}
 */
export function addLoraToPrompt(prompt, lora) {
  const trimmed = (prompt || "").replace(/[\s,]+$/, "");
  return (trimmed ? `${trimmed}, ` : "") + createLoraPrompt(lora, {tag: true});
}

/**
 * Remove all <lora:...> tags of a LoRA from the prompt, with the extra text that follows a tag
 * if it is the one added by addLoraToPrompt(), and the separator left behind
 * @param {string} prompt
 * @param {Object} lora
 * @returns {string}
 */
export function removeLoraFromPrompt(prompt, lora) {
  const text = lora.params?.text ?? getLoraDefaults(lora).text;
  const tag = loraTagPattern(lora.name, "").source;
  const withText = text ? `(?:\\s*${escapeRegExp(text)})?` : "";

  return (prompt || "")
    .replace(new RegExp(`(?:,\\s*)?${tag}${withText}|${tag}${withText}(?:\\s*,)?`, "gi"), "")
    .replace(/^[\s,]+/, "")
    .replace(/[ \t]+$/gm, "");
}
