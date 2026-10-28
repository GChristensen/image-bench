import {onBeforeUnmount} from "vue";

/**
 * Press and release on the action rim of a card, as in the image overlay: a middle press that shows the rim
 * (show(), the toggle of a middle click) and a release on a sector the pointer moved to runs that sector, then
 * hide(). A release without moving to another sector leaves the rim shown, as the middle click toggled it, so a
 * press where a sector appears does not run it.
 * While the button is held the card ignores its mouseleave (the arcs reach past a small card); leave() follows
 * a release outside element().
 * @param {{value: object}} rimRef the ActionRim component (a ref or a getter)
 * @param {{show: Function, hide: Function, leave: Function, element: Function}} options
 */
export function useRimPress(rimRef, {show, hide, leave, element}) {
  let press = null;
  // The auxclick of a press handled here does not toggle the rim again
  let handled = false;

  const itemId = item => item?.id ?? item;

  function onUp(e) {
    if (e.button !== 1)
      return;

    const start = press;
    stop();
    handled = true;
    // The auxclick follows the mouseup at once
    setTimeout(() => handled = false);

    const rim = rimRef.value;
    const target = rim?.itemAt(e.clientX, e.clientY);

    if (target && target !== "center" && itemId(target) !== itemId(rim.itemAt(start.x, start.y))) {
      rim.releaseAt(e.clientX, e.clientY, e.shiftKey);
      hide();
    }

    if (!element()?.contains(e.target))
      leave();
  }

  function stop() {
    press = null;
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("blur", onBlur);
  }

  function onBlur() {
    stop();
    leave();
  }

  // A middle mousedown on the image while the rim is hidden
  function begin(e) {
    e.preventDefault();
    press = {x: e.clientX, y: e.clientY};
    show();
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("blur", onBlur);
  }

  onBeforeUnmount(stop);

  return {
    begin,
    get pressing() { return !!press; },
    handlesAuxClick() { return handled; }
  };
}
