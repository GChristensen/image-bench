/**
 * Parameters of the projects of the Library tab: the snapshot of the Generate and ControlNet tabs that the host page
 * takes when a project is saved (PROJECT_CAPTURE), and its check before it is restored (PROJECT_RESTORE).
 * Values this host does not have (a missing checkpoint, sampler, ControlNet model) are left out, so that the current
 * ones stay, and reported. A snapshot of the other host is mapped where the hosts have the same parameter:
 * samplers and schedulers by their names in either spelling, checkpoints and models by their file names.
 */
import {HOST, isComfy, isWebUI} from "@/host.js";
import {matchCheckpoint, matchChoice} from "@/infotext.js";
import {fetchModules, isModule, stripExtension} from "@/modules.js";

export const HOST_LABELS = {webui: "WebUI", comfy: "ComfyUI"};

// Parameters of the Generate tab that only WebUI has
const WEBUI_ONLY = {
  uiPreset: "UI preset",
  modules: "VAE / Text Encoder",
  subseed: "Variation seed",
  subseedStrength: "Variation strength",
  resizeMode: "Resize mode",
  maskMode: "Mask mode",
  inpaintArea: "Inpaint area",
  maskedContent: "Masked content",
  hiresFix: "Hires. fix checkbox"
};

const isSet = value => value !== undefined && value !== null && value !== "";

const IMAGE_EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"};

/**
 * Snapshot of the host page as the parameters saved in project.json and the ControlNet image files
 * @param {Object} snapshot - {mode, params, controlnet: {tab, units: [{index, params, image, mask, pose}]}, workflow}
 * @returns {{parameters: Object, workflow: Object|null, files: {name: string, blob: Blob}[]}}
 */
export function snapshotToSave(snapshot) {
  const files = [];

  const addFile = (blob, name) => {
    if (!blob)
      return null;

    const fileName = name + (IMAGE_EXTENSIONS[blob.type] ?? ".png");
    files.push({name: fileName, blob});
    return `controlnet/${fileName}`;
  };

  const units = (snapshot.controlnet?.units ?? []).map(unit => ({
    index: unit.index,
    params: unit.params,
    image: addFile(unit.image, `unit${unit.index}_image`),
    mask: addFile(unit.mask, `unit${unit.index}_mask`),
    pose: unit.pose ?? null
  }));

  return {
    parameters: {
      host: HOST,
      mode: snapshot.mode,
      params: snapshot.params ?? {},
      controlnet: {tab: snapshot.controlnet?.tab ?? "txt2img", units}
    },
    workflow: snapshot.workflow ?? null,
    files
  };
}

/**
 * Lists of the host to check the values of a snapshot against; null where the host gives none
 */
export async function fetchRestoreChoices() {
  const json = url => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);

  const [models, samplers, loras, controlnet, modules] = await Promise.all([
    json("/image-bench/models"),
    json("/image-bench/samplers"),
    json("/image-bench/loras"),
    json("/image-bench/controlnet/choices?type=All&all_models=true"),
    isWebUI ? fetchModules() : null
  ]);

  return {
    checkpoints: models?.map(model => model.title) ?? null,
    samplers: samplers?.samplers ?? null,
    schedulers: samplers?.schedulers ?? null,
    loras: loras?.map(lora => lora.name) ?? null,
    modules,
    preprocessors: controlnet?.preprocessors?.length ? controlnet.preprocessors : null,
    controlNetModels: controlnet?.models ?? null
  };
}

const loraKey = name => stripExtension(String(name).split(/[\\/]/).pop()).toLowerCase();

/**
 * Names of the LoRAs whose <lora:...> tags a prompt has
 * @param {string} prompt
 * @returns {string[]}
 */
function promptLoras(prompt) {
  return [...String(prompt ?? "").matchAll(/<lora:([^:>]+)[^>]*>/gi)].map(match => match[1]);
}

/**
 * Check the saved parameters of a project against the lists of this host
 * @param {Object} parameters - parameters of project.json
 * @param {Object} choices - From fetchRestoreChoices()
 * @returns {{mode: string, params: Object, units: Object[], notes: string[], crossHost: boolean}}
 */
export function prepareRestore(parameters, choices) {
  const source = parameters.host ?? HOST;
  const crossHost = source !== HOST;
  const notes = [];
  const params = Object.fromEntries(Object.entries(parameters.params ?? {}).filter(([, value]) => value !== null));

  if (crossHost && isComfy) {
    for (const [name, label] of Object.entries(WEBUI_ONLY)) {
      if (isSet(params[name]) && !(name === "modules" && !params[name]?.length) && name !== "hiresFix")
        notes.push(`${label}: WebUI only`);

      delete params[name];
    }
  }

  if (isSet(params.checkpoint) && choices.checkpoints) {
    const checkpoint = choices.checkpoints.includes(params.checkpoint)
      ? params.checkpoint
      : matchCheckpoint(params.checkpoint, undefined, choices.checkpoints);

    if (checkpoint)
      params.checkpoint = checkpoint;
    else {
      notes.push(`Checkpoint "${params.checkpoint}" is not available`);
      delete params.checkpoint;
    }
  }

  for (const [name, label, list] of [["sampler", "Sampler", choices.samplers], ["scheduler", "Scheduler", choices.schedulers]]) {
    if (!isSet(params[name]) || !list)
      continue;

    const choice = matchChoice(params[name], list);

    if (choice !== null)
      params[name] = choice;
    else {
      notes.push(`${label} "${params[name]}" has no ${HOST_LABELS[HOST]} equivalent`);
      delete params[name];
    }
  }

  if (Array.isArray(params.modules) && choices.modules) {
    const missing = params.modules.filter(name => !choices.modules.some(module => isModule(name, module.name)));

    if (missing.length) {
      notes.push(`VAE / Text Encoder ${missing.map(name => `"${name}"`).join(", ")} not available`);
      delete params.modules;
    }
  }

  // The prompt is restored as it is, a missing LoRA is only reported
  if (choices.loras) {
    const available = new Set(choices.loras.map(loraKey));

    for (const name of new Set(promptLoras(params.prompt)))
      if (!available.has(loraKey(name)))
        notes.push(`LoRA "${name}" is not available`);
  }

  if (crossHost && isWebUI && parameters.workflow)
    notes.push("Workflow: ComfyUI only");

  const units = (parameters.controlnet?.units ?? []).map(unit => prepareUnit(unit, choices, crossHost, notes));

  return {mode: parameters.mode ?? "txt2img", params, units, notes, crossHost};
}

function prepareUnit(unit, choices, crossHost, notes) {
  const params = Object.fromEntries(Object.entries(unit.params ?? {}).filter(([, value]) => value !== null));
  const label = `ControlNet unit ${unit.index + 1}`;

  // A ComfyUI unit has no control type; "All" lists all preprocessors and models in WebUI
  if (crossHost && isWebUI && !params.controlType)
    params.controlType = "All";

  if (isSet(params.preprocessor) && choices.preprocessors) {
    const preprocessor = matchChoice(params.preprocessor, choices.preprocessors);

    if (preprocessor !== null)
      params.preprocessor = preprocessor;
    else {
      notes.push(`${label}: preprocessor "${params.preprocessor}" is not available`);
      delete params.preprocessor;
    }
  }

  if (isSet(params.model) && params.model !== "None" && choices.controlNetModels) {
    const model = choices.controlNetModels.includes(params.model)
      ? params.model
      : matchCheckpoint(params.model, undefined, choices.controlNetModels);

    if (model)
      params.model = model;
    else {
      notes.push(`${label}: model "${params.model}" is not available`);
      delete params.model;
    }
  }

  return {...unit, params};
}

/**
 * Read the files of the ControlNet images of a project
 * @param {Object[]} units - Units of prepareRestore()
 * @param {(name: string) => string} fileUrl - URL of a file of ib_project
 * @returns {Promise<Object[]>} The units with the images as files, null where a file is missing
 */
export async function loadUnitFiles(units, fileUrl) {
  const load = async name => {
    if (!name)
      return null;

    try {
      const response = await fetch(fileUrl(name));
      return response.ok ? new File([await response.blob()], name.split("/").pop(), {type: response.headers.get("content-type") || "image/png"}) : null;
    } catch {
      return null;
    }
  };

  return Promise.all(units.map(async unit => ({...unit, image: await load(unit.image), mask: await load(unit.mask)})));
}

/**
 * Summary of the saved parameters shown in the Library: [label, value] pairs of the set ones
 * @param {Object} params
 * @returns {[string, string][]}
 */
export function summarizeParams(params = {}) {
  const rows = [];
  const add = (label, value) => isSet(value) && rows.push([label, String(value)]);

  add("Checkpoint", params.checkpoint);

  if (params.modules?.length)
    add("VAE / Text Encoder", params.modules.map(stripExtension).join(" + "));

  add("UI preset", params.uiPreset);
  add("Sampler", params.sampler);
  add("Scheduler", params.scheduler);
  add("Steps", params.steps);
  add("CFG", params.cfg);
  add("Shift / Distilled CFG", params.shift);

  if (isSet(params.width) && isSet(params.height))
    add("Size", `${params.width}×${params.height}`);

  add("Seed", params.seed);

  if (Number(params.subseedStrength) > 0)
    add("Variation", `${params.subseed} · ${params.subseedStrength}`);

  add("Denoising", params.denoising);

  if (params.hiresFix || (params.hiresFix === undefined && isSet(params.hiresScale) && params.hiresUpscaler))
    add("Hires. fix", [params.hiresScale && `${params.hiresScale}×`, params.hiresUpscaler,
                       params.hiresSteps && `${params.hiresSteps} steps`].filter(Boolean).join(" · "));

  return rows;
}
