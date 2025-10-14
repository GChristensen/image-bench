import { ref } from 'vue';

/**
 * Composable for debouncing function calls
 * Useful for reducing expensive operations like API calls
 */
export function useDebounce() {
  const timeoutId = ref(null);

  /**
   * Debounce a function call
   * @param {Function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  function debounce(func, delay = 300) {
    return (...args) => {
      if (timeoutId.value) {
        clearTimeout(timeoutId.value);
      }
      
      timeoutId.value = setTimeout(() => {
        func.apply(null, args);
        timeoutId.value = null;
      }, delay);
    };
  }

  /**
   * Cancel any pending debounced calls
   */
  function cancel() {
    if (timeoutId.value) {
      clearTimeout(timeoutId.value);
      timeoutId.value = null;
    }
  }

  return {
    debounce,
    cancel
  };
}
