<script setup>
import {computed, ref} from "vue";
import {openImageMenu} from "@/contextMenu.js";
import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
import AppIcon from "@/components/AppIcon.vue";
import CompareChrome from "@/components/compare/CompareChrome.vue";
import {useRimPress} from "@/composables/useRimPress.js";

/**
 * One image of the Compare strip: a box of the image's aspect ratio that shows the image at the shared zoom
 * and center, with the region drawn over it. Pointer drags are handled by the view (Compare.vue), which finds
 * the stage by .compare-stage and the handles by data-handle.
 */
const props = defineProps({
  image: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  // Natural size {w, h}
  size: {
    type: Object,
    required: true
  },
  direction: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value)
  },
  region: {
    type: Object,
    default: null
  },
  selecting: {
    type: Boolean,
    default: false
  },
  // Zoom relative to the box (1 shows the whole image) and the shown center as image fractions
  zoom: {
    type: Number,
    default: 1
  },
  center: {
    type: Object,
    default: () => ({x: 0.5, y: 0.5})
  },
  ctx: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["setMarking", "move", "open"]);

const REORDER_TYPE = "application/x-image-bench-compare";
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const rootElement = ref(null);
const hovered = ref(false);
// A middle click toggles the action rim, as on the image cards
const rimToggled = ref(false);
// Side of this item where a dragged item would be inserted
const dropSide = ref(null);

const stageStyle = computed(() => ({
  width: `${props.zoom * 100}%`,
  height: `${props.zoom * 100}%`,
  left: `${(0.5 - props.center.x * props.zoom) * 100}%`,
  top: `${(0.5 - props.center.y * props.zoom) * 100}%`
}));

const regionStyle = computed(() => props.region && {
  left: `${props.region.x * 100}%`,
  top: `${props.region.y * 100}%`,
  width: `${props.region.w * 100}%`,
  height: `${props.region.h * 100}%`
});

function onMouseEnter() {
  hovered.value = true;
  setHoveredImageTarget({
    getImage: () => props.image,
    ctx: props.ctx,
    element: rootElement.value,
    setMarking: marking => emit("setMarking", marking),
    view: () => emit("open")
  });
}

function onMouseLeave() {
  if (rimPress.pressing)
    return;

  hovered.value = false;
  rimToggled.value = false;
  clearHoveredImageTarget(rootElement.value);
}

// A middle press that shows the rim runs the sector it is released on (useRimPress.js)
const chromeElement = ref(null);
const rimPress = useRimPress(computed(() => chromeElement.value?.rimElement), {
  show: () => rimToggled.value = true,
  hide: () => rimToggled.value = false,
  leave: onMouseLeave,
  element: () => rootElement.value
});

// Not on the controls of the chrome (the rim, the marking badge), which handle their own middle clicks
function onMiddleDown(e) {
  if (e.button === 1 && !rimToggled.value && !e.target.closest(".compare-chrome"))
    rimPress.begin(e);
}

function onAuxClick(e) {
  if (e.button === 1 && !rimPress.handlesAuxClick())
    rimToggled.value = !rimToggled.value;
}

function onGripDragStart(e) {
  e.dataTransfer.setData(REORDER_TYPE, String(props.index));
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setDragImage(rootElement.value, 20, 20);
}

function onDragOver(e) {
  if (!e.dataTransfer.types.includes(REORDER_TYPE))
    return;

  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  const rect = rootElement.value.getBoundingClientRect();
  const after = props.direction === "vertical"
    ? e.clientY > rect.top + rect.height / 2
    : e.clientX > rect.left + rect.width / 2;

  dropSide.value = after ? "after" : "before";
}

function onDragLeave(e) {
  if (!rootElement.value.contains(e.relatedTarget))
    dropSide.value = null;
}

// Emits the index the image is inserted before
function onDrop(e) {
  const side = dropSide.value;
  dropSide.value = null;

  const from = Number(e.dataTransfer.getData(REORDER_TYPE));

  if (side && Number.isInteger(from)) {
    e.preventDefault();
    emit("move", from, side === "after" ? props.index + 1 : props.index);
  }
}
</script>

<template>
  <div ref="rootElement" class="compare-item" :class="[direction, dropSide && 'drop-' + dropSide, {selecting}]"
       :style="{aspectRatio: `${size.w} / ${size.h}`}" :data-index="index"
       @mouseenter="onMouseEnter" @mouseleave="onMouseLeave" @mousedown="onMiddleDown" @auxclick="onAuxClick"
       @contextmenu="openImageMenu($event, image, ctx)"
       @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div class="compare-stage" :style="stageStyle">
      <img :src="image.imageUrl" draggable="false" alt="">
      <div v-if="region" class="region" :style="regionStyle">
        <template v-if="selecting">
          <span v-for="handle in HANDLES" :key="handle" class="handle" :class="handle" :data-handle="handle"></span>
        </template>
      </div>
    </div>

    <CompareChrome ref="chromeElement" :image="image" :index="index" :ctx="ctx" :hovered="hovered" :rim-toggled="rimToggled"
                   @hide-rim="rimToggled = false"
                   @set-marking="marking => emit('setMarking', marking)"
                   @open="emit('open')">
      <template #lead>
        <span class="grip" draggable="true" title="Drag to reorder (or ←/→ over the image)"
              @dragstart="onGripDragStart"><AppIcon name="grip" :size="12"/></span>
      </template>
    </CompareChrome>
  </div>
</template>

<style scoped>
.compare-item {
  position: relative;
  flex: none;
  overflow: hidden;
  cursor: grab;
}

.compare-item.horizontal {
  height: 100%;
}

.compare-item.vertical {
  width: 100%;
}

.compare-item.selecting {
  cursor: crosshair;
}

.compare-stage {
  position: absolute;
}

.compare-stage img {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.region {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed var(--ib-accent);
  outline: 1px solid rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

/* While selecting, the image outside the region is dimmed and the region can be moved */
.selecting .region {
  border-style: solid;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.4);
  cursor: move;
  pointer-events: auto;
}

.handle {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.7);
  background: var(--ib-accent);
}

.handle.nw { left: 0; top: 0; cursor: nwse-resize; }
.handle.n { left: 50%; top: 0; cursor: ns-resize; }
.handle.ne { left: 100%; top: 0; cursor: nesw-resize; }
.handle.e { left: 100%; top: 50%; cursor: ew-resize; }
.handle.se { left: 100%; top: 100%; cursor: nwse-resize; }
.handle.s { left: 50%; top: 100%; cursor: ns-resize; }
.handle.sw { left: 0; top: 100%; cursor: nesw-resize; }
.handle.w { left: 0; top: 50%; cursor: ew-resize; }

.grip {
  display: inline-flex;
  margin-left: -3px;
  color: var(--ib-text-2);
  cursor: grab;
}

.grip:hover {
  color: #fff;
}

/* Insertion point of a dragged image */
.compare-item::after {
  content: "";
  position: absolute;
  background: var(--ib-accent);
  opacity: 0;
  pointer-events: none;
}

.compare-item.horizontal::after {
  top: 0;
  bottom: 0;
  width: 4px;
}

.compare-item.vertical::after {
  left: 0;
  right: 0;
  height: 4px;
}

.compare-item.horizontal.drop-before::after { left: 0; opacity: 1; }
.compare-item.horizontal.drop-after::after { right: 0; opacity: 1; }
.compare-item.vertical.drop-before::after { top: 0; opacity: 1; }
.compare-item.vertical.drop-after::after { bottom: 0; opacity: 1; }
</style>
