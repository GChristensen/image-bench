import {ref} from "vue";

// Module-level, so that all cards share one set of listeners
const shiftDown = ref(false);
let installed = false;

function release() {
  shiftDown.value = false;
}

/**
 * Whether Shift is held, e.g. to show the alternative actions of the image card buttons.
 * Reset when the window loses focus, since the keyup then never arrives.
 * @returns {import('vue').Ref<boolean>}
 */
export function useShiftKey() {
  if (!installed) {
    installed = true;
    window.addEventListener("keydown", e => shiftDown.value = e.shiftKey || e.key === "Shift");
    window.addEventListener("keyup", e => shiftDown.value = e.key === "Shift" ? false : e.shiftKey);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
  }

  return shiftDown;
}
