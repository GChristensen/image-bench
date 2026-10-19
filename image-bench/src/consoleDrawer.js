import {ref} from "vue";

/**
 * Whether the console drawer (ConsoleDrawer.vue, mounted once over the tab content by App.vue) is shown.
 * Not remembered: the socket of the drawer opens only when it is asked for
 */
export const consoleOpen = ref(false);

export function toggleConsole() {
  consoleOpen.value = !consoleOpen.value;
}

/**
 * Ctrl+` toggles the console in any tab, also in text inputs and in the host page of the host tab (HostFrame.vue),
 * where it takes the place of ComfyUI's own binding of the key to its logs panel. Matched by e.code, so it works in
 * any layout
 */
export function onConsoleKey(e) {
  if (e.code !== "Backquote" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey)
    return;

  e.preventDefault();
  e.stopImmediatePropagation();

  if (!e.repeat)
    toggleConsole();
}
