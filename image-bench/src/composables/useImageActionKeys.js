import {findImageActionByCode, runImageAction} from "@/imageActions.js";
import {dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";
import {MARKINGS} from "@/consts.js";

/**
 * Keys of the image actions (imageActions.js), acting on the shown overlay image or else on the hovered card.
 * Targets are {getImage(), ctx, element, setMarking?(marking|null), view?()}; setMarking enables the digit keys
 * (1-9 set a marking, 0 removes it), view the V key on a hovered card (shows the image overlay).
 */
let hoveredTarget = null;
let overlayTarget = null;
let installed = false;

export function setHoveredImageTarget(target) {
  hoveredTarget = target;
}

export function clearHoveredImageTarget(element) {
  if (hoveredTarget?.element === element)
    hoveredTarget = null;
}

export function setOverlayImageTarget(target) {
  overlayTarget = target;
}

export function clearOverlayImageTarget(target) {
  if (overlayTarget === target)
    overlayTarget = null;
}

/**
 * What the keys would act on now: "overlay", "image" (a hovered card) or null; the cheat sheet starts there
 */
export function imageTargetKind() {
  return overlayTarget?.element?.isConnected ? "overlay" : isShown(hoveredTarget?.element) ? "image" : null;
}

export function isTyping(e) {
  const element = e.target;
  return element instanceof HTMLElement
    && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

// A card hovered on a tab that is no longer shown (KeepAlive) must not receive keys
function isShown(element) {
  return !!element?.isConnected && !!element.offsetParent;
}

function onKeydown(e) {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e)
      || dialogStack.value.length || isContextMenuOpen())
    return;

  // The overlay is fixed (no offsetParent); on a tab kept alive in the background it is detached
  const target = overlayTarget?.element?.isConnected ? overlayTarget
    : isShown(hoveredTarget?.element) ? hoveredTarget : null;

  if (!target)
    return;

  const digit = /^Digit(\d)$/.exec(e.code);

  if (digit) {
    const index = Number(digit[1]);

    if (target.setMarking && index <= MARKINGS.length) {
      e.preventDefault();
      target.setMarking(index ? MARKINGS[index - 1] : null);
    }

    return;
  }

  // V views the hovered card large, as a click on it does
  if (e.code === "KeyV" && !e.shiftKey && target === hoveredTarget && target.view) {
    e.preventDefault();
    target.view();
    return;
  }

  const image = target.getImage();

  // Del deletes the image where the view does (or removes it from a view that only references it)
  if (e.code === "Delete" && !e.shiftKey) {
    const remove = target.ctx.handlers.deleteImage ?? target.ctx.handlers.removeImage;

    if (remove && image) {
      e.preventDefault();
      remove(image);
    }

    return;
  }

  const action = findImageActionByCode(e.code);

  if (action && image && action.visible(image, target.ctx)) {
    e.preventDefault();
    runImageAction(action, image, target.ctx, e.shiftKey);
  }
}

/**
 * Install the key listener; called once from App.vue
 */
export function installImageActionKeys() {
  if (!installed) {
    installed = true;
    window.addEventListener("keydown", onKeydown);
  }
}
