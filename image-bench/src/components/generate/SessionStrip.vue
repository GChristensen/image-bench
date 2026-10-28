<script setup>
/**
 * Filmstrip of the images generated in this session (stores/session.js), newest at the right.
 * It follows new images while it is scrolled to the end. A click opens the overlay, a middle click toggles the
 * action rim of an image, until the pointer leaves the image and the rim; the rim is put over the page, since the
 * strip clips it, and reaches over the neighbors. Its arc below shows the image in the result pane of the Generate
 * tab instead of the latest one (again: back to the latest). The context menu, the action keys and dragging to the
 * trays work as on the image cards.
 */
import {computed, nextTick, onActivated, onMounted, ref, watch} from "vue";
import {KIND_SESSION} from "@/consts.js";
import {openImageMenu} from "@/contextMenu.js";
import {startImageDrag, endImageDrag} from "@/imageDrag.js";
import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import {rimActionGroups, runImageAction} from "@/imageActions.js";
import {previewUrl} from "@/media.js";
import ActionRim from "@/components/ActionRim.vue";

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
  closeRim();

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

const shiftKey = useShiftKey();
const rimImage = ref(null);
// Fixed box of the image the rim is centered on
const rimBox = ref(null);
const rimElement = ref(null);
// The session images are not deeply reactive: the rim reads the marking when it opens and when it is set
const rimMarking = ref(null);

const rimGroups = computed(() => rimImage.value ? rimActionGroups(rimImage.value, ctx) : []);

const rimExtras = computed(() => [rimImage.value && rimImage.value === props.selected
  ? {id: "latest", icon: "picture", label: "Show the latest image in the result pane"}
  : {id: "select", icon: "picture", label: "Show in the result pane"}]);

const rimStyle = computed(() => {
  const {left, top, width, height} = rimBox.value;
  return {left: left + "px", top: top + "px", width: width + "px", height: height + "px"};
});

function openRim(image, element) {
  const rect = element.getBoundingClientRect();
  rimBox.value = {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
  rimMarking.value = image.marking ?? null;
  rimImage.value = image;
}

function closeRim() {
  rimImage.value = null;
}

// The rim stays while the pointer moves between the image and the rim
function onRimLeave(e, image) {
  const to = e.relatedTarget;

  if (rimImage.value && !(to && (rimElement.value?.contains(to) || to === image)))
    closeRim();
}

function onRimPointerOut(e) {
  const to = e.relatedTarget;

  if (!(to && (rimElement.value?.contains(to) || to.dataset?.sessionId === String(rimImage.value?.sessionId))))
    closeRim();
}

function onRimAction(action, alt) {
  runImageAction(action, rimImage.value, ctx, alt);
}

// null removes the marking; the view passes it to the other copies of the image
function onRimMarking(marking) {
  const image = rimImage.value;

  if (marking)
    image.marking = marking;
  else
    delete image.marking;

  rimMarking.value = marking;
  emit("setMarking", image);
}

function onRimExtra(id) {
  emit("select", id === "select" ? rimImage.value : null);
  closeRim();
}

// The rim is fixed over the page: it does not follow the strip
watch(() => props.active, active => {
  if (!active)
    closeRim();
});

function onAuxClick(e, image) {
  if (e.button !== 1)
    return;

  if (rimImage.value === image)
    closeRim();
  else
    openRim(image, e.currentTarget);
}

function onContextMenu(e, image) {
  emit("interact");
  openImageMenu(e, image, ctx);
}

function onMouseEnter(e, image) {
  setHoveredImageTarget({getImage: () => image, ctx, element: e.currentTarget, view: () => emit("open", image)});
}

function onMouseLeave(e, image) {
  clearHoveredImageTarget(e.currentTarget);
  onRimLeave(e, image);
}

function onOpen(image) {
  closeRim();
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
           :title="image === selected ? 'Click to open, middle-click for the actions; shown in the result pane' : 'Click to open, middle-click for the actions'"
           @click="onOpen(image)" @mousedown.middle.prevent @auxclick="onAuxClick($event, image)"
           @contextmenu="onContextMenu($event, image)"
           @mouseenter="onMouseEnter($event, image)" @mouseleave="onMouseLeave($event, image)"
           @dragstart="startImageDrag($event, image, KIND_SESSION)" @dragend="endImageDrag">
    </div>

    <!-- Over the page, since the strip clips it; its clicks stay here, so that they do not open the image -->
    <Teleport to="body">
      <Transition name="rim">
        <div v-if="rimImage" ref="rimElement" class="session-rim" :style="rimStyle" @click.stop @auxclick.stop
             @pointerout="onRimPointerOut">
          <ActionRim :groups="rimGroups" :size="Math.min(rimBox.width, rimBox.height)" :marking="rimMarking"
                     :show-alt="shiftKey" :extras="rimExtras"
                     @run="onRimAction" @set-marking="onRimMarking" @extra="onRimExtra"/>
        </div>
      </Transition>
    </Teleport>
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

.session-rim {
  position: fixed;
  z-index: 50;
  pointer-events: none;
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}

.rim-enter-from,
.rim-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.empty {
  margin: auto;
  color: var(--ib-muted);
  font-size: 12px;
}
</style>
