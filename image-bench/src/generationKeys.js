import {dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";
import {findKey, matchesKey} from "@/shortcuts.js";

/**
 * Generation keys in any tab, text inputs included (so Ctrl+Shift+Backspace skips there too): Ctrl+Enter
 * generates or stops, Ctrl+Shift+Enter stops and generates again, Ctrl+Shift+Backspace skips the image being generated.
 * Listened in the capture phase, before the handlers of the inputs. The Generate tab (kept alive) is the controller
 * {toggle(), restart(), skip()}; until it has been shown the keys do nothing. Not installed in the host iframe,
 * where WebUI and ComfyUI have their own Ctrl+Enter. The keys are the entries of shortcuts.js.
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

const KEYS = [
  [findKey("generate"), () => controller.toggle()],
  [findKey("restart"), () => controller.restart()],
  [findKey("skip"), () => controller.skip()]
];

function onKeydown(e) {
  const run = KEYS.find(([entry]) => matchesKey(entry, e))?.[1];

  if (!run || !controller || dialogStack.value.length || isContextMenuOpen())
    return;

  e.preventDefault();

  if (!e.repeat)
    run();
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
