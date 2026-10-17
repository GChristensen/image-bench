import {ref} from "vue";

// Module-level, so that all cards share one set of listeners
const ctrlDown = ref(false);
let installed = false;

function release() {
  ctrlDown.value = false;
}

/**
 * Whether Ctrl is held, e.g. to hide the chrome of the hovered image card.
 * Reset when the window loses focus, since the keyup then never arrives.
 * @returns {import('vue').Ref<boolean>}
 */
export function useCtrlKey() {
  if (!installed) {
    installed = true;
    window.addEventListener("keydown", e => ctrlDown.value = e.ctrlKey || e.key === "Control");
    window.addEventListener("keyup", e => ctrlDown.value = e.key === "Control" ? false : e.ctrlKey);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
  }

  return ctrlDown;
}
