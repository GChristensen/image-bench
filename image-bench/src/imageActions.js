import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {flashTrayTab} from "@/components/utils.js";
import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY} from "@/consts.js";
import {dialog} from "@/dialogs/useDialog.js";
import {hostHas, isWebUI} from "@/host.js";
import {ensureGenerationIdle} from "@/sdwebui.js";

/**
 * Actions on a single image, defined once for the image card, its context menu and the keys on a hovered card.
 * The overlay's button row is separate; the overlay uses these actions only in its context menu and keys.
 *
 * The context of an action describes where the image is shown:
 *   {kind, isTray, upscalable, handlers}
 * handlers are the operations of the view that shows the image:
 *   showParams(image), upscale(image), addComment(image), openImage(image),
 *   filterMarking(marking), removeMarking(image), activeMarkingFilter()
 *
 * An action with `alt` has an alternative that runs on a middle click, a Shift+click or Shift+key.
 * visible(image, ctx) must cover both hosts.
 */

async function sendToControlNet(image) {
  const error = await useImageOperations().sendToControlNet(image);

  if (error)
    await dialog.alert(error, {title: "Send to ControlNet"});
  else
    flashTrayTab("controlnet-tab");
}

async function sendToPhotoshop(image, newDocument) {
  const error = await useImageOperations().sendToPhotoshop(image, newDocument);

  if (error)
    await dialog.alert(error, {title: "Send to Photoshop"});
}

async function generateVaryingSteps(image) {
  if (!await ensureGenerationIdle())
    return;

  const storage = useLocalStorage();
  const steps = await dialog.prompt("Apply step values:",
    {defaultValue: storage.getVaryingSteps(), storageKey: "varyingSteps", dropdown: true, historySize: 5});

  if (steps) {
    const generatedImagesStore = useGeneratedImagesStore();

    if (useAppConfigStore().automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    storage.setVaryingSteps(steps);
    useWebUIBridge().generateVaryingSteps(useImageOperations().cloneImage(image), steps);
  }
}

async function upscaleVaryingDenoising(image) {
  if (!await ensureGenerationIdle())
    return;

  const storage = useLocalStorage();
  const denoising = await dialog.prompt("Apply denoising values:",
    {defaultValue: storage.getVaryingDenoising(), storageKey: "varyingDenoising", dropdown: true, historySize: 5});

  if (denoising) {
    useUpscaledImagesStore().startingGeneration();

    storage.setVaryingDenoising(denoising);
    useWebUIBridge().upscaleVaryingDenoising(useImageOperations().cloneImage(image), denoising);
  }
}

async function reuseParameters(image, all) {
  if (!await ensureGenerationIdle())
    return;

  const parameters = useImageOperations().cloneImage(image).parameters;

  if (all)
    useWebUIBridge().setImageParams(parameters);
  else
    useWebUIBridge().setImageSeed(parameters);
}

/**
 * The card shows the groups of a side separated by a separator, in this order
 */
export const IMAGE_ACTIONS = [
  {
    id: "seed", side: "left", group: 0, icon: "seed", label: "Reuse seed", key: "S",
    alt: {icon: "sliders", label: "Reuse all parameters"},
    visible: image => !image.img2img,
    run: (image, ctx, alt) => reuseParameters(image, alt)
  },
  {
    id: "params", side: "left", group: 0, icon: "params", label: "Generation parameters", key: "I",
    visible: () => true,
    run: (image, ctx) => ctx.handlers.showParams?.(image)
  },
  {
    id: "comment", side: "left", group: 0, icon: "comment", label: "Comment", key: "C",
    visible: (image, ctx) => ctx.isTray,
    run: (image, ctx) => ctx.handlers.addComment?.(image)
  },
  {
    id: "steps", side: "left", group: 1, icon: "steps", label: "Generate with steps", key: "G",
    visible: (image, ctx) => ctx.isTray && !image.img2img,
    run: image => generateVaryingSteps(image)
  },
  {
    id: "upscale", side: "left", group: 1, icon: "upscale", label: "Upscale with the current WebUI settings", key: "U",
    visible: (image, ctx) => isWebUI && ctx.upscalable && !image.img2img,
    run: (image, ctx) => ctx.handlers.upscale?.(image)
  },
  {
    id: "denoising", side: "left", group: 1, icon: "denoise", label: "Upscale with denoising", key: "D",
    visible: (image, ctx) => isWebUI && ctx.isTray && !image.img2img,
    run: image => upscaleVaryingDenoising(image)
  },
  {
    id: "controlnet", side: "right", group: 2, icon: "controlnet", label: "Send to ControlNet", key: "N",
    visible: () => hostHas("images", "sendToControlNet"),
    run: image => sendToControlNet(image)
  },
  {
    id: "photoshop", side: "right", group: 2, icon: "external", label: "Send to Photoshop", key: "P",
    alt: {icon: "filePlus", label: "Send to Photoshop as a new document"},
    visible: () => true,
    run: (image, ctx, alt) => sendToPhotoshop(image, alt)
  },
  {
    id: "conceptTray", side: "right", group: 3, icon: "concept", label: "Add to concept tray", key: "Y",
    visible: (image, ctx) => !ctx.isTray || ctx.kind === KIND_IMAGE_TRAY,
    run: image => {
      useConceptTrayStore().addImage(image);
      flashTrayTab("concept-tray-tab");
    }
  },
  {
    id: "imageTray", side: "right", group: 3, icon: "palette", label: "Add to image tray", key: "T",
    visible: (image, ctx) => !ctx.isTray || ctx.kind === KIND_CONCEPT_TRAY,
    run: image => {
      useImageTrayStore().addImage(image);
      flashTrayTab("image-tray-tab");
    }
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

/**
 * Text shown on the card while the pointer is over the button of an action
 */
export function imageActionHint(action, alt = false) {
  if (alt && action.alt)
    return `${action.alt.label} · Shift+${action.key}`;

  let result = `${action.label} · ${action.key}`;

  if (action.alt)
    result += ` · Middle: ${action.alt.label[0].toLowerCase()}${action.alt.label.slice(1)}`;

  return result;
}

/**
 * Action of a key, matched by its physical key so that it works in any keyboard layout
 */
export function findImageActionByCode(code) {
  return IMAGE_ACTIONS.find(action => code === "Key" + action.key);
}
