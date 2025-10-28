// System paths from backend
let systemPaths = null;

/**
 * Fetch system paths from backend
 */
export async function fetchSystemPaths() {
    try {
        const response = await fetch("/image-bench/system_info");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        systemPaths = await response.json();
        console.log('[Image Bench] System paths loaded:', systemPaths);
        return systemPaths;
    } catch (e) {
        console.error('[Image Bench] Failed to fetch system paths:', e);
        return null;
    }
}

/**
 * Get ComfyUI root directory path
 */
export function getComfyUIRoot() {
    return systemPaths?.comfyui_root;
}

/**
 * Get all system paths
 */
export function getSystemPaths() {
    return systemPaths;
}