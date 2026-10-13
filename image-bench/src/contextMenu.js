import {shallowRef} from "vue";
import {visibleActionGroups, runImageAction} from "@/imageActions.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {dialog} from "@/dialogs/useDialog.js";

/**
 * Context menu of an image (card or overlay), rendered by ImageContextMenu.vue, which is mounted once in App.vue.
 * The state is module-level, so that one menu is open at a time.
 * {x, y, items}: items are {icon, label, hint, danger, run}, {separator: true} or {label, submenu: [items]}
 */
export const contextMenu = shallowRef(null);

export function closeContextMenu() {
  contextMenu.value = null;
}

export function isContextMenuOpen() {
  return !!contextMenu.value;
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

  if (imageOps.canCopyImage())
    others.push({icon: "copy", label: "Copy image", run: () => copyImage(image)});

  if (image.marking && ctx.isTray && ctx.handlers.filterMarking) {
    const filtered = ctx.handlers.activeMarkingFilter?.() === image.marking;

    others.push({label: "Marking " + image.marking, submenu: [
      {icon: "filter", label: filtered ? "Show all images" : `Show only ${image.marking}`,
        run: () => ctx.handlers.filterMarking(image.marking)},
      {icon: "eraser", label: "Remove marking", hint: "Middle-click",
        run: () => ctx.handlers.removeMarking(image)}
    ]});
  }

  if (others.length) {
    if (items.length)
      items.push({separator: true});

    items.push(...others);
  }

  if (ctx.handlers.deleteImage) {
    if (items.length)
      items.push({separator: true});

    items.push({icon: "trash", label: "Delete", danger: true, run: () => ctx.handlers.deleteImage(image)});
  }

  return items;
}

async function copyImage(image) {
  const error = await useImageOperations().copyImage(image);

  if (error)
    await dialog.alert(error, {title: "Copy image"});
}
