import { ref } from 'vue';

/**
 * Composable for showing prompt modal dialogs
 * Provides a Promise-based API similar to native prompt() but with enhanced features:
 * - Dropdown history of last 10 values per storage key
 * - Better styling and UX
 * - Keyboard support (Enter/Escape)
 */
export function usePromptModal() {
  const showModal = ref(false);
  const modalMessage = ref('');
  const modalDefaultValue = ref('');
  const modalStorageKey = ref('');

  let resolvePromise = null;
  let rejectPromise = null;

  /**
   * Show a prompt modal and return a promise that resolves with the input value
   * @param {string} message - The prompt message to display
   * @param {string} defaultValue - Default value for the input
   * @param {string} storageKey - Unique key for storing history in localStorage
   * @returns {Promise<string|null>} Promise that resolves with input value or null if cancelled
   */
  function showPrompt(message, defaultValue = '', storageKey = 'default') {
    modalMessage.value = message;
    modalDefaultValue.value = defaultValue;
    modalStorageKey.value = storageKey;
    showModal.value = true;

    return new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
  }

  /**
   * Handle modal confirmation
   * @param {string} value - The input value from the modal
   */
  function onConfirm(value) {
    showModal.value = false;
    if (resolvePromise) {
      resolvePromise(value);
      resolvePromise = null;
      rejectPromise = null;
    }
  }

  /**
   * Handle modal cancellation
   */
  function onCancel() {
    showModal.value = false;
    if (resolvePromise) {
      resolvePromise(null);
      resolvePromise = null;
      rejectPromise = null;
    }
  }

  return {
    // State
    showModal,
    modalMessage,
    modalDefaultValue,
    modalStorageKey,

    // Methods
    showPrompt,
    onConfirm,
    onCancel
  };
}
