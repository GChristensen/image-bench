import { computed, ref } from 'vue';

/**
 * Composable for managing image selection state
 * Handles selection logic for image lists
 */
export function useImageSelection(images) {
  const isAllSelected = computed(() => {
    return images.value.length > 0 && images.value.every(i => i.selected);
  });

  const isSomeSelected = computed(() => {
    return images.value.length > 0 && images.value.some(i => i.selected);
  });

  const isNoneSelected = computed(() => {
    return images.value.length > 0 && !images.value.some(i => i.selected);
  });

  /**
   * Select or unselect a specific image
   */
  const selectImage = (image, selected = true) => {
    const index = images.value.indexOf(image);
    if (index !== -1) {
      images.value[index].selected = selected;
    }
  };

  /**
   * Select or unselect all images
   */
  const selectAll = (select = true) => {
    if (isAllSelected.value || !select) {
      for (const image of images.value) {
        image.selected = false;
      }
    } else {
      for (const image of images.value) {
        image.selected = true;
      }
    }
  };

  /**
   * Get all selected images as plain objects (cloned)
   */
  const getSelectedImages = () => {
    const selectedItems = [];

    for (let i = 0; i < images.value.length; i++) {
      if (images.value[i].selected) {
        const proxyItem = images.value[i];
        const image = JSON.parse(JSON.stringify(proxyItem));
        selectedItems.push(image);
      }
    }

    return selectedItems;
  };

  /**
   * Clear selection
   */
  const clearSelection = () => {
    for (const image of images.value) {
      image.selected = false;
    }
  };

  return {
    isAllSelected,
    isSomeSelected,
    isNoneSelected,
    selectImage,
    selectAll,
    getSelectedImages,
    clearSelection
  };
}
