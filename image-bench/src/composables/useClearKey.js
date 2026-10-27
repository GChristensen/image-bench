import {onActivated, onDeactivated} from "vue";
import {dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";

function isTyping(e) {
  const element = e.target;
  return element instanceof HTMLElement
    && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

/**
 * Shift+Del runs the Clear of the shown view (it confirms itself). The listener is active only while the view is,
 * since the views are kept alive and one component serves several tabs; isBlocked() tells the view's own overlays.
 */
export function useClearKey(clear, isBlocked = () => false) {
  function onKeydown(e) {
    if (e.code !== "Delete" || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat || isTyping(e)
        || dialogStack.value.length || isContextMenuOpen() || isBlocked())
      return;

    e.preventDefault();
    clear();
  }

  onActivated(() => window.addEventListener("keydown", onKeydown));
  onDeactivated(() => window.removeEventListener("keydown", onKeydown));
}
