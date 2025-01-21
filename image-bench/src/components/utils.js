import {animateColors} from "@/utils_html.js";

export function flashTrayTab(tabId) {
    const trayTabElement = document.getElementById(tabId);
    animateColors(trayTabElement, 0.7);
}