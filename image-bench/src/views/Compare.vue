<script setup>
import {computed, nextTick, onActivated, onDeactivated, reactive, ref, watch} from "vue";
import {useCompareStore} from "@/stores/compare.js";
import {KIND_COMPARE} from "@/consts.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {dialog, dialogStack} from "@/dialogs/useDialog.js";
import {isContextMenuOpen} from "@/contextMenu.js";
import {sendUrlToPhotoshop} from "@/photoshop.js";
import {
  REGION_ASPECTS, MIN_REGION, stripDirection, spanRegion, resizeRegion, moveRegion, fitRegionToAspect,
  containsPoint, regionPixelRatio, renderCropGrid
} from "@/components/compare/compareGeometry.js";
import CompareToolbar from "@/components/compare/CompareToolbar.vue";
import CompareItem from "@/components/compare/CompareItem.vue";
import CropGrid from "@/components/compare/CropGrid.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";

const REGION_KEY = "imageBench_compareRegion";
const ASPECT_KEY = "imageBench_compareAspect";
const SEPARATOR_KEY = "imageBench_compareSeparator";

const SEPARATORS = [
  {id: "light", name: "white", color: "#f2f2f2"},
  {id: "dark", name: "black", color: "#000000"},
  {id: "accent", name: "accent color", color: "var(--ib-accent)"}
];
const SEPARATOR_WIDTH = 2;

// Zoom relative to fit
const MAX_ZOOM = 32;
const ZOOM_STEP = 1.25;
// Pixels of a wheel line (deltaMode 1)
const WHEEL_LINE = 40;

const store = useCompareStore();
const storage = useLocalStorage();
const imageOps = useImageOperations();

const stripElement = ref(null);
const cropGrid = ref(null);
const fileInput = ref(null);

// Natural sizes of the images by URL, loaded before the images are laid out
const sizes = reactive({});
const loading = new Set();

watch(() => store.images.map(image => image.imageUrl), urls => {
  for (const url of urls) {
    if (!url || url in sizes || loading.has(url))
      continue;

    loading.add(url);
    const image = new Image();
    image.onload = () => {
      sizes[url] = {w: image.naturalWidth, h: image.naturalHeight};
      loading.delete(url);
    };
    image.onerror = () => {
      sizes[url] = {w: 1, h: 1, error: true};
      loading.delete(url);
    };
    image.src = url;
  }
}, {immediate: true});

function sizeOf(image) {
  return sizes[image.imageUrl] || {w: 1, h: 1};
}

const direction = computed(() => stripDirection(store.images.map(image => sizes[image.imageUrl])));

// View settings, kept per browser
const region = ref(storage.getJsonItem(REGION_KEY));
const aspect = ref(storage.getItem(ASPECT_KEY, "free"));
const separator = ref(storage.getItem(SEPARATOR_KEY, "light"));
const aspectRatio = computed(() => REGION_ASPECTS.find(option => option.id === aspect.value)?.ratio ?? null);
const separatorInfo = computed(() => SEPARATORS.find(option => option.id === separator.value) || SEPARATORS[0]);

watch(region, value => value ? storage.setJsonItem(REGION_KEY, value) : storage.removeItem(REGION_KEY));
watch(separator, value => storage.setItem(SEPARATOR_KEY, value));

watch(aspect, value => {
  storage.setItem(ASPECT_KEY, value);

  if (region.value && aspectRatio.value && store.images.length)
    region.value = fitRegionToAspect(region.value, aspectRatio.value, sizeOf(store.images[0]));
});

const selecting = ref(false);
const cropView = ref(false);
const exporting = ref(false);

watch(() => !!region.value && store.images.length > 0, available => {
  if (!available)
    cropView.value = false;
});

watch(cropView, crop => {
  if (crop)
    selecting.value = false;
});

function cycleSeparator() {
  const index = SEPARATORS.findIndex(option => option.id === separator.value);
  separator.value = SEPARATORS[(index + 1) % SEPARATORS.length].id;
}

// ---------- Actions on the images ----------

const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");
const paramsOverlayImage = ref(null);

function onShowParams(image) {
  paramsOverlayText.value = imageOps.getImageParams(image);
  paramsOverlayImage.value = image;
  showParamsOverlay.value = true;
}

// Context of the image actions (imageActions.js): the trays and other targets, seed and parameters
const actionContext = {
  kind: KIND_COMPARE,
  isTray: false,
  upscalable: false,
  handlers: {
    showParams: onShowParams,
    addComment: image => addComment(image),
    openImage: image => imageOps.openImageInNewWindow(image)
  }
};

async function addComment(image) {
  const comment = await dialog.prompt("Comment:", {defaultValue: image.comment || "", storageKey: "imageComment"});

  if (comment) {
    image.comment = comment;
    store.persist();
  }
}

function setMarking(image, marking) {
  if (marking)
    image.marking = marking;
  else
    delete image.marking;

  store.persist();
}

function onMove(from, insertBefore) {
  store.moveImage(from, insertBefore > from ? insertBefore - 1 : insertBefore);
}

async function onClear() {
  const count = store.images.length;

  if (count && await dialog.confirm(`Remove all ${count} images from the Compare tab? The files stay on disk.`,
      {okText: "Remove", danger: true}))
    store.clear();
}

async function onFilesChosen(e) {
  for (const file of e.target.files) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/image-bench/compare_upload", {method: "post", body: formData});
      const result = response.ok ? await response.json() : {error: await response.text()};

      if (result.error)
        await dialog.alert(result.error, {title: "Upload failed"});
      else
        await store.addImage(result);
    } catch (error) {
      await dialog.alert(error.message, {title: "Upload failed"});
    }
  }

  e.target.value = "";
}

// ---------- Overlay ----------

const overlayIndex = ref(-1);
const overlayImage = computed(() => store.images[overlayIndex.value] || null);

function openOverlay(index) {
  overlayIndex.value = index;
}

function closeOverlay() {
  overlayIndex.value = -1;
}

// ---------- Zoom ----------

const zoom = ref(1);
const center = ref({x: 0.5, y: 0.5});
const zoomLabel = ref("");

function clampCenter(point, k) {
  const margin = 0.5 / k;
  return {
    x: Math.min(1 - margin, Math.max(margin, point.x)),
    y: Math.min(1 - margin, Math.max(margin, point.y))
  };
}

function firstItemElement() {
  return stripElement.value?.querySelector(".compare-item");
}

// The label shows the zoom in pixels of the first image
function updateZoomLabel() {
  const element = firstItemElement();
  const size = store.images.length && sizeOf(store.images[0]);

  zoomLabel.value = element && size ? `${Math.round(zoom.value * element.clientWidth / size.w * 100)}%` : "";
}

function setZoom(k, point = center.value) {
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, k));
  center.value = zoom.value === 1 ? {x: 0.5, y: 0.5} : clampCenter(point, zoom.value);
  updateZoomLabel();
}

// "fit" or a zoom in pixels of the first image
function onZoom(mode) {
  const element = firstItemElement();

  if (mode === "fit" || !element || !store.images.length)
    setZoom(1);
  else
    setZoom(mode * sizeOf(store.images[0]).w / element.clientWidth);
}

// Ctrl+wheel zooms around the pointer: the image point under it stays there
function zoomAt(e) {
  const element = e.target.closest(".compare-item") || firstItemElement();

  if (!element)
    return;

  const rect = element.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width - 0.5;
  const py = (e.clientY - rect.top) / rect.height - 0.5;
  const k = zoom.value;
  const next = Math.min(MAX_ZOOM, Math.max(1, e.deltaY < 0 ? k * ZOOM_STEP : k / ZOOM_STEP));
  const fx = center.value.x + px / k;
  const fy = center.value.y + py / k;

  setZoom(next, {x: fx - px / next, y: fy - py / next});
}

function onStripWheel(e) {
  if (e.ctrlKey) {
    e.preventDefault();
    zoomAt(e);
  }
  // A vertical wheel scrolls the horizontal strip
  else if (direction.value === "horizontal" && e.deltaY && !e.shiftKey) {
    e.preventDefault();
    stripElement.value.scrollLeft += e.deltaY * (e.deltaMode === 1 ? WHEEL_LINE : 1);
  }
}

// ---------- Pointer: drag-scroll, pan, region ----------

const dragging = ref(false);
let removeDragListeners = null;

function trackDrag(onMove, onEnd) {
  dragging.value = true;

  const move = e => onMove(e);
  const up = e => {
    finish();
    onEnd?.(e);
  };
  const finish = () => {
    dragging.value = false;
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    removeDragListeners = null;
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  removeDragListeners = finish;
}

function onStripMouseDown(e) {
  // Middle click opens the overlay on auxclick; no autoscroll
  if (e.button === 1) {
    e.preventDefault();
    return;
  }

  if (e.button !== 0 || e.target.closest(".compare-chrome"))
    return;

  const item = e.target.closest(".compare-item");

  if (item && e.shiftKey) {
    e.preventDefault();
    openOverlay(Number(item.dataset.index));
    return;
  }

  e.preventDefault();

  if (item && selecting.value)
    startRegionDrag(e, item, Number(item.dataset.index));
  else
    startPan(e, item);
}

function onStripAuxClick(e) {
  const item = e.target.closest(".compare-item");

  if (e.button === 1 && item && !e.target.closest(".compare-chrome"))
    openOverlay(Number(item.dataset.index));
}

// Zoomed images pan together, otherwise the strip scrolls
function startPan(e, item) {
  const strip = stripElement.value;
  const start = {x: e.clientX, y: e.clientY, left: strip.scrollLeft, top: strip.scrollTop, center: center.value};
  const box = item?.getBoundingClientRect();

  trackDrag(ev => {
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;

    if (zoom.value > 1 && box)
      center.value = clampCenter({
        x: start.center.x - dx / (box.width * zoom.value),
        y: start.center.y - dy / (box.height * zoom.value)
      }, zoom.value);
    else {
      strip.scrollLeft = start.left - dx;
      strip.scrollTop = start.top - dy;
    }
  });
}

// Drawn outside the region, moved inside it, resized by its handles
function startRegionDrag(e, item, index) {
  const rect = item.querySelector(".compare-stage").getBoundingClientRect();
  const size = sizeOf(store.images[index]);
  const clamp01 = value => Math.min(1, Math.max(0, value));
  const toPoint = ev => ({
    x: clamp01((ev.clientX - rect.left) / rect.width),
    y: clamp01((ev.clientY - rect.top) / rect.height)
  });

  const start = toPoint(e);
  const initial = region.value;
  const handle = initial && e.target.dataset?.handle;
  const mode = handle ? "resize" : containsPoint(initial, start) ? "move" : "draw";

  // Shift keeps the ratio of the region (square without one)
  const ratioOf = ev => ev.shiftKey ? (initial ? regionPixelRatio(initial, size) : 1) : aspectRatio.value;

  trackDrag(ev => {
    const point = toPoint(ev);

    if (mode === "draw")
      region.value = spanRegion(start, point, ratioOf(ev), size);
    else if (mode === "resize")
      region.value = resizeRegion(initial, handle, point, ratioOf(ev), size);
    else
      region.value = moveRegion(initial, point.x - start.x, point.y - start.y);
  }, () => {
    const result = region.value;

    if (mode !== "move" && result && (result.w < MIN_REGION || result.h < MIN_REGION))
      region.value = initial;
  });
}

// ---------- Crop export ----------

function resolvedSeparatorColor() {
  const color = separatorInfo.value.color;
  const variable = /^var\((--[\w-]+)\)$/.exec(color);

  return variable ? getComputedStyle(document.documentElement).getPropertyValue(variable[1]).trim() : color;
}

async function renderCrops() {
  exporting.value = true;

  try {
    return await renderCropGrid(store.images.map(image => image.imageUrl), region.value,
      cropGrid.value?.grid.cols || 1, resolvedSeparatorColor());
  } catch (error) {
    await dialog.alert(error.message, {title: "Export failed"});
    return null;
  } finally {
    exporting.value = false;
  }
}

async function onSavePng() {
  const blob = await renderCrops();

  if (!blob)
    return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "compare-crops.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function onSendToPhotoshop() {
  const blob = await renderCrops();

  if (!blob)
    return;

  const url = URL.createObjectURL(blob);
  const error = await sendUrlToPhotoshop(url, "Compare crops.png", true);
  URL.revokeObjectURL(url);

  if (error)
    await dialog.alert(error, {title: "Send to Photoshop"});
}

// ---------- Keys ----------

// Image under the pointer in the strip, which ←/→ move
const hoveredIndex = ref(-1);

function onStripMouseOver(e) {
  const item = e.target.closest(".compare-item");
  hoveredIndex.value = item ? Number(item.dataset.index) : -1;
}

function isTyping(e) {
  const element = e.target;
  return element instanceof HTMLElement
    && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

async function moveHovered(step) {
  const from = hoveredIndex.value;
  const to = from + step;

  if (from < 0 || to < 0 || to >= store.images.length)
    return;

  store.moveImage(from, to);
  hoveredIndex.value = to;

  await nextTick();
  stripElement.value?.querySelector(`.compare-item[data-index="${to}"]`)
    ?.scrollIntoView({block: "nearest", inline: "nearest"});
}

function onKeydown(e) {
  if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e) || dialogStack.value.length || isContextMenuOpen()
      || showParamsOverlay.value)
    return;

  if (overlayImage.value) {
    if (e.key === "Escape")
      closeOverlay();
    else if (e.key === "ArrowLeft" && overlayIndex.value > 0)
      overlayIndex.value--;
    else if (e.key === "ArrowRight" && overlayIndex.value < store.images.length - 1)
      overlayIndex.value++;
    return;
  }

  if (e.repeat && !e.key.startsWith("Arrow"))
    return;

  if (e.key === "Escape" && selecting.value)
    selecting.value = false;
  else if (e.code === "KeyR" && store.images.length && !cropView.value)
    selecting.value = !selecting.value;
  else if (e.code === "KeyX" && region.value && store.images.length)
    cropView.value = !cropView.value;
  else if (!cropView.value && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    moveHovered(e.key === "ArrowLeft" ? -1 : 1);
  }
}

onActivated(() => {
  window.addEventListener("keydown", onKeydown);
  updateZoomLabel();
});

onDeactivated(() => {
  window.removeEventListener("keydown", onKeydown);
  removeDragListeners?.();
});
</script>

<template>
  <ImageOverlay v-if="overlayImage"
                :image="overlayImage"
                :kind="KIND_COMPARE"
                markable
                @show-params="onShowParams"
                @add-comment="addComment"
                @hide-overlay="closeOverlay"
                @set-marking="store.persist()"/>
  <ParametersOverlay v-if="showParamsOverlay"
                     :image="paramsOverlayImage"
                     :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <input type="file" class="file-input" ref="fileInput" accept=".png, .jpg, .jpeg, .webp" multiple
           @change="onFilesChosen">

    <CompareToolbar :image-count="store.images.length"
                    :selecting="selecting"
                    :has-region="!!region"
                    :crop-view="cropView"
                    v-model:aspect="aspect"
                    :zoom="zoom"
                    :zoom-label="zoomLabel"
                    :separator-name="separatorInfo.name"
                    :separator-color="separatorInfo.color"
                    :exporting="exporting"
                    @upload="fileInput.click()"
                    @toggle-select="selecting = !selecting"
                    @clear-region="region = null"
                    @toggle-crop="cropView = !cropView"
                    @zoom="onZoom"
                    @cycle-separator="cycleSeparator"
                    @save-png="onSavePng"
                    @send-to-photoshop="onSendToPhotoshop"
                    @clear="onClear"/>

    <div v-if="!store.images.length" class="empty-hint">
      Add images with the <b>Add to compare</b> button of an image (key A), by dragging images onto the Compare tab,
      from files with the upload button, or from Photoshop.
    </div>

    <CropGrid v-if="cropView && region"
              ref="cropGrid"
              :images="store.images"
              :sizes="sizes"
              :region="region"
              :separator-color="separatorInfo.color"
              :separator-width="SEPARATOR_WIDTH"
              :ctx="actionContext"
              @remove="store.removeImage"
              @set-marking="setMarking"
              @open="openOverlay"/>

    <!-- Kept while the crops are shown, so that the zoom and scroll position stay -->
    <div v-show="!cropView && store.images.length" ref="stripElement" class="compare-strip"
         :class="[direction, {dragging, selecting}]"
         @mousedown="onStripMouseDown" @auxclick="onStripAuxClick" @wheel="onStripWheel"
         @mouseover="onStripMouseOver" @mouseleave="hoveredIndex = -1">
      <template v-for="(image, index) in store.images" :key="image.imageUrl">
        <div v-if="index" class="compare-separator" :style="{background: separatorInfo.color}"></div>
        <CompareItem :image="image"
                     :index="index"
                     :size="sizeOf(image)"
                     :direction="direction"
                     :region="region"
                     :selecting="selecting"
                     :zoom="zoom"
                     :center="center"
                     :ctx="actionContext"
                     @remove="store.removeImage(image)"
                     @set-marking="marking => setMarking(image, marking)"
                     @move="onMove"
                     @open="openOverlay(index)"/>
      </template>
    </div>
  </div>
</template>

<style scoped>
.file-input {
  display: none;
}

.empty-hint {
  margin: 40px auto;
  max-width: 520px;
  color: var(--ib-text-2);
  text-align: center;
  line-height: 1.6;
}

.compare-strip {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: auto;
}

.compare-strip.horizontal {
  flex-direction: row;
}

.compare-strip.vertical {
  flex-direction: column;
}

.compare-strip.dragging,
.compare-strip.dragging :deep(.compare-item) {
  cursor: grabbing;
}

.compare-strip.selecting.dragging,
.compare-strip.selecting.dragging :deep(.compare-item) {
  cursor: crosshair;
}

.compare-separator {
  flex: none;
}

/* SEPARATOR_WIDTH */
.horizontal > .compare-separator {
  width: 2px;
}

.vertical > .compare-separator {
  height: 2px;
}
</style>
