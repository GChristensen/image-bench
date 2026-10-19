<script setup>
/**
 * The host page (WebUI / ComfyUI) of the embedded mode, loaded at once and kept for the life of the popup;
 * shown over the tab content by the host tab (route /host). Hidden, it stays laid out at full size: the host page
 * tells the shown WebUI tab by offsetParent, which a display: none frame would null for every element
 */
import {onBeforeUnmount, onMounted, ref} from "vue";
import {setHostFrameWindow} from "@/hostWindow.js";
import {HOST_NAME} from "@/host.js";
import {onConsoleKey} from "@/consoleDrawer.js";

defineProps({
  active: {
    type: Boolean,
    required: true
  }
});

// The host UI is served at the root of the same origin, so that the popup and the host page can call each other
const HOST_URL = "/";
// Size and position of the popup window for the launcher page (shared_backend/launcher.html)
const GEOMETRY_KEY = "imageBench_appWindowGeometry";

const frame = ref(null);
let geometryTimer = null;

// Only a popup window has no location bar; the size of a browser tab is no size for the popup
function saveGeometry() {
  if (window.locationbar?.visible)
    return;

  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify({
      width: window.innerWidth, height: window.innerHeight, left: window.screenX, top: window.screenY
    }));
  } catch {
    // Storage is not available
  }
}

// The keys of the host page never reach this window: Ctrl+` is caught in the frame too, before the host page's
// own handlers. Each load of the host page is a new window, which has no listeners yet
function onFrameLoad() {
  try {
    frame.value.contentWindow.addEventListener("keydown", onConsoleKey, true);
  } catch {
    // The frame shows a page of another origin (an error page)
  }
}

function onResize() {
  clearTimeout(geometryTimer);
  geometryTimer = setTimeout(saveGeometry, 500);
}

onMounted(() => {
  // The WindowProxy of the frame stays the same across the navigations of the host page
  setHostFrameWindow(frame.value.contentWindow);
  window.addEventListener("resize", onResize);
  window.addEventListener("pagehide", saveGeometry);
});

onBeforeUnmount(() => {
  clearTimeout(geometryTimer);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("pagehide", saveGeometry);
  setHostFrameWindow(null);
});
</script>

<template>
  <iframe ref="frame" class="host-frame" :class="{active}" :src="HOST_URL" :title="HOST_NAME"
          :aria-hidden="!active" :tabindex="active ? 0 : -1" @load="onFrameLoad"></iframe>
</template>

<style scoped>
.host-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--ib-bg);
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
}

.host-frame.active {
  visibility: visible;
  pointer-events: auto;
  z-index: 5;
}
</style>
