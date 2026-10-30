import {shallowRef} from "vue";
import {rimActionGroups, rimReuseExtras, runImageAction, runRimReuseExtra} from "@/imageActions.js";

/**
 * The action rim at the pointer, opened by the rim button of an image (imageButtons.js) and rendered by
 * PointerRim.vue, which is mounted once in App.vue; one rim at a time, as the context menu.
 * {x, y, button, event, content}: button is the one held since it opened the rim (-1 for none, e.g. a button that
 * shows it); content holds the props of ActionRim (groups, extras, marking, markingArc, hub, deletable, deleteLabel,
 * filterable, filterActive; size and height of the image, for the rim of a small card, else the full one) and `on`, its event handlers (run(action, alt), delete(), setMarking(marking|null),
 * extra(id), filterMarking(marking), close()). The rim closes after each of them
 */
export const pointerRim = shallowRef(null);

/**
 * @param {MouseEvent|{clientX: number, clientY: number}} event - the press, or a point without a button
 * @param {Object} content
 */
export function openPointerRim(event, content) {
  pointerRim.value = {x: event.clientX, y: event.clientY, button: event.button ?? -1, event, content};
}

export function closePointerRim() {
  pointerRim.value = null;
}

export function isPointerRimOpen() {
  return !!pointerRim.value;
}

/**
 * The rim of an image as its card shows it (imageActions.js), from the action context: the reuse arc, markings and
 * Delete where the view's handlers set and delete them (or remove it from a view that only references it, labelled by
 * ctx.removeLabel), and the center for the marking filter; options replace any
 * of it (and the handlers of `on`)
 * @param {MouseEvent} event
 * @param {Object} image
 * @param {Object} ctx - action context (see imageActions.js)
 * @param {Object} options
 */
export function openImageRim(event, image, ctx, options = {}) {
  const {setMarking, filterMarking, activeMarkingFilter} = ctx.handlers;
  const deleteImage = ctx.handlers.deleteImage ?? ctx.handlers.removeImage;
  const marking = image.marking ?? null;

  openPointerRim(event, {
    groups: rimActionGroups(image, ctx),
    extras: rimReuseExtras(image),
    marking,
    markingArc: !!setMarking,
    hub: "filter",
    deletable: !!deleteImage,
    deleteLabel: ctx.handlers.deleteImage ? "Remove" : ctx.removeLabel ?? "Remove",
    filterable: !!filterMarking,
    filterActive: !!marking && activeMarkingFilter?.() === marking,
    ...options,
    on: {
      run: (action, alt) => runImageAction(action, image, ctx, alt),
      delete: () => deleteImage?.(image),
      setMarking: value => setMarking?.(image, value),
      extra: id => runRimReuseExtra(image, id),
      filterMarking: value => filterMarking?.(value),
      ...options.on
    }
  });
}
