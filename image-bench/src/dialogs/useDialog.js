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
   * Text input with a history of the last values per storageKey (10 unless historySize is given).
   * The history is shown as browser autocomplete, or as an editable dropdown when dropdown is true.
   * With checkbox, a checkbox is shown under the input and the result is {value, checked}.
   * With multiline, the input is a textarea (rows, 8 by default) without history: Enter is a newline, Ctrl+Enter confirms.
   * @param {string} message
   * @param {{defaultValue?: string, storageKey?: string, placeholder?: string, title?: string,
   *          dropdown?: boolean, historySize?: number, okText?: string,
   *          checkbox?: {label: string, checked?: boolean}, multiline?: boolean, rows?: number}} options
   * @returns {Promise<string|{value: string, checked: boolean}|null>} Trimmed input value, or null if cancelled or empty
   */
  prompt(message, options = {}) {
    return open('prompt', message, options, null);
  },

  /**
   * Filterable checklist (FilterChecklist.vue); Enter confirms
   * @param {string} message
   * @param {{title?: string, items: {value: string, label: string, group?: string, note?: string}[],
   *          groups?: Object, selected?: string[], filter?: string, emptyText?: string,
   *          okText?: string | ((count: number) => string)}} options
   * @returns {Promise<string[]|null>} Checked values in the order they were checked, null if cancelled or none
   */
  checklist(message, options) {
    return open('checklist', message, options, null);
  },

  /**
   * Civitai model info (preview, base model, trained words) with "Open on Civitai" and extra actions
   * @param {Object} info - Found result of /image-bench/civitai/model_info
   * @param {{actions?: {id: string, label: string}[]}} options
   * @returns {Promise<string|null>} "open", the id of an extra action, or null if closed
   */
  modelInfo(info, options = {}) {
    return open('modelInfo', '', {
      title: info.modelName || 'Civitai',
      okText: 'Open on Civitai',
      cancelText: 'Close',
      ...options,
      info
    }, null);
  }
};

export function useDialog() {
  return dialog;
}
