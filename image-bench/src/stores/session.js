import {shallowRef, triggerRef} from "vue";
import {defineStore} from "pinia";
import {createImageData} from "@/sdwebui.js";
import {isComfy} from "@/host.js";

// The oldest images are dropped beyond this number
export const SESSION_LIMIT = 265;

/**
 * Images generated while the popup is open, shown in the session filmstrip of the Generate tab.
 * Kept in memory only, independent of the Generated tab (which may be cleared by a batch).
 * Each image has the number of its run (a batch, or the single images generated between batches) and a sessionId.
 */
export const useSessionImagesStore = defineStore("sessionImages", () => {
  const images = shallowRef([]);

  let run = 0;
  let runIsBatch = false;
  // Key of the next image in the filmstrip
  let nextId = 1;

  function startRun(batch) {
    run++;
    runIsBatch = batch;
  }

  /**
   * Receives the events of the Generated kind, after its store
   */
  function onSDEvent(e) {
    if (e.type === "BEGIN_PROCESSING") {
      if (!e.single) {
        // In ComfyUI each image of a batch begins with an event of its own
        if (!(isComfy && e.isBatchGeneration))
          startRun(true);
      }
      else if (runIsBatch || !run)
        startRun(false);
    }
    else if (e.type === "SAVED_IMAGE") {
      if (!run)
        startRun(false);

      const image = createImageData(e);

      delete image.type;
      delete image.progress;
      image.run = run;
      image.sessionId = nextId++;

      const list = images.value;

      list.push(image);

      if (list.length > SESSION_LIMIT)
        list.splice(0, list.length - SESSION_LIMIT);

      triggerRef(images);
    }
  }

  return {images, onSDEvent};
});
