import {toRaw} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {flashTrayTab} from "@/components/utils.js";
import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED, KIND_GENERATED} from "@/consts.js";

/**
 * Dragging image cards onto the tray tabs: images dragged from the other tray are moved, from other views copied.
 * The card keeps the native URL of its image, so it can also be dropped into the image inputs of the Generate
 * and ControlNet tabs.
 */

const IMAGE_DRAG_TYPE = "application/x-image-bench";

const TRAY_TAB_IDS = {
  [KIND_IMAGE_TRAY]: "image-tray-tab",
  [KIND_CONCEPT_TRAY]: "concept-tray-tab"
};

// {images, sourceKind} while a card is dragged
let dragged = null;

function storeOfKind(kind) {
  switch (kind) {
    case KIND_IMAGE_TRAY:
      return useImageTrayStore();
    case KIND_CONCEPT_TRAY:
      return useConceptTrayStore();
    case KIND_UPSCALED:
      return useUpscaledImagesStore();
    case KIND_GENERATED:
      return useGeneratedImagesStore();
  }
}

/**
 * A selected card drags all selected images of its view, including those hidden by the marking filter
 */
export function startImageDrag(e, image, sourceKind) {
  let images = [image];

  if (image.selected)
    images = storeOfKind(sourceKind)?.images.filter(i => i.selected && !i.separator) || images;

  dragged = {images: images.map(i => toRaw(i)), sourceKind};

  e.dataTransfer.setData(IMAGE_DRAG_TYPE, String(images.length));
  e.dataTransfer.effectAllowed = "copyMove";
}

export function endImageDrag() {
  dragged = null;
}

export function canDropOn(e, trayKind) {
  return !!dragged && e.dataTransfer.types.includes(IMAGE_DRAG_TYPE) && dragged.sourceKind !== trayKind;
}

export function isMoveTo(trayKind) {
  return !!dragged && dragged.sourceKind in TRAY_TAB_IDS && dragged.sourceKind !== trayKind;
}

export async function dropImages(trayKind) {
  if (!dragged)
    return;

  const {images, sourceKind} = dragged;
  const move = isMoveTo(trayKind);
  const targetStore = storeOfKind(trayKind);

  dragged = null;

  for (const image of images)
    await targetStore.addImage(image);

  if (move) {
    const sourceStore = storeOfKind(sourceKind);
    const moved = new Set(images);

    sourceStore.images = sourceStore.images.filter(i => !moved.has(toRaw(i)));
    sourceStore.persist();
  }

  flashTrayTab(TRAY_TAB_IDS[trayKind]);
}
