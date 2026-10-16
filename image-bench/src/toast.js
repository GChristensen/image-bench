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

/**
 * Show a notice with a spinner until the operation ends
 * @param {string} message
 * @returns {{done: (message: string, options?: {kind?: "success"|"error", duration?: number}) => void,
 *   dismiss: () => void}} done() turns the notice into a result shown for a few seconds
 */
export function toastPending(message) {
  const id = nextId++;
  toasts.value = [...toasts.value, {id, message, kind: "pending"}];

  return {
    done(message, {kind = "success", duration = DURATION} = {}) {
      toasts.value = toasts.value.map(item => item.id === id ? {id, message, kind} : item);
      setTimeout(() => dismissToast(id), duration);
    },
    dismiss: () => dismissToast(id)
  };
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter(item => item.id !== id);
}
