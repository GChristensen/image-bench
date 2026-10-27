import {dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";

/**
 * Generation keys in any tab, text inputs included (so Ctrl+Backspace does not delete a word there): Ctrl+Enter
 * generates or stops, Ctrl+Shift+Enter stops and generates again, Ctrl+Backspace skips the image being generated.
 * Listened in the capture phase, before the handlers of the inputs. The Generate tab (kept alive) is the controller
 * {toggle(), restart(), skip()}; until it has been shown the keys do nothing. Not installed in the host iframe,
 * where WebUI and ComfyUI have their own Ctrl+Enter.
 */
let controller = null;
let installed = false;

export function setGenerationController(value) {
  controller = value;
}

export function clearGenerationController(value) {
  if (controller === value)
    controller = null;
}

function onKeydown(e) {
  const enter = e.code === "Enter" || e.code === "NumpadEnter";

  if (!enter && e.code !== "Backspace" || !(e.ctrlKey || e.metaKey) || e.altKey)
    return;

  if (!controller || dialogStack.value.length || isContextMenuOpen())
    return;

  e.preventDefault();

  if (e.repeat)
    return;

  if (!enter)
    controller.skip();
  else if (e.shiftKey)
    controller.restart();
  else
    controller.toggle();
}

/**
 * Install the key listener; called once from App.vue
 */
export function installGenerationKeys() {
  if (!installed) {
    installed = true;
    window.addEventListener("keydown", onKeydown, true);
  }
}
