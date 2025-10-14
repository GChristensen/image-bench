import { onMounted, onUnmounted } from 'vue';

/**
 * Composable for handling keyboard shortcuts
 * @param {Object} handlers - Object with key handlers
 * @param {Function} handlers.onEscape - Handler for Escape key
 * @param {Function} handlers.onArrowLeft - Handler for left arrow
 * @param {Function} handlers.onArrowRight - Handler for right arrow
 * @param {Function} handlers.onCtrlU - Handler for Ctrl+U
 */
export function useKeyboardShortcuts(handlers = {}) {
  const handleKeydown = (e) => {
    if (e.key === 'Esc' || e.key === 'Escape') {
      handlers.onEscape?.();
    } else if (e.key === 'ArrowLeft') {
      handlers.onArrowLeft?.();
    } else if (e.key === 'ArrowRight') {
      handlers.onArrowRight?.();
    } else if (e.key.toUpperCase() === 'U' && e.ctrlKey) {
      e.preventDefault();
      handlers.onCtrlU?.();
    }
  };

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  return {
    handleKeydown
  };
}
