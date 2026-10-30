<script setup>
/**
 * The action rim at the pointer (pointerRim.js), mounted once in App.vue. Opened by a press, it runs the sector the
 * same button is released on; released in the center it stays for clicks (sticky), released elsewhere it closes.
 * A press outside, Escape, the wheel or resizing the window close it; a left press that closes it does nothing
 * else. The browser menu and the middle click that follow its press are suppressed. Opened by the right button,
 * a right click on its center acts as a left click (e.g. closes the image overlay)
 */
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import {pointerRim, closePointerRim} from "@/pointerRim.js";
import {contextMenu, closeContextMenu} from "@/contextMenu.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import ActionRim from "@/components/ActionRim.vue";

// Half the extent of the rim with its arcs (ActionRim at its largest), kept inside the window
const RIM_EXTENT = 132;
// The contextmenu or auxclick that follows a release comes this soon after it
const FOLLOW_TIME = 500;

const shiftDown = useShiftKey();
const rimElement = ref(null);
const position = ref({x: 0, y: 0});
// Released in the center: the rim stays until a click
const sticky = ref(false);
// The button held since the press that opened the rim, null after its release
let gestureButton = null;
let suppressContextMenuUntil = 0;
let suppressAuxClickUntil = 0;
let suppressClick = false;

watch(pointerRim, rim => {
  removeListeners();

  if (!rim)
    return;

  closeContextMenu();
  position.value = {
    x: Math.min(Math.max(rim.x, RIM_EXTENT), window.innerWidth - RIM_EXTENT),
    y: Math.min(Math.max(rim.y, RIM_EXTENT), window.innerHeight - RIM_EXTENT)
  };
  gestureButton = rim.button >= 0 ? rim.button : null;
  sticky.value = gestureButton === null;

  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("wheel", closePointerRim, {capture: true, passive: true});
  window.addEventListener("resize", closePointerRim);
  window.addEventListener("blur", onBlur);
});

// One menu at a time
watch(contextMenu, menu => menu && closePointerRim());

function removeListeners() {
  window.removeEventListener("mousedown", onMouseDown, true);
  window.removeEventListener("mouseup", onMouseUp, true);
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("wheel", closePointerRim, {capture: true});
  window.removeEventListener("resize", closePointerRim);
  window.removeEventListener("blur", onBlur);
}

function isOnRim(target) {
  return !!rimElement.value?.$el.contains(target);
}

function onMouseDown(e) {
  // The press that opened the rim, whose handler may run before or after this one
  if (e === pointerRim.value?.event)
    return;

  // Clicks on the rim are its own (a middle click runs the alternative of a sector, the rim's box keeps the browser
  // menu from a right one)
  if (isOnRim(e.target))
    return;

  closePointerRim();

  if (e.button === 0) {
    e.preventDefault();
    suppressClick = true;
  }
}

function onMouseUp(e) {
  if (gestureButton === null || e.button !== gestureButton)
    return;

  gestureButton = null;

  if (e.button === 2)
    suppressContextMenuUntil = e.timeStamp + FOLLOW_TIME;
  else if (e.button === 1)
    suppressAuxClickUntil = e.timeStamp + FOLLOW_TIME;

  // The sector runs through its event, which closes the rim
  const target = rimElement.value?.releaseAt(e.clientX, e.clientY, e.shiftKey);

  if (target === "center")
    sticky.value = true;
  else if (pointerRim.value && !target)
    closePointerRim();
}

// Escape closes the rim before anything under it
function onKeyDown(e) {
  if (e.key !== "Escape" && e.key !== "Esc")
    return;

  e.preventDefault();
  e.stopImmediatePropagation();
  closePointerRim();
}

function onBlur() {
  gestureButton = null;

  if (!sticky.value)
    closePointerRim();
}

// ---------- What follows the presses of the rim ----------

// What follows a release comes before the next press
function onFollowingMouseDown() {
  suppressClick = false;
  suppressContextMenuUntil = 0;
  suppressAuxClickUntil = 0;
}

function onContextMenu(e) {
  if (e.timeStamp > suppressContextMenuUntil)
    return;

  suppressContextMenuUntil = 0;
  e.preventDefault();
  e.stopPropagation();
}

function onAuxClick(e) {
  if (e.button !== 1 || e.timeStamp > suppressAuxClickUntil)
    return;

  suppressAuxClickUntil = 0;
  e.preventDefault();
  e.stopPropagation();
}

function onClick(e) {
  if (!suppressClick)
    return;

  suppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}

onMounted(() => {
  window.addEventListener("mousedown", onFollowingMouseDown, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("auxclick", onAuxClick, true);
  window.addEventListener("click", onClick, true);
});

onBeforeUnmount(() => {
  removeListeners();
  window.removeEventListener("mousedown", onFollowingMouseDown, true);
  window.removeEventListener("contextmenu", onContextMenu, true);
  window.removeEventListener("auxclick", onAuxClick, true);
  window.removeEventListener("click", onClick, true);
});

// The rim closes before the handler runs, which may open a dialog or another rim
function handle(name, ...args) {
  const on = pointerRim.value?.content.on;
  closePointerRim();
  on?.[name]?.(...args);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="rim">
      <!-- A box without size at the pointer: the rim centers itself on it -->
      <div v-if="pointerRim" class="pointer-rim" :style="{left: position.x + 'px', top: position.y + 'px'}"
           @contextmenu.prevent>
        <ActionRim ref="rimElement" :groups="pointerRim.content.groups" :extras="pointerRim.content.extras ?? []"
                   :size="pointerRim.content.size ?? 1000" :height="pointerRim.content.height ?? 0" :hub="pointerRim.content.hub ?? 'filter'" :marking="pointerRim.content.marking ?? null"
                   :marking-arc="!!pointerRim.content.markingArc" :show-alt="shiftDown"
                   :deletable="!!pointerRim.content.deletable" :delete-label="pointerRim.content.deleteLabel ?? 'Remove'"
                   :filterable="!!pointerRim.content.filterable" :filter-active="!!pointerRim.content.filterActive"
                   :center-right-click="pointerRim.button === 2"
                   @run="(action, alt) => handle('run', action, alt)" @delete="handle('delete')"
                   @set-marking="marking => handle('setMarking', marking)" @extra="id => handle('extra', id)"
                   @filter-marking="marking => handle('filterMarking', marking)" @close="handle('close')"/>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Above the image and parameters overlays (up to 1003) and the file viewer, below the context menu (1050) */
.pointer-rim {
  position: fixed;
  width: 0;
  height: 0;
  z-index: 1040;
}

.rim-enter-active {
  transition: opacity 0.08s ease-out, transform 0.08s ease-out;
}

.rim-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
</style>
