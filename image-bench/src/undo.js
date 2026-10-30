import {toRaw} from "vue";
import {toast} from "@/toast.js";

/**
 * Removal from a view that can be undone: the images go at once, and a notice offers Undo. The backend deletes the
 * copies of removed tray images (image-bench/<kind>/) only 10 s after the save (tray.REMOVED_FILE_DELAY), so
 * the removed entries can simply be put back.
 */

// Saved views replace image objects on save (useTrayStoreState), so images are matched by path too
function isSame(a, b) {
  a = toRaw(a);
  b = toRaw(b);
  return a === b || !!a.imagePath && !a.separator && a.imagePath === b.imagePath;
}

/**
 * Remove the entries of store.images matching the predicate, save the store if it is saved, and offer Undo
 * @param {Object} store - a store with images (and persist() for the saved views)
 * @param {(image: Object) => boolean} predicate
 * @param {(count: number) => string} message - the text of the notice for the number of removed images
 * @returns {number} The number of removed images (batch separators are not counted)
 */
export function removeWithUndo(store, predicate, message) {
  const removed = [];
  const kept = [];

  store.images.forEach((image, index) => {
    if (predicate(image))
      removed.push({image, index});
    else
      kept.push(image);
  });

  if (!removed.length)
    return 0;

  store.images = kept;
  store.persist?.();

  const count = removed.filter(({image}) => !image.separator).length;
  toast(message(count), {action: {label: "Undo", run: () => restore(store, removed)}});

  return count;
}

// Each entry goes back to its former position, unless it is in the view again (added anew meanwhile); entries
// removed later are not brought back with it
function restore(store, removed) {
  const images = [...store.images];

  for (const {image, index} of removed)
    if (!images.some(other => isSame(other, image)))
      images.splice(Math.min(index, images.length), 0, image);

  store.images = images;
  store.persist?.();
}

/**
 * Add an image to a saved view (a tray, Compare) so that the addition can be undone: the undo takes the entry out
 * again, as Remove does
 * @param {Object} store - a tray store
 * @param {Object} image
 * @returns {(() => void)|null} The undo, or null if the image was in the view already
 */
export function addWithUndo(store, image) {
  const count = store.images.length;
  // The entry is pushed before addImage() awaits the save
  store.addImage(image);

  if (store.images.length <= count)
    return null;

  // A save updates the entry in place
  const entry = toRaw(store.images[count]);

  return () => {
    store.images = store.images.filter(other => toRaw(other) !== entry);
    store.persist?.();
  };
}

/**
 * Clear several views at once, with one notice offering Undo. A store with more state than its images (the ControlNet
 * sweep) is cleared with clear() and brought back with snapshot() / restoreSnapshot()
 * @param {Object[]} stores
 * @param {string} message - the text of the notice
 * @returns {boolean} Whether anything was cleared
 */
export function clearWithUndo(stores, message) {
  stores = stores.filter(store => store.images.length);

  if (!stores.length)
    return false;

  const undo = stores.map(store => {
    if (store.snapshot) {
      const saved = store.snapshot();
      store.clear();
      return () => store.restoreSnapshot(saved);
    }

    const removed = store.images.map((image, index) => ({image, index}));
    store.images = [];
    store.persist?.();
    return () => restore(store, removed);
  });

  toast(message, {action: {label: "Undo", run: () => undo.forEach(run => run())}});
  return true;
}

/**
 * "3 images" / "1 image"
 */
export function imageCount(count) {
  return `${count} image${count === 1 ? "" : "s"}`;
}
