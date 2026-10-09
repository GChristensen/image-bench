import { shallowRef, triggerRef } from 'vue';

/**
 * Promise-based replacement for native alert(), confirm() and prompt().
 *
 * The state is module-level, so the API works from components, composables and stores alike.
 * Dialogs are rendered by DialogHost.vue, which is mounted once in App.vue.
 * Dialogs form a stack: one opened while another is shown appears on top of it.
 */
export const dialogStack = shallowRef([]);

let nextId = 1;

function open(kind, message, options, cancelValue) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    dialogStack.value.push({id: nextId++, kind, message, options, cancelValue, resolve, previousFocus});
    triggerRef(dialogStack);
  });
}

/**
 * Close a dialog and resolve its promise
 * @param {Object} entry - Dialog entry from dialogStack
 * @param {*} value - Value the promise resolves with
 */
export function closeDialog(entry, value) {
  const index = dialogStack.value.indexOf(entry);

  if (index !== -1) {
    dialogStack.value.splice(index, 1);
    triggerRef(dialogStack);
    entry.previousFocus?.focus?.();
    entry.resolve(value);
  }
}

export const dialog = {
  /**
   * @param {string} message
   * @param {{title?: string, okText?: string}} options
   * @returns {Promise<void>}
   */
  alert(message, options = {}) {
    return open('alert', message, options, undefined);
  },

  /**
   * @param {string} message
   * @param {{title?: string, okText?: string, cancelText?: string, danger?: boolean}} options
   * @returns {Promise<boolean>} true if confirmed
   */
  confirm(message, options = {}) {
    return open('confirm', message, options, false);
  },

  /**
   * Text input with a dropdown history of the last 10 values per storageKey
   * @param {string} message
   * @param {{defaultValue?: string, storageKey?: string, placeholder?: string, title?: string}} options
   * @returns {Promise<string|null>} Trimmed input value, or null if cancelled or empty
   */
  prompt(message, options = {}) {
    return open('prompt', message, options, null);
  }
};

export function useDialog() {
  return dialog;
}
