import {animateColors} from "@/utils_html.js";

export function flashTrayTab(tabId) {
    const trayTabElement = document.getElementById(tabId);
    if (trayTabElement)
        animateColors(trayTabElement, 0.7);
}