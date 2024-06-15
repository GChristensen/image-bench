import {animateColors} from "@/utils_html.js";

export function flashTrayTab() {
    const trayTabElement = document.getElementById("image-tray-tab");
    animateColors(trayTabElement, 0.7);
}