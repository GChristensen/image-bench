/**
 * PNG Info of the Generate tab: the generation parameters of an image file (its infotext), read by the backend
 * (/image-bench/png_info), and their mapping to the parameters of the Generate tab, which applies them like edits.
 * Image parameters have the lowercase infotext keys of the image trays ("cfg scale", "size": "WxH", ...).
 */
import {getImageModules, isModule} from "@/modules.js";

/**
 * Groups of parameters applied together, chosen in the dialog
 */
export const PNG_INFO_GROUPS = [
  {id: "prompt", label: "Prompt"},
  {id: "negative", label: "Negative prompt"},
  {id: "model", label: "Model"},
  {id: "sampling", label: "Sampling"},
  {id: "size", label: "Size"},
  {id: "seed", label: "Seed"},
  {id: "hires", label: "Hires. fix"}
];

/**
 * Infotext and parameters of an image file
 * @param {File} file
 * @returns {Promise<{infotext: string, parameters: Object, width: number, height: number}>}
 * @throws {Error} If the file is not an image or the request fails
 */
export async function fetchImageInfo(file) {
  const body = new FormData();
  body.append("file", file, file.name || "image.png");

  const response = await fetch("/image-bench/png_info", {method: "post", body});

  if (!response.ok)
    throw new Error(`Unable to read the image (${response.status}).`);

  const result = await response.json();

  if (result.error)
    throw new Error(result.error);

  return result;
}

const stripHash = title => String(title).replace(/ \[[^\]]+\]$/, "");
const baseName = path => String(path).split(/[\\/]/).pop().replace(/\.(safetensors|sft|gguf|ckpt|pt|pth|bin)$/i, "");

/**
 * Checkpoint choice of an infotext model: by the short hash WebUI shows in the title, else by the file name
 * @param {string} model
 * @param {string|undefined} hash
 * @param {string[]} choices
 * @returns {string|null}
 */
function matchCheckpoint(model, hash, choices) {
  if (hash) {
    const byHash = choices.find(title => title.endsWith(` [${hash}]`));

    if (byHash)
      return byHash;
  }

  const name = baseName(model).toLowerCase();
  return choices.find(title => baseName(stripHash(title)).toLowerCase() === name) ?? null;
}

// "Euler a" / "euler_ancestral", "DPM++ 2M" / "dpmpp_2m" and the like have the same key
const choiceKey = value => String(value).toLowerCase()
  .replace(/\+\+/g, "pp")
  .replace(/ a$/, " ancestral")
  .replace(/[^a-z0-9]/g, "");

/**
 * Choice of a dropdown matching a value: the same, or the same name in another spelling (ComfyUI)
 * @param {string} value
 * @param {string[]|undefined} choices - Unknown choices take the value as it is
 * @returns {string|null}
 */
function matchChoice(value, choices) {
  if (!choices?.length)
    return value;

  const key = choiceKey(value);
  return choices.find(choice => choice === value) ?? choices.find(choice => choiceKey(choice) === key) ?? null;
}

const isSet = value => value !== undefined && value !== null && value !== "";

/**
 * Parameters of the Generate tab of image parameters, by group. A parameter is left out if the host or the
 * workflow does not have it; a value not available there is left out with a note.
 * @param {Object} parameters - Image parameters
 * @param {Object} ctx - {has, mode, sliderKind, checkpoints, samplers, schedulers, upscalers,
 *                        modules: available VAE / Text Encoder ([{name}]) or null without the dropdown}
 * @returns {Object<string, {values: Object, notes: string[]}>} By group id; groups without values are left out
 */
export function infotextToForm(parameters, ctx) {
  const {has} = ctx;
  const groups = {};

  const group = id => groups[id] ??= {values: {}, notes: []};

  const set = (id, name, value, feature = name) => {
    if (isSet(value) && has(feature))
      group(id).values[name] = value;
  };

  const setChoice = (id, name, value, choices, label) => {
    if (!isSet(value) || !has(name))
      return;

    const choice = matchChoice(value, choices);

    if (choice !== null)
      group(id).values[name] = choice;
    else
      group(id).notes.push(`${label} "${value}" is not available`);
  };

  set("prompt", "prompt", parameters["prompt"] ?? "");
  set("negative", "negativePrompt", parameters["negative prompt"] ?? "");

  // Model
  if (isSet(parameters["model"]) && has("checkpoint")) {
    const checkpoint = matchCheckpoint(parameters["model"], parameters["model hash"], ctx.checkpoints);

    if (checkpoint)
      group("model").values.checkpoint = checkpoint;
    else
      group("model").notes.push(`Checkpoint "${parameters["model"]}" is not available`);
  }

  // Images without modules keep those of the checkpoint's UI preset
  const modules = getImageModules(parameters);

  if (modules.length && ctx.modules && has("modules")) {
    const missing = modules.filter(name => !ctx.modules.some(module => isModule(name, module.name)));

    if (missing.length)
      group("model").notes.push(`VAE / Text Encoder ${missing.map(name => `"${name}"`).join(", ")} not available`);
    else
      group("model").values.modules = modules;
  }

  // Sampling
  setChoice("sampling", "sampler", parameters["sampler"], ctx.samplers, "Sampler");
  setChoice("sampling", "scheduler", parameters["schedule type"], ctx.schedulers, "Schedule type");
  set("sampling", "steps", parameters["steps"]);
  set("sampling", "cfg", parameters["cfg scale"]);

  // Forge writes the distilled CFG slider as Shift for flow models
  if (ctx.sliderKind)
    set("sampling", "shift", ctx.sliderKind === "distilledCfg"
      ? parameters["distilled cfg scale"] ?? parameters["shift"]
      : parameters["shift"] ?? parameters["distilled cfg scale"]);

  // Size
  const size = String(parameters["size"] ?? "").match(/^(\d+)x(\d+)$/);

  if (size) {
    set("size", "width", Number(size[1]), "size");
    set("size", "height", Number(size[2]), "size");
  }

  // Seed; an image without variations clears them, as WebUI omits them from the infotext
  set("seed", "seed", parameters["seed"]);

  if (has("variationSeed") && "seed" in parameters) {
    set("seed", "subseed", parameters["variation seed"] ?? -1);
    set("seed", "subseedStrength", parameters["variation seed strength"] ?? 0);
  }

  // Hires. fix of txt2img, enabled as the image has it; denoising of img2img and inpaint
  if (ctx.mode === "txt2img") {
    if (has("hires")) {
      const hiresFix = "hires upscale" in parameters;

      set("hires", "hiresFix", hiresFix);

      if (hiresFix) {
        setChoice("hires", "hiresUpscaler", parameters["hires upscaler"], ctx.upscalers, "Upscaler");
        set("hires", "hiresScale", parameters["hires upscale"]);
        set("hires", "hiresSteps", parameters["hires steps"] ?? 0);
        set("hires", "denoising", parameters["denoising strength"]);
      }
    }
  }
  else
    set("hires", "denoising", parameters["denoising strength"]);

  return groups;
}
