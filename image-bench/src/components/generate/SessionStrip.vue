<script setup>
/**
 * Filmstrip of the images generated in this session (stores/session.js), newest at the right.
 * It follows new images while it is scrolled to the end. A click opens the overlay, the rim button of an image its
 * action rim at the pointer (pointerRim.js), whose arc below shows the image in the result pane of the Generate tab
 * instead of the latest one (again: back to the latest). The context menu, the action keys and dragging to the
 * trays work as on the image cards.
 */
import {nextTick, onActivated, onMounted, ref, watch} from "vue";
import {KIND_SESSION} from "@/consts.js";
import {openImageMenu} from "@/contextMenu.js";
import {startImageDrag, endImageDrag} from "@/imageDrag.js";
import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
import {openImageRim} from "@/pointerRim.js";
import {buttonName, imageButtonHandlers, rimButton} from "@/imageButtons.js";
import {previewUrl} from "@/media.js";

// Pixels of a wheel line (deltaMode 1)
const WHEEL_LINE = 40;
// Scrolled this close to the end, the strip follows new images
const END_TOLERANCE = 8;

const props = defineProps({
  images: {
    type: Array,
    required: true
  },
  // Image shown in the result pane instead of the latest one
  selected: {
    type: Object,
    default: null
  },
  // Shown in the Generate tab (the strip is hidden with v-show)
  active: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["select", "open", "showParams", "setMarking", "interact"]);

const strip = ref(null);
let atEnd = true;
let scrollPosition = 0;

const ctx = {
  kind: KIND_SESSION,
  isTray: false,
  upscalable: false,
  handlers: {
    showParams: image => emit("showParams", image)
  }
};

// The size in the parameters ("1024x1024") reserves the width of a thumbnail before it is loaded
function aspectStyle(image) {
  const size = /^(\d+)x(\d+)$/.exec(image.parameters?.size ?? "");
  return size ? {aspectRatio: `${size[1]} / ${size[2]}`} : null;
}

function scrollToEnd() {
  if (strip.value)
    strip.value.scrollLeft = strip.value.scrollWidth;
}

function onScroll() {
  const element = strip.value;

  // Hidden or detached, the strip loses its scroll position; it is restored when shown again
  if (!element.isConnected || !element.clientWidth)
    return;

  atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - END_TOLERANCE;
  scrollPosition = element.scrollLeft;
}

// Shown again (hidden by v-show, or the Generate tab moved out by KeepAlive): back to the end or the position
async function restoreScroll() {
  await nextTick();

  if (atEnd)
    scrollToEnd();
  else if (strip.value)
    strip.value.scrollLeft = scrollPosition;
}

// Created again when the parameter area is expanded, the strip starts at the newest images
onMounted(() => {
  if (props.active)
    restoreScroll();
});

onActivated(() => {
  if (props.active)
    restoreScroll();
});

// The newest image, since the length stays the same at the image limit
watch(() => props.images.at(-1)?.sessionId, async () => {
  if (atEnd && props.active) {
    await nextTick();
    scrollToEnd();
  }
});

// A thumbnail without its size in the parameters takes its width only when loaded
function onImageLoad() {
  if (atEnd && props.active)
    scrollToEnd();
}

watch(() => props.active, active => {
  if (active)
    restoreScroll();
});

// A vertical wheel scrolls the strip
function onWheel(e) {
  emit("interact");

  if (e.deltaY && !e.shiftKey) {
    e.preventDefault();
    strip.value.scrollLeft += e.deltaY * (e.deltaMode === 1 ? WHEEL_LINE : 1);
  }
}

// ---------- Action rim ----------

// The rim of an image: its center switches the ring to the markings (the session images are not deeply reactive, so
// the view passes the marking on), the arc below shows the image in the result pane
function openRim(e, image) {
  emit("interact");
  openImageRim(e, image, ctx, {
    hub: "markings",
    markingArc: false,
    extras: [image === props.selected
      ? {id: "latest", icon: "picture", label: "Show the latest image in the result pane"}
      : {id: "select", icon: "picture", label: "Show in the result pane"}],
    on: {
      setMarking: marking => setMarking(image, marking),
      extra: id => emit("select", id === "select" ? image : null)
    }
  });
}

// null removes the marking; the view passes it to the other copies of the image
function setMarking(image, marking) {
  if (marking)
    image.marking = marking;
  else
    delete image.marking;

  emit("setMarking", image);
}

function imageButtons(image) {
  return imageButtonHandlers(e => openRim(e, image), e => onContextMenu(e, image));
}

const imageTitle = image => `Click to open, ${buttonName(rimButton()).toLowerCase()}-click for the actions`
  + (image === props.selected ? "; shown in the result pane" : "");

function onContextMenu(e, image) {
  emit("interact");
  openImageMenu(e, image, ctx);
}

function onMouseEnter(e, image) {
  setHoveredImageTarget({getImage: () => image, ctx, element: e.currentTarget, view: () => emit("open", image)});
}

function onMouseLeave(e) {
  clearHoveredImageTarget(e.currentTarget);
}

function onOpen(image) {
  emit("open", image);
}
</script>

<template>
  <div ref="strip" class="session-strip" @scroll.passive="onScroll" @wheel="onWheel" @pointerdown="emit('interact')">
    <div v-if="!images.length" class="empty">The images generated in this session are shown here</div>
    <div v-for="(image, index) in images" :key="image.sessionId" class="item"
         :class="{'run-start': index > 0 && image.run !== images[index - 1].run}"
         v-memo="[image === selected, index > 0 && image.run !== images[index - 1].run]">
      <img :src="previewUrl(image)" :class="{selected: image === selected}" :style="aspectStyle(image)" alt="" loading="lazy"
           @load="onImageLoad"
           :data-session-id="image.sessionId"
           :title="imageTitle(image)"
           @click="onOpen(image)" @mousedown="e => imageButtons(image).onMouseDown(e)"
           @auxclick="e => imageButtons(image).onAuxClick(e)" @contextmenu="e => imageButtons(image).onContextMenu(e)"
           @mouseenter="onMouseEnter($event, image)" @mouseleave="onMouseLeave"
           @dragstart="startImageDrag($event, image, KIND_SESSION)" @dragend="endImageDrag">
    </div>
  </div>
</template>

<style scoped>
.session-strip {
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  box-sizing: border-box;
}

.item {
  flex: none;
  height: 100%;
  display: flex;
}

/* A new batch, or the single images after one */
.item.run-start {
  margin-left: 6px;
  padding-left: 12px;
  border-left: 2px solid var(--ib-border-2);
}

.item img {
  height: 100%;
  width: auto;
  min-width: 24px;
  object-fit: contain;
  border: 2px solid transparent;
  border-radius: 4px;
  box-sizing: border-box;
  cursor: pointer;
}

.item img:hover {
  border-color: var(--ib-border-2);
}

.item img.selected {
  border-color: var(--ib-accent);
}

.empty {
  margin: auto;
  color: var(--ib-muted);
  font-size: 12px;
}
</style>
