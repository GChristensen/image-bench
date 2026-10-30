import {useAppConfigStore} from "@/stores/appConfig.js";

/**
 * The mouse buttons of an image (MouseEvent.button): the right one opens its action rim at the pointer
 * (pointerRim.js) and the middle one its context menu (contextMenu.js), swapped by the rightClickMenu setting
 */
export function rimButton() {
  return useAppConfigStore().rightClickMenu ? 1 : 2;
}

export function menuButton() {
  return rimButton() === 2 ? 1 : 2;
}

// "Right" or "Middle", for the texts that name the button
export function buttonName(button) {
  return button === 2 ? "Right" : "Middle";
}

/**
 * Handlers of an image element for its two buttons: a press of the rim button opens the rim (openRim(event)), a
 * click of the menu button the menu (openMenu(event)). The browser menu never shows; a middle press does not
 * autoscroll
 * @param {Function} openRim
 * @param {Function} openMenu
 * @returns {{onMouseDown: Function, onAuxClick: Function, onContextMenu: Function}}
 */
export function imageButtonHandlers(openRim, openMenu) {
  return {
    onMouseDown(e) {
      if (e.button === rimButton()) {
        e.preventDefault();
        openRim(e);
      }
      else if (e.button === 1)
        e.preventDefault();
    },
    onAuxClick(e) {
      if (e.button === 1 && menuButton() === 1)
        openMenu(e);
    },
    onContextMenu(e) {
      e.preventDefault();

      if (menuButton() === 2)
        openMenu(e);
    }
  };
}
