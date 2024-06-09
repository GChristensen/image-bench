import {getGenerationState} from "./state.js";

let popup;

export function showPopup() {
    let created = true;

    if (!popup) {
        createPopup();
    }
    else {
        created = false;
        popup.focus();
    }

    return created;
}

function createPopup() {
    const windowFeatures = 'width=800,height=600,left=100,top=100';
    popup = window.open("/image-bench/window", '_blank', windowFeatures);
    popup.getGenerationState = getGenerationState;
    popup.addEventListener("unload", () => {
        if (popup.location.href !== "about:blank")
            disposePopup();
    });
}

export function disposePopup() {
    popup = null;
}

export function sendPopupEvent(msg) {
    popup?.onSDEvent(msg);
}