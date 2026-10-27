import {HOST_NAME} from "@/host.js";
import {shallowRef} from "vue";
import {visibleActionGroups, runImageAction} from "@/imageActions.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useProjectsStore} from "@/stores/projects.js";
import {toast} from "@/toast.js";
import {MARKINGS} from "@/consts.js";
import {isStill} from "@/media.js";
import {canPasteInfotext, copyInfotext, imageFileName, pasteInfotext} from "@/infotextClipboard.js";

/**
 * Context menu of an image (card or overlay) or of another item (openContextMenu), rendered by ImageContextMenu.vue,
 * which is mounted once in App.vue.
 * The state is module-level, so that one menu is open at a time.
 * {x, y, items}: items are {icon, label, hint, danger, run}, {separator: true} or {icon, label, submenu: [items]}
 * (submenu items are {icon, label, hint, run} or {separator: true})
 */
export const contextMenu = shallowRef(null);

export function closeContextMenu() {
  contextMenu.value = null;
}

export function isContextMenuOpen() {
  return !!contextMenu.value;
}

/**
 * Open a context menu of other items (e.g. the Library trees) at the pointer position
 * @param {MouseEvent} event
 * @param {Object[]} items - {icon, label, hint, danger, run} or {separator: true}
 */
export function openContextMenu(event, items) {
  event.preventDefault();
  contextMenu.value = {x: event.clientX, y: event.clientY, items};
}

/**
 * Open the context menu of an image at the pointer position
 * @param {MouseEvent} event - contextmenu event
 * @param {Object} image
 * @param {Object} ctx - action context (see imageActions.js)
 */
export function openImageMenu(event, image, ctx) {
  event.preventDefault();
  contextMenu.value = {x: event.clientX, y: event.clientY, items: imageMenuItems(image, ctx)};
}

function imageMenuItems(image, ctx) {
  const items = [];

  for (const group of visibleActionGroups(image, ctx)) {
    if (items.length)
      items.push({separator: true});

    for (const action of group) {
      items.push({icon: action.icon, label: action.label, hint: action.key,
        run: () => runImageAction(action, image, ctx)});

      if (action.alt)
        items.push({icon: action.alt.icon, label: action.alt.label, hint: "Shift+" + action.key,
          run: () => runImageAction(action, image, ctx, true)});
    }
  }

  const imageOps = useImageOperations();
  const others = [];

  if (ctx.handlers.openImage)
    others.push({icon: "external", label: "Open in new window", hint: "Middle-click",
      run: () => ctx.handlers.openImage(image)});

  // The clipboard takes PNG only
  if (isStill(image))
    others.push({icon: "copy", label: "Copy image", run: () => copyImage(image)});

  // The infotext of the file, or the one made from the prompt of a ComfyUI image
  if (isStill(image))
    others.push({icon: "params", label: "Copy infotext", run: () => copyInfotext(image)});

  // Into the PNG file, after asking (e.g. a final image exported by an editor without it)
  if (canPasteInfotext(image, ctx))
    others.push({icon: "paste", label: "Paste infotext…", run: () => pasteInfotext(image)});

  const projects = useProjectsStore();

  // Not from the Projects tab, whose images are in a project already
  if (ctx.kind !== "project" && projects.hasCurrent && projects.current.exists !== false)
    others.push({icon: "save", label: "Copy to project folder",
      run: () => copyToProject([image])});

  const markingMenu = markingSubmenu(image, ctx);

  if (markingMenu)
    others.push(markingMenu);

  if (others.length) {
    if (items.length)
      items.push({separator: true});

    items.push(...others);
  }

  // Removes the image from a view that only references it (Compare): not a deletion
  if (ctx.handlers.removeImage) {
    if (items.length)
      items.push({separator: true});

    items.push({icon: "close", label: ctx.removeLabel ?? "Remove", hint: "Del", run: () => ctx.handlers.removeImage(image)});
  }

  if (ctx.handlers.deleteImage) {
    if (items.length)
      items.push({separator: true});

    items.push({icon: "trash", label: "Delete", hint: "Del", danger: true, run: () => ctx.handlers.deleteImage(image)});
  }

  return items;
}

/**
 * Submenu of the markings where the view sets them (handlers.setMarking(image, marking|null)): the markings with
 * their keys, the current one checked, then showing only the marking and removing it
 */
function markingSubmenu(image, ctx) {
  const {setMarking, filterMarking} = ctx.handlers;
  const marking = image.marking;

  if (!setMarking && !(marking && filterMarking))
    return null;

  const submenu = [];

  if (setMarking)
    submenu.push(...MARKINGS.map((option, index) => ({icon: option === marking ? "check" : null, label: option,
      hint: String(index + 1), run: () => setMarking(image, option)})));

  if (marking) {
    if (submenu.length)
      submenu.push({separator: true});

    if (filterMarking) {
      const filtered = ctx.handlers.activeMarkingFilter?.() === marking;
      submenu.push({icon: "filter", label: filtered ? "Show all images" : `Show only ${marking}`,
        run: () => filterMarking(marking)});
    }

    submenu.push({icon: "eraser", label: "Remove marking", hint: setMarking ? "0" : null,
      run: () => setMarking ? setMarking(image, null) : ctx.handlers.removeMarking?.(image)});
  }

  return {icon: "tag", label: marking ? "Marking " + marking : "Marking", submenu};
}

/**
 * Save the image files into the folder of the current project at once, with one notice
 * (the context menu, and cards dropped on the project chip)
 * @param {Object[]} images
 */
export async function copyToProject(images) {
  const projects = useProjectsStore();
  const name = projects.current.name;
  const saved = [];

  try {
    for (const image of images) {
      const response = await fetch(useImageOperations().getImageLink(image));

      if (!response.ok)
        throw new Error(`Unable to read the image (${response.status}).`);

      const blob = await response.blob();
      const file = new File([blob], fileNameOf(image, blob.type), {type: blob.type});
      saved.push(await projects.addFile(file));
    }

    toast(saved.length === 1 ? `Copied to the folder of "${name}" as ${saved[0]}`
      : `Copied ${saved.length} images to the folder of "${name}"`);
  } catch (error) {
    const done = saved.length ? ` (${saved.length} of ${images.length} copied)` : "";
    toast(`Not copied to the folder of "${name}": ${error.message}${done}`, {kind: "error", duration: 6000});
  }
}

const EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/x-matroska": ".mkv",
  "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mpeg": ".mp3", "audio/flac": ".flac", "audio/ogg": ".ogg",
  "audio/mp4": ".m4a", "audio/aac": ".aac"};

/**
 * File name of an image (or video or audio file): that of its file (or of its /view URL), with the extension
 * of its type
 */
function fileNameOf(image, type) {
  const name = imageFileName(image) || "image";
  return /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|mkv|m4v|wav|mp3|flac|ogg|opus|m4a|aac)$/i.test(name) ? name : name.replace(/\.[^.]*$/, "") + (EXTENSIONS[type] ?? ".png");
}

async function copyImage(image) {
  const imageOps = useImageOperations();

  if (!imageOps.canCopyImage()) {
    await dialog.alert(
      `The browser puts images on the clipboard only for secure pages (https or localhost), and ${location.origin} `
      + `is not one. Run ${HOST_NAME} over https, e.g. with a self-signed certificate (the --tls-keyfile and `
      + `--tls-certfile command line arguments), and open it through https.

On the computer that runs ${HOST_NAME}, http://localhost works as it is.`,
      {title: "Copy image"});
    return;
  }

  const error = await imageOps.copyImage(image);

  if (error)
    await dialog.alert(error, {title: "Copy image"});
}
