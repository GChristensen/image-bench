import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useCompareStore} from "@/stores/compare.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {useGenerationSettingsStore} from "@/stores/generationSettings.js";
import {flashTrayTab} from "@/components/utils.js";
import {toRaw} from "vue";
import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_COMPARE} from "@/consts.js";
import {dialog} from "@/dialogs/useDialog.js";
import {toast, toastError} from "@/toast.js";
import {addWithUndo} from "@/undo.js";
import {HOST_NAME, hostHas, isComfy, isWebUI} from "@/host.js";
import {createImageLink, ensureGenerationIdle, sendWebUIMessage} from "@/sdwebui.js";
import {fetchModules, getImageModules, isModule, replaceTextEncoder, stripExtension} from "@/modules.js";
import {editorIcon, editorName} from "@/editor.js";
import {KIND_AUDIO, KIND_VIDEO, isStill, mediaKind} from "@/media.js";

/**
 * Actions on a single image, defined once for the image card, its context menu and the keys on a hovered card.
 * The overlay's button row is separate; the overlay uses these actions only in its context menu and keys.
 *
 * The context of an action describes where the image is shown:
 *   {kind, isTray, upscalable, handlers}
 * handlers are the operations of the view that shows the image:
 *   showParams(image), upscale(image), addComment(image), openImage(image),
 *   filterMarking(marking), removeMarking(image), activeMarkingFilter(), deleteImage(image)
 *
 * An action with `alt` has an alternative that runs on a middle click, a Shift+click or Shift+key.
 * visible(image, ctx) must cover both hosts. An action of one host only has `available` false on the other, so that
 * the cheat sheet (ShortcutTables.vue) leaves it out.
 * An action with `rim: false` is left out of the action rim (it stays in the context menu and on its key).
 * An action with `bulk(images, ctx)` is also a button of the toolbar of the checked images (bulkActions()), labelled
 * `bulkLabel`; it gets only the checked images its visible() accepts.
 */

// Colors of the action groups (by group index) on the action rim and the buttons of the checked images
export const ACTION_GROUP_COLORS = ["#7aa2ff", "#ffb547", "#c084fc", "#34d399"];

async function sendToControlNet(image) {
  const error = await useImageOperations().sendToControlNet(image);

  if (error)
    toastError(error, {title: "Send to ControlNet"});
  else
    flashTrayTab("controlnet-tab");
}

// The video goes into the node marked ib:ext of the workflow, whose last frames start the next generation
function extendVideo(image) {
  sendWebUIMessage({type: "SET_CONTINUATION", url: createImageLink(image)});
  flashTrayTab("generate-tab");
}

export const INPAINT_LABEL = isWebUI ? "Send to the inpaint upload image" : "Send to the input image (ib:img)";

export async function sendToInpaint(image) {
  const error = await useImageOperations().sendToInpaint(image);

  if (error)
    toastError(error, {title: INPAINT_LABEL});
  else
    flashTrayTab("generate-tab");
}

export async function sendToImg2Img(image) {
  const error = await useImageOperations().sendToImg2Img(image);

  if (error)
    toastError(error, {title: "Send to img2img"});
  else
    flashTrayTab("generate-tab");
}

async function sendToEditor(image, newDocument) {
  const error = await useImageOperations().sendToEditor(image, newDocument);

  if (error)
    toastError(error, {title: `Send to ${editorName.value}`});
}

async function generateVaryingSteps(image) {
  if (!await ensureGenerationIdle())
    return;

  const settings = useGenerationSettingsStore();
  const steps = await dialog.prompt("Apply step values:",
    {defaultValue: settings.settings.varyingSteps, storageKey: "varyingSteps", dropdown: true, historySize: 5});

  if (steps) {
    const generatedImagesStore = useGeneratedImagesStore();

    if (useAppConfigStore().automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    settings.set("varyingSteps", steps);
    useWebUIBridge().generateVaryingSteps(useImageOperations().cloneImage(image), steps);
  }
}

/**
 * Generate the image again with each text encoder checked in a dialog (Forge Neo); the other modules are kept.
 * The dialog lists the encoders whose names start like the image's own one, which is checked
 */
async function generateVaryingTextEncoders(image) {
  if (!await ensureGenerationIdle())
    return;

  const title = "Generate with text encoders";
  const encoders = (await fetchModules()).filter(module => module.kind === "te").map(module => module.name);

  if (!encoders.length) {
    await dialog.alert("WebUI lists no text encoder files (models/text_encoder).", {title});
    return;
  }

  const imageModules = getImageModules(image.parameters);
  const imageEncoders = encoders.filter(fileName => imageModules.some(name => isModule(name, fileName)));
  const filter = imageEncoders.length ? (/^[a-z0-9]+/i.exec(stripExtension(imageEncoders[0]))?.[0] ?? "").toLowerCase() : "";

  // The encoders checked last time, of the same kind as the image's
  const settings = useGenerationSettingsStore();
  const remembered = (settings.settings.varyingTextEncoders ?? [])
    .filter(name => encoders.includes(name) && name.toLowerCase().includes(filter));

  const chosen = await dialog.checklist(
    "The image is generated again with each checked text encoder, its VAE and other modules are kept.",
    {
      title,
      items: encoders.map(name => ({value: name, label: stripExtension(name), note: imageEncoders.includes(name) ? "image" : ""})),
      selected: [...new Set([...imageEncoders, ...remembered])],
      filter,
      okText: count => count > 0 ? `Generate ${count}` : "Generate"
    });

  if (!chosen)
    return;

  settings.set("varyingTextEncoders", chosen);

  const generatedImagesStore = useGeneratedImagesStore();

  if (useAppConfigStore().automaticallyClearGeneratedImages)
    generatedImagesStore.clear();

  generatedImagesStore.startingGeneration();

  const moduleSets = chosen.map(encoder => replaceTextEncoder(imageModules, encoders, encoder));
  useWebUIBridge().generateVaryingModules(useImageOperations().cloneImage(image), moduleSets);
}

// The checked images of a view are upscaled one after another into the Upscaled tab
async function upscaleImages(images) {
  if (!await ensureGenerationIdle())
    return;

  useUpscaledImagesStore().startingGeneration();
  useWebUIBridge().upscaleImages(images.map(image => useImageOperations().cloneImage(image)));
}

// The undo of the addition, or null if the image was in the collection already (shown by the overlays' notices)
function addToCollection(store, image, tabId) {
  const undo = addWithUndo(store, image);
  flashTrayTab(tabId);
  return undo;
}

// Images are added to a collection one by one, as they would be from their cards
async function addImages(store, images, tabId) {
  for (const image of images)
    await store.addImage(toRaw(image));

  flashTrayTab(tabId);
}

async function upscaleVaryingDenoising(image) {
  if (!await ensureGenerationIdle())
    return;

  const settings = useGenerationSettingsStore();
  const denoising = await dialog.prompt("Apply denoising values:",
    {defaultValue: settings.settings.varyingDenoising, storageKey: "varyingDenoising", dropdown: true, historySize: 5});

  if (denoising) {
    useUpscaledImagesStore().startingGeneration();

    settings.set("varyingDenoising", denoising);
    useWebUIBridge().upscaleVaryingDenoising(useImageOperations().cloneImage(image), denoising);
  }
}

/**
 * Set the seed of an image, or all its parameters, in the host (from the parameters overlay), after asking,
 * since they replace the current ones
 * @returns {Promise<boolean>} Whether they were set
 */
export async function reuseParameters(image, all) {
  if (!await ensureGenerationIdle())
    return false;

  const title = all ? "Apply parameters" : "Apply seed";
  const message = all
    ? `Set the prompts and all generation parameters of this image in ${HOST_NAME}? The current ones are replaced.`
    : `Set the seed of this image in ${HOST_NAME}?`;

  if (!await dialog.confirm(message, {title, okText: title}))
    return false;

  const parameters = useImageOperations().cloneImage(image).parameters;

  if (all)
    useWebUIBridge().setImageParams(parameters);
  else
    useWebUIBridge().setImageSeed(parameters);

  return true;
}

// Images uploaded to the Compare tab or sent there from the editor may have no generation parameters
function hasParameters(image) {
  return !!image.parameters && Object.keys(image.parameters).length > 0;
}

export function canReuseParameters(image) {
  return !image.img2img && hasParameters(image);
}

/**
 * The arc of the action rim below the ring (ActionRim extras): reuse seed / all parameters
 */
export function rimReuseExtras(image) {
  return canReuseParameters(image) ? [
    {id: "reuseSeed", icon: "seed", label: "Reuse seed"},
    {id: "reuseAll", icon: "sliders", label: "Reuse all parameters"}
  ] : [];
}

// Runs an extra of rimReuseExtras()
export async function runRimReuseExtra(image, id) {
  const all = id === "reuseAll";

  if (await reuseParameters(image, all))
    toast(all ? `Parameters set in ${HOST_NAME}` : `Seed set in ${HOST_NAME}`);
}

/**
 * The card shows the groups of a side separated by a separator, in this order
 */
export const IMAGE_ACTIONS = [
  {
    id: "params", side: "left", group: 0, icon: "params", label: "Generation parameters", key: "I",
    visible: image => hasParameters(image),
    run: (image, ctx) => ctx.handlers.showParams?.(image)
  },
  {
    id: "comment", side: "left", group: 0, icon: "comment", label: "Comment", key: "C",
    visible: (image, ctx) => ctx.isTray || ctx.kind === KIND_COMPARE,
    run: (image, ctx) => ctx.handlers.addComment?.(image)
  },
  {
    id: "steps", side: "left", group: 1, icon: "steps", label: "Generate with steps", key: "G",
    visible: (image, ctx) => ctx.isTray && !image.img2img && mediaKind(image) !== KIND_AUDIO,
    run: image => generateVaryingSteps(image)
  },
  {
    id: "textEncoders", side: "left", group: 1, icon: "puzzle", label: "Generate with text encoders", key: "E",
    rim: false, available: isWebUI,
    visible: (image, ctx) => isWebUI && ctx.isTray && !image.img2img && hasParameters(image)
      && mediaKind(image) !== KIND_AUDIO,
    run: image => generateVaryingTextEncoders(image)
  },
  {
    id: "upscale", side: "left", group: 1, icon: "upscale", label: `Upscale with the current ${HOST_NAME} settings`, key: "U",
    bulkLabel: "Upscale",
    visible: (image, ctx) => ctx.upscalable && !image.img2img && isStill(image),
    run: (image, ctx) => ctx.handlers.upscale?.(image),
    bulk: images => upscaleImages(images)
  },
  {
    id: "denoising", side: "left", group: 1, icon: "denoise", label: "Upscale with denoising", key: "D",
    visible: (image, ctx) => ctx.isTray && !image.img2img && isStill(image),
    run: image => upscaleVaryingDenoising(image)
  },
  {
    id: "img2img", side: "right", group: 2, icon: "imageIn", label: "Send to img2img", key: "M",
    available: isWebUI,
    visible: image => isWebUI && isStill(image),
    run: image => sendToImg2Img(image)
  },
  {
    id: "inpaint", side: "right", group: 2, icon: "brush", label: INPAINT_LABEL, key: "B",
    shortLabel: isWebUI ? "Send to inpaint" : "Send to input image",
    visible: image => isStill(image),
    run: image => sendToInpaint(image)
  },
  {
    id: "controlnet", side: "right", group: 2, icon: "controlnet", label: "Send to ControlNet", key: "N",
    get available() { return hostHas("images", "sendToControlNet"); },
    visible: image => hostHas("images", "sendToControlNet") && isStill(image),
    run: image => sendToControlNet(image)
  },
  {
    id: "extend", side: "right", group: 2, icon: "video", label: "Extend video", key: "X",
    available: isComfy,
    visible: image => isComfy && mediaKind(image) === KIND_VIDEO,
    run: image => extendVideo(image)
  },
  {
    // Labelled by the connected editor (editor.js), so the label and icon are getters
    id: "editor", side: "right", group: 2, key: "P",
    get icon() { return editorIcon(); },
    get label() { return `Send to ${editorName.value} as a new document`; },
    get shortLabel() { return `${editorName.value} document`; },
    alt: {icon: "layers", get label() { return `Send to ${editorName.value} as a new layer`; },
      get shortLabel() { return `${editorName.value} layer`; }},
    visible: image => isStill(image),
    run: (image, ctx, alt) => sendToEditor(image, !alt)
  },
  {
    id: "compare", side: "right", group: 3, icon: "compare", label: "Add to compare", key: "A",
    bulkLabel: "Add to compare",
    visible: (image, ctx) => ctx.kind !== KIND_COMPARE && isStill(image),
    run: image => addToCollection(useCompareStore(), image, "compare-tab"),
    bulk: images => addImages(useCompareStore(), images, "compare-tab")
  },
  {
    id: "conceptTray", side: "right", group: 3, icon: "concept", label: "Add to concept tray", key: "Y",
    bulkLabel: "Concept tray",
    visible: (image, ctx) => !ctx.isTray || ctx.kind === KIND_IMAGE_TRAY,
    run: image => addToCollection(useConceptTrayStore(), image, "concept-tray-tab"),
    bulk: images => addImages(useConceptTrayStore(), images, "concept-tray-tab")
  },
  {
    id: "imageTray", side: "right", group: 3, icon: "palette", label: "Add to image tray", key: "T",
    bulkLabel: "Image tray",
    visible: (image, ctx) => !ctx.isTray || ctx.kind === KIND_CONCEPT_TRAY,
    run: image => addToCollection(useImageTrayStore(), image, "image-tray-tab"),
    bulk: images => addImages(useImageTrayStore(), images, "image-tray-tab")
  }
];

/**
 * Run an action; the alternative runs only if the action has one
 */
export function runImageAction(action, image, ctx, alt = false) {
  return action.run(image, ctx, alt && !!action.alt);
}

/**
 * The visible actions of a side as non-empty groups, so that separators are put only between groups
 * @returns {Array<Array<Object>>}
 */
export function visibleActionGroups(image, ctx, side = null) {
  const groups = [];

  for (const action of IMAGE_ACTIONS) {
    if (side && action.side !== side || !action.visible(image, ctx))
      continue;

    (groups[action.group] ??= []).push(action);
  }

  return groups.filter(group => group?.length);
}

// Clockwise order of the groups on the action rim of the image card, from the top: parameters, send, trays, generate
// (the card puts Delete between the trays and generate, at the bottom)
const RIM_GROUP_ORDER = [0, 2, 3, 1];

/**
 * The visible actions of the image card's action rim, as {index, actions} per group in rim order (groups may be empty)
 */
export function rimActionGroups(image, ctx) {
  const groups = [];

  for (const action of IMAGE_ACTIONS)
    if (action.rim !== false && action.visible(image, ctx))
      (groups[action.group] ??= []).push(action);

  return RIM_GROUP_ORDER.map(index => ({index, actions: groups[index] ?? []}));
}

/**
 * The actions of the toolbar of the checked images, in rim order: those with bulk() that accept one of the images
 * at least, each with the images it accepts
 * @returns {Array<{action: Object, images: Object[], color: string}>}
 */
export function bulkActions(images, ctx) {
  const result = [];

  for (const index of RIM_GROUP_ORDER)
    for (const action of IMAGE_ACTIONS) {
      if (action.group !== index || !action.bulk)
        continue;

      const accepted = images.filter(image => action.visible(image, ctx));

      if (accepted.length)
        result.push({action, images: accepted, color: ACTION_GROUP_COLORS[index]});
    }

  return result;
}

/**
 * Text shown on the card while the pointer is over the button of an action
 */
export function imageActionHint(action, alt = false) {
  if (alt && action.alt)
    return `${action.alt.label} · Shift+${action.key}`;

  let result = `${action.label} · ${action.key}`;

  if (action.alt)
    result += ` · Middle/Shift: ${action.alt.label[0].toLowerCase()}${action.alt.label.slice(1)}`;

  return result;
}

/**
 * Action of an id, for texts that name its key
 */
export function findImageAction(id) {
  return IMAGE_ACTIONS.find(action => action.id === id);
}

/**
 * Action of a key, matched by its physical key so that it works in any keyboard layout
 */
export function findImageActionByCode(code) {
  return IMAGE_ACTIONS.find(action => code === "Key" + action.key);
}
