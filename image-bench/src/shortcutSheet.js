import {dialog, dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";
import {imageTargetKind, isTyping} from "@/composables/useImageActionKeys.js";
import {useManualStore} from "@/stores/manual.js";

/**
 * The cheat sheet of the mouse and the keys (dialog.shortcuts()): the ? key anywhere but in text inputs, and the
 * project chip menu. It starts at the section of what is under the pointer: the image view, a hovered card, the
 * Compare tab, else the mouse grammar.
 */
let router = null;
let installed = false;

function currentSection() {
  const target = imageTargetKind();

  if (target)
    return target;

  return router?.currentRoute.value.path === "/compare" ? "compare" : "mouse";
}

export async function showShortcuts(section = currentSection()) {
  if (await dialog.shortcuts({section}) === "manual") {
    useManualStore().reveal("input");
    router?.push("/library");
  }
}

function onKeydown(e) {
  if (e.code !== "Slash" || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat || isTyping(e)
      || dialogStack.value.length || isContextMenuOpen())
    return;

  e.preventDefault();
  showShortcuts();
}

/**
 * Install the ? key; called once from App.vue
 */
export function installShortcutSheetKey(appRouter) {
  router = appRouter;

  if (!installed) {
    installed = true;
    window.addEventListener("keydown", onKeydown);
  }
}
