import {shallowRef} from "vue";

const DURATION = 3000;
let nextId = 1;

/**
 * Short notices shown at the bottom of the popup by ToastHost.vue (mounted once in App.vue): [{id, message, kind}]
 */
export const toasts = shallowRef([]);

/**
 * Show a notice for a few seconds
 * @param {string} message
 * @param {{kind?: "success"|"error", duration?: number}} options
 */
export function toast(message, {kind = "success", duration = DURATION} = {}) {
  const id = nextId++;
  toasts.value = [...toasts.value, {id, message, kind}];
  setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter(item => item.id !== id);
}
