import {computed, ref} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const KEYS = {
  x: {ArrowLeft: -1, ArrowRight: 1},
  y: {ArrowUp: -1, ArrowDown: 1}
};

/**
 * A size set by dragging a grip or with its arrow keys, kept in localStorage.
 * Without a stored size the fallback applies (e.g. a size computed from the layout); double-clicking
 * the grip (reset) returns to it. The limits and the fallback may be getters, so that they follow the layout.
 * @param {string} storageKey
 * @param {Object} options
 * @param {number|function(): number} options.min
 * @param {number|function(): number} options.max
 * @param {number|function(): number} options.fallback size without a stored one
 * @param {'x'|'y'} [options.axis] pointer axis the grip moves along
 * @param {1|-1} [options.direction] -1: moving the pointer left or up enlarges the size
 * @param {number} [options.keyStep] size change per arrow key press
 * @returns {{size: import("vue").ComputedRef<number>, resizing: import("vue").Ref<boolean>,
 *            onPointerDown: function(PointerEvent), onKeydown: function(KeyboardEvent), reset: function()}}
 */
export function useDragSize(storageKey, {min, max, fallback, axis = "y", direction = -1, keyStep = 20}) {
  const storage = useLocalStorage();
  const resolve = value => typeof value === "function" ? value() : value;
  const clamp = size => Math.round(Math.max(resolve(min), Math.min(resolve(max), size)));

  const stored = parseInt(storage.getItem(storageKey));
  const chosen = ref(Number.isFinite(stored) ? stored : null);
  const resizing = ref(false);

  // Clamped when used, so that a stored size fits the current layout
  const size = computed(() => clamp(chosen.value ?? resolve(fallback)));

  const save = () => chosen.value === null ? storage.removeItem(storageKey) : storage.setItem(storageKey, String(chosen.value));
  const position = e => axis === "x" ? e.clientX : e.clientY;

  function onPointerDown(e) {
    if (e.button !== 0)
      return;

    e.preventDefault();

    const start = position(e);
    const startSize = size.value;

    const onMove = moveEvent => chosen.value = clamp(startSize + direction * (position(moveEvent) - start));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizing.value = false;
      save();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    resizing.value = true;
  }

  function onKeydown(e) {
    const sign = KEYS[axis][e.key];

    if (!sign)
      return;

    e.preventDefault();
    chosen.value = clamp(size.value + direction * sign * keyStep);
    save();
  }

  function reset() {
    chosen.value = null;
    save();
  }

  return {size, resizing, onPointerDown, onKeydown, reset};
}