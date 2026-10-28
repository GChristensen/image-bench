<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from "vue";
import {openImageMenu} from "@/contextMenu.js";
import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
import {cropAspect, packGrid} from "@/components/compare/compareGeometry.js";
import CompareChrome from "@/components/compare/CompareChrome.vue";
import {useRimPress} from "@/composables/useRimPress.js";

/**
 * The region of each image of the Compare tab, packed into the grid with the largest cells that fit. The wheel
 * scales the cells around the pointer (zoom relative to that fit, keeping the columns), a left drag pans them, and
 * a click without a drag opens the image.
 */
const props = defineProps({
  images: {
    type: Array,
    required: true
  },
  // Natural sizes {w, h} by image URL
  sizes: {
    type: Object,
    required: true
  },
  region: {
    type: Object,
    required: true
  },
  separatorColor: {
    type: String,
    required: true
  },
  separatorWidth: {
    type: Number,
    default: 2
  },
  // Scale of the cells relative to the fit
  zoom: {
    type: Number,
    default: 1
  },
  ctx: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["setMarking", "open", "update:zoom"]);

const ZOOM_STEP = 1.25;
// Up to this many times the native pixels of the largest crop
const MAX_NATIVE_ZOOM = 4;
// Pointer movement in pixels that makes a press a pan instead of a click
const DRAG_THRESHOLD = 4;

const rootElement = ref(null);
const gridElement = ref(null);
const area = ref({width: 0, height: 0});
const hoveredIndex = ref(-1);
// The cell whose action rim a middle click toggled on, until the pointer leaves it
const rimIndex = ref(-1);
const panning = ref(false);

const aspect = computed(() => cropAspect(props.region, props.images.map(image => props.sizes[image.imageUrl])));
// The fit layout, also the columns of the export
const grid = computed(() => packGrid(props.images.length, aspect.value, area.value.width, area.value.height,
  props.separatorWidth));
const fillers = computed(() => grid.value.cols * grid.value.rows - props.images.length);

// Zoom at which the largest crop is shown in its native pixels
const nativeZoom = computed(() => {
  const widths = props.images.map(image => props.sizes[image.imageUrl]).filter(Boolean)
    .map(size => props.region.w * size.w);
  return widths.length && grid.value.cellWidth ? Math.max(...widths) / grid.value.cellWidth : 1;
});
const maxZoom = computed(() => Math.max(2, nativeZoom.value * MAX_NATIVE_ZOOM));

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${grid.value.cols}, ${Math.floor(grid.value.cellWidth * props.zoom)}px)`,
  gridAutoRows: `${Math.floor(grid.value.cellHeight * props.zoom)}px`,
  gap: `${props.separatorWidth}px`,
  background: props.separatorColor
}));

// The crop fills the cell: the image is scaled up by the inverse of the region and shifted to it
const imageStyle = computed(() => {
  const {x, y, w, h} = props.region;
  return {width: `${100 / w}%`, height: `${100 / h}%`, left: `${-x / w * 100}%`, top: `${-y / h * 100}%`};
});

let observer = null;
let laidOut = false;

onMounted(() => {
  observer = new ResizeObserver(async ([entry]) => {
    area.value = {width: entry.contentRect.width, height: entry.contentRect.height};

    // A zoom kept from before shows the middle of the grid
    if (!laidOut) {
      laidOut = true;
      await nextTick();
      const element = rootElement.value;
      element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    }
  });
  observer.observe(rootElement.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  removePanListeners?.();
});

// ---------- Zoom ----------

// The grid point under the client point (the middle of the area without one) stays there
async function setZoom(k, clientX, clientY) {
  const next = Math.min(maxZoom.value, Math.max(1, k));
  const element = rootElement.value;

  if (next === props.zoom || !element)
    return;

  const areaRect = element.getBoundingClientRect();
  clientX ??= areaRect.left + areaRect.width / 2;
  clientY ??= areaRect.top + areaRect.height / 2;

  const before = gridElement.value.getBoundingClientRect();
  const fx = (clientX - before.left) / before.width;
  const fy = (clientY - before.top) / before.height;

  emit("update:zoom", next);
  await nextTick();

  const after = gridElement.value.getBoundingClientRect();
  element.scrollLeft += after.left + fx * after.width - clientX;
  element.scrollTop += after.top + fy * after.height - clientY;
}

function onWheel(e) {
  if (!e.deltaY)
    return;

  e.preventDefault();
  setZoom(e.deltaY < 0 ? props.zoom * ZOOM_STEP : props.zoom / ZOOM_STEP, e.clientX, e.clientY);
}

// ---------- Pan ----------

let removePanListeners = null;
// The click that ends a pan does not open the image
let suppressClick = false;

function onMouseDown(e) {
  // A middle press on a cell shows its action rim (released on a sector it runs it); no autoscroll
  if (e.button === 1) {
    e.preventDefault();
    const cell = e.target.closest(".crop-cell");
    const index = cell ? [...gridElement.value.children].indexOf(cell) : -1;

    // Not on the controls of the chrome (the rim, the marking badge), which handle their own middle clicks
    if (index >= 0 && rimIndex.value !== index && !e.target.closest(".compare-chrome")) {
      pressIndex = index;
      rimPress.begin(e);
    }

    return;
  }

  if (e.button !== 0 || e.target.closest(".compare-chrome"))
    return;

  e.preventDefault();

  const element = rootElement.value;
  const start = {x: e.clientX, y: e.clientY, left: element.scrollLeft, top: element.scrollTop};

  const move = ev => {
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;

    if (!panning.value && Math.hypot(dx, dy) < DRAG_THRESHOLD)
      return;

    panning.value = true;
    element.scrollLeft = start.left - dx;
    element.scrollTop = start.top - dy;
  };
  const up = () => {
    finish();

    if (panning.value) {
      suppressClick = true;
      setTimeout(() => suppressClick = false);
    }

    panning.value = false;
  };
  const finish = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    removePanListeners = null;
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  removePanListeners = finish;
}

// ---------- Cells ----------

function onCellEnter(e, image, index) {
  if (rimPress.pressing)
    return;

  hoveredIndex.value = index;
  setHoveredImageTarget({
    getImage: () => image,
    ctx: props.ctx,
    element: e.currentTarget,
    setMarking: marking => emit("setMarking", image, marking),
    view: () => emit("open", index)
  });
}

function onCellLeave(e) {
  if (rimPress.pressing)
    return;

  hoveredIndex.value = -1;
  rimIndex.value = -1;
  clearHoveredImageTarget(e.currentTarget);
}

// A click opens the image in the overlay, a middle click toggles its action rim
function onCellClick(index) {
  if (!suppressClick)
    emit("open", index);
}

// The cell of a middle press that shows its rim, and the chrome of each cell, whose rim the gesture reads
let pressIndex = -1;
const chromes = [];
const rimPress = useRimPress({get value() { return chromes[pressIndex]?.rimElement; }}, {
  show: () => rimIndex.value = pressIndex,
  hide: () => rimIndex.value = -1,
  leave: () => {
    hoveredIndex.value = -1;
    rimIndex.value = -1;
    clearHoveredImageTarget(gridElement.value?.children[pressIndex]);
  },
  element: () => gridElement.value?.children[pressIndex]
});

function onCellAuxClick(e, index) {
  if (e.button === 1 && !rimPress.handlesAuxClick())
    rimIndex.value = rimIndex.value === index ? -1 : index;
}

defineExpose({grid, nativeZoom, setZoom});
</script>

<template>
  <div ref="rootElement" class="crop-area" :class="{zoomed: zoom > 1, panning}"
       @wheel="onWheel" @mousedown="onMouseDown">
    <div ref="gridElement" class="crop-grid" :style="gridStyle">
      <div v-for="(image, index) in images" :key="image.imageUrl" class="crop-cell"
           @mouseenter="onCellEnter($event, image, index)" @mouseleave="onCellLeave"
           @click="onCellClick(index)" @auxclick="onCellAuxClick($event, index)"
           @contextmenu="openImageMenu($event, image, ctx)">
        <img :src="image.imageUrl" :style="imageStyle" draggable="false" alt="">
        <CompareChrome :ref="el => chromes[index] = el" :image="image" :index="index" :ctx="ctx" :hovered="hoveredIndex === index && !panning"
                       :rim-toggled="rimIndex === index" @hide-rim="rimIndex = -1"
                       @set-marking="marking => emit('setMarking', image, marking)"
                       @open="emit('open', index)"/>
      </div>
      <div v-for="filler in fillers" :key="'filler' + filler" class="crop-filler"></div>
    </div>
  </div>
</template>

<style scoped>
/* Scrolled by dragging; without scrollbars, which would change the fit */
.crop-area {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: auto;
  scrollbar-width: none;
}

.crop-area::-webkit-scrollbar {
  display: none;
}

/* Centered while it fits, and scrollable to every edge when zoomed */
.crop-grid {
  display: grid;
  margin: auto;
  flex: none;
}

.crop-cell {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.crop-area.zoomed .crop-cell {
  cursor: grab;
}

.crop-area.panning,
.crop-area.panning * {
  cursor: grabbing !important;
}

.crop-cell img {
  position: absolute;
  max-width: none;
  user-select: none;
}

.crop-filler {
  background: var(--ib-bg);
}
</style>
