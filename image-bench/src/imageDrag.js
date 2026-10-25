import {toRaw} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useCompareStore} from "@/stores/compare.js";
import {flashTrayTab} from "@/components/utils.js";
import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED, KIND_GENERATED, KIND_COMPARE} from "@/consts.js";
import {isStill} from "@/media.js";

/**
 * Dragging image cards onto the tray tabs and the Compare tab: images dragged from the other tray are moved,
 * from other views (and to the Compare tab) copied. The project chip takes them too (KIND_PROJECT), copying them
 * into the folder of the current project. In the trays and the Upscaled tab, a card dropped on another card of the
 * view moves before or after it.
 * The card keeps the native URL of its image, so it can also be dropped into the image inputs of the Generate
 * and ControlNet tabs.
 */

const IMAGE_DRAG_TYPE = "application/x-image-bench";

// Drop target kind of the project chip, never a source
export const KIND_PROJECT = "project";

const TRAY_TAB_IDS = {
  [KIND_IMAGE_TRAY]: "image-tray-tab",
  [KIND_CONCEPT_TRAY]: "concept-tray-tab"
};

// Tabs that receive dropped images
const DROP_TAB_IDS = {
  ...TRAY_TAB_IDS,
  [KIND_COMPARE]: "compare-tab"
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
    case KIND_COMPARE:
      return useCompareStore();
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
  return !!dragged && dragged.sourceKind in TRAY_TAB_IDS && trayKind in TRAY_TAB_IDS
    && dragged.sourceKind !== trayKind;
}

/**
 * The dragged images, for a drop target that handles them itself (the project chip)
 * @returns {Object[]}
 */
export function takeDraggedImages() {
  const images = dragged?.images ?? [];
  dragged = null;
  return images;
}

/**
 * The dragged images without taking them, for a drop target that also takes the native URL of a card
 * (the References panel takes the files of video and audio cards, whose image is a thumbnail)
 * @returns {Object[]}
 */
export function peekDraggedImages() {
  return dragged?.images ?? [];
}

// Views whose cards are reordered by dragging them onto another card of the view
const REORDERABLE_KINDS = new Set([KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED]);

/**
 * Whether the dragged cards come from this view and can be moved before or after the target image
 */
export function canReorderOn(e, kind, target) {
  return !!dragged && REORDERABLE_KINDS.has(kind) && dragged.sourceKind === kind
    && e.dataTransfer.types.includes(IMAGE_DRAG_TYPE) && !dragged.images.includes(toRaw(target));
}

export function reorderImages(kind, target, after) {
  if (!dragged)
    return;

  const {images} = dragged;
  dragged = null;
  storeOfKind(kind).moveImages(images, target, after);
}

export async function dropImages(trayKind) {
  if (!dragged)
    return;

  const {images, sourceKind} = dragged;
  const move = isMoveTo(trayKind);
  const targetStore = storeOfKind(trayKind);

  dragged = null;

  // Compare takes images only, not video or audio files
  for (const image of images)
    if (trayKind !== KIND_COMPARE || isStill(image))
      await targetStore.addImage(image);

  if (move) {
    const sourceStore = storeOfKind(sourceKind);
    const moved = new Set(images);

    sourceStore.images = sourceStore.images.filter(i => !moved.has(toRaw(i)));
    sourceStore.persist();
  }

  flashTrayTab(DROP_TAB_IDS[trayKind]);
}
