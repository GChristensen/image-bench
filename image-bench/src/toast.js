import {shallowRef} from "vue";
import {dialog} from "@/dialogs/useDialog.js";

const DURATION = 3000;
const ERROR_DURATION = 8000;
// Long enough to notice what was removed and reach the button
export const ACTION_DURATION = 6000;
let nextId = 1;

/**
 * Short notices shown at the bottom of the popup by ToastHost.vue (mounted once in App.vue):
 * [{id, message, kind, open?, action?}]; open() runs on a click instead of dismissing the notice, action
 * ({label, run}) is a button of the notice (Undo)
 */
export const toasts = shallowRef([]);

/**
 * Show a notice for a few seconds
 * @param {string} message
 * @param {{kind?: "success"|"error", duration?: number, open?: () => void,
 *   action?: {label: string, run: () => void}}} options
 */
export function toast(message, {kind = "success", duration, open, action} = {}) {
  const id = nextId++;
  duration ??= action ? ACTION_DURATION : DURATION;
  toasts.value = [...toasts.value, {id, message, kind, open, action}];
  setTimeout(() => dismissToast(id), duration);
}

/**
 * Show a failure that needs no decision; a click shows the details in a dialog
 * @param {string|Error} error
 * @param {{title?: string, details?: string}} options
 */
export function toastError(error, {title, details} = {}) {
  const message = String(error?.message ?? error);

  toast(message, {kind: "error", duration: ERROR_DURATION, open: () => dialog.alert(details ?? message, {title})});
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
