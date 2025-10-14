import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Composable for lazy loading images using Intersection Observer
 * Improves performance by only loading images when they're visible
 */
export function useLazyImage(imageRef, threshold = 0.1) {
  const isVisible = ref(false);
  const isLoaded = ref(false);
  let observer = null;

  onMounted(() => {
    if (!imageRef.value || !('IntersectionObserver' in window)) {
      // Fallback: show image immediately if no Intersection Observer support
      isVisible.value = true;
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true;
            // Once visible, we can disconnect the observer
            if (observer && imageRef.value) {
              observer.unobserve(imageRef.value);
            }
          }
        });
      },
      {
        threshold,
        rootMargin: '50px' // Start loading slightly before image is visible
      }
    );

    observer.observe(imageRef.value);
  });

  onUnmounted(() => {
    if (observer && imageRef.value) {
      observer.unobserve(imageRef.value);
    }
  });

  const onImageLoad = () => {
    isLoaded.value = true;
  };

  return {
    isVisible,
    isLoaded,
    onImageLoad
  };
}
