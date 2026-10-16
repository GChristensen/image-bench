import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useCompareStore} from "@/stores/compare.js";
import {KIND_COMPARE} from "@/consts.js";

/**
 * A marking set or removed on an image outside the trays (Generated, Upscaled, Explore, the Generate tab)
 * goes to the copies of the image already in the trays and the Compare tab; one set in the Compare tab
 * goes to the copies in the trays
 */
export function syncTrayMarkings(image, kind, isTray) {
  if (isTray)
    return;

  const stores = [useImageTrayStore(), useConceptTrayStore()];

  if (kind !== KIND_COMPARE)
    stores.push(useCompareStore());

  for (const store of stores)
    store.syncMarking(image);
}
