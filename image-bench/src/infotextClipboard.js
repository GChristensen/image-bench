/**
 * Copy infotext and Paste infotext of the image context menu (contextMenu.js).
 * Copy takes the infotext of the image file as /image-bench/png_info reads it (the infotext of WebUI, or the one made
 * from the prompt of a ComfyUI image), else one written from the image parameters. Paste asks, then writes the text
 * into the "parameters" chunk of the PNG file on the server (e.g. a final image exported by an editor without it)
 * and gives the image the parameters parsed from it.
 */
import {toRaw} from "vue";
import {dialog} from "@/dialogs/useDialog.js";
import {toast} from "@/toast.js";
import {fetchImageInfo} from "@/infotext.js";
import {isStill} from "@/media.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useSessionImagesStore} from "@/stores/session.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useCompareStore} from "@/stores/compare.js";
import {useProjectsStore} from "@/stores/projects.js";

// Parameters of the images that are not a part of the infotext
const INTERNAL_KEYS = new Set(["prompt", "negative prompt", "prompt_id"]);

// Words that WebUI writes in capitals in the parameter names
const CAPITALS = new Set(["cfg", "vae", "ensd", "rng", "ti", "ngms"]);

/**
 * File name of an image: that of its file, or of its /view URL
 * @param {Object} image
 * @returns {string}
 */
export function imageFileName(image) {
  const name = String(image.imagePath || "").split(/[\\/]/).pop();

  if (name)
    return name;

  try {
    const url = new URL(image.imageUrl, location.href);
    return url.searchParams.get("filename") || url.searchParams.get("name") || url.pathname.split("/").pop();
  } catch {
    return "";
  }
}

// "cfg scale" → "CFG scale", "distilled cfg scale" → "Distilled CFG Scale" (as Forge writes it)
function parameterName(key) {
  if (key === "distilled cfg scale")
    return "Distilled CFG Scale";

  const words = key.split(" ").map(word => CAPITALS.has(word) ? word.toUpperCase() : word);
  return words.join(" ").charAt(0).toUpperCase() + words.join(" ").slice(1);
}

// Values with a separator are quoted; nested parameters (e.g. Lora hashes) are "key: value, ..." in quotes
function parameterValue(value) {
  const text = value && typeof value === "object"
    ? Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(", ")
    : String(value);

  return value && typeof value === "object" || /[,:"]/.test(text) ? JSON.stringify(text) : text;
}

/**
 * Infotext of image parameters in the format of WebUI: prompt, negative prompt, then the parameter line
 * @param {Object} parameters - Lowercase keys of the image trays
 * @returns {string} Empty without parameters
 */
export function parametersToInfotext(parameters) {
  if (!parameters || !Object.keys(parameters).length)
    return "";

  const lines = [parameters["prompt"] ?? ""];

  if (parameters["negative prompt"])
    lines.push("Negative prompt: " + parameters["negative prompt"]);

  const items = Object.entries(parameters)
    .filter(([key, value]) => !INTERNAL_KEYS.has(key) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${parameterName(key)}: ${parameterValue(value)}`);

  if (items.length)
    lines.push(items.join(", "));

  return lines.join("\n");
}

/**
 * Put text on the clipboard, through the selection of a hidden textarea where the Clipboard API is refused (a page
 * that is not secure)
 * @param {string} text
 * @returns {Promise<boolean>} Whether it was copied
 */
export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not a secure page: the selection of a hidden textarea
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * Put the infotext of an image on the clipboard: that of its file, else one written from its parameters
 * @param {Object} image
 */
export async function copyInfotext(image) {
  const title = "Copy infotext";
  let text = "";

  try {
    const response = await fetch(useImageOperations().getImageLink(image));

    if (response.ok) {
      const blob = await response.blob();
      text = (await fetchImageInfo(new File([blob], imageFileName(image) || "image.png", {type: blob.type}))).infotext;
    }
  } catch {
    // The parameters of the image are written instead
  }

  text = text?.trim() || parametersToInfotext(image.parameters);

  if (!text) {
    await dialog.alert("The image has no generation parameters.", {title});
    return;
  }

  if (await writeClipboard(text))
    toast("Infotext copied");
  else
    await dialog.alert("The browser refused to copy the text.", {title});
}

/**
 * Whether the infotext can be written into the file of an image: a PNG file of the output directories or of a
 * project folder (the images of the saved trays of a project are in archives)
 * @param {Object} image
 * @param {Object} ctx - Action context
 */
export function canPasteInfotext(image, ctx) {
  if (!isStill(image) || ctx.kind === "project" && !image.projectFile)
    return false;

  return /\.png$/i.test(image.projectFile?.name ?? imageFileName(image));
}

async function postInfotext(body) {
  const response = await fetch("/image-bench/infotext", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });

  let result = null;

  try {
    result = await response.json();
  } catch {
    // Not JSON: an error page
  }

  if (!response.ok || !result || result.error)
    throw new Error(result?.error || `The request failed (${response.status}).`);

  return result;
}

// New parameters of an image, keeping the prompt id of a ComfyUI image (the name of its tray copies)
function withPromptId(previous, parameters) {
  return previous?.prompt_id ? {...parameters, prompt_id: previous.prompt_id} : parameters;
}

// The copies of the image object in the image views (the same file) are given its new parameters
function updateStoredImages(image, parameters) {
  const stores = [useGeneratedImagesStore(), useUpscaledImagesStore(), useExploreImagesStore(),
    useSessionImagesStore(), useImageTrayStore(), useConceptTrayStore(), useCompareStore()];

  const target = toRaw(image);
  const isTarget = item => toRaw(item) === target || target.imagePath && toRaw(item).imagePath === target.imagePath;

  for (const store of stores) {
    let changed = false;

    // Explore keeps the images in groups by model
    for (const item of store.images.flatMap(item => item.images ?? [item])) {
      if (isTarget(item)) {
        item.parameters = withPromptId(item.parameters, parameters);
        changed = true;
      }
    }

    if (changed) {
      store.images = [...store.images];
      store.persist?.();
    }
  }
}

/**
 * Write an infotext into the PNG file of an image, after asking with the text of the clipboard (editable)
 * @param {Object} image
 */
export async function pasteInfotext(image) {
  const title = "Paste infotext";
  const name = image.projectFile?.name ?? imageFileName(image);
  const clipboard = await readClipboard();
  const replaces = image.parameters && Object.keys(image.parameters).length > 0;

  let message = `The infotext is written into "${name}"`
    + (replaces ? ", replacing its current generation parameters." : ".");

  if (clipboard === null)
    message += "\n\nThe clipboard could not be read: paste the text with Ctrl+V.";

  const infotext = await dialog.prompt(message, {title, multiline: true, defaultValue: clipboard ?? "",
    placeholder: "Infotext: prompt, Negative prompt: …, Steps: …", okText: "Write infotext"});

  if (!infotext)
    return;

  try {
    let result;

    if (image.projectFile)
      result = await useProjectsStore().writeInfotext(image.projectFile.project, image.projectFile.name, infotext);
    else {
      result = await postInfotext({imagePath: image.imagePath, imageUrl: image.imageUrl, infotext});
      updateStoredImages(image, result.parameters);
    }

    // An image shown by itself (the Generate tab's result, the overlay)
    image.parameters = withPromptId(image.parameters, result.parameters);
    toast(`Infotext written into ${name}`);
  } catch (error) {
    await dialog.alert(error.message, {title});
  }
}
