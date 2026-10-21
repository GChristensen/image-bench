<script setup>
/**
 * Images of the ControlNet sweep: the reference image with the unit's values when the sweep started, kept in view at
 * the left, and the matrix of weights (rows) x ending steps (columns), both ascending from the top left. Apply on an image
 * or in its overlay, or a click on a row or column header, sets its values in the unit. The cards have no action rim:
 * the overlay of a cell moves along its row with ←/→ and along its column with ↑/↓, over the cells that have an image
 */
import {computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, toRaw, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import GeneratedImage from "@/components/GeneratedImage.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {createImageLink} from "@/sdwebui.js";
import {roundSweepValue, useControlNetSweepStore} from "@/stores/controlnetSweep.js";

const props = defineProps({
  // Values of the unit shown in the tab, {weight, end}; the matching cell is marked
  current: {type: Object, required: true},
  // Control image (or preprocessor preview) shown under the reference image
  controlImage: {type: String, default: null}
});

const emit = defineEmits(["apply"]);

const sweep = useControlNetSweepStore();

const format = value => roundSweepValue(value).toFixed(2);

const isCurrent = (weight, end) => roundSweepValue(props.current.weight) === roundSweepValue(weight)
  && roundSweepValue(props.current.end) === roundSweepValue(end);

// ---------- Cell shape ----------

// The images of a sweep share one size (only the ControlNet values change): the cells take the aspect ratio of the
// first image, the pending ones too, so that the rows keep their height; square until it is known
const aspect = ref(null);

const firstImage = computed(() => sweep.reference?.image ?? Object.values(sweep.cells)[0] ?? null);

watch(firstImage, image => {
  aspect.value = null;

  if (!image)
    return;

  const probe = new Image();
  probe.onload = () => {
    if (firstImage.value === image && probe.naturalWidth && probe.naturalHeight)
      aspect.value = probe.naturalWidth / probe.naturalHeight;
  };
  probe.src = createImageLink(image);
}, {immediate: true});

const sweepStyle = computed(() => aspect.value ? {"--frame-aspect": aspect.value} : {});

// ---------- Overlays ----------

// The image shown in the overlay: {row, column} of a cell (indexes of sweep.weights / sweep.ends), or {reference: true}
const overlayPosition = ref(null);
const paramsImage = ref(null);
const highlightedImage = shallowRef(null);

const imageAt = (row, column) => sweep.cellAt(sweep.weights[row], sweep.ends[column]);

const overlayImage = computed(() => {
  const position = overlayPosition.value;

  if (!position)
    return null;

  return position.reference ? sweep.reference?.image ?? null : imageAt(position.row, position.column);
});

const overlayValues = computed(() => {
  const position = overlayPosition.value;

  if (!position)
    return null;

  return position.reference
    ? {weight: sweep.reference.weight, end: sweep.reference.end}
    : {weight: sweep.weights[position.row], end: sweep.ends[position.column]};
});

function openCell(row, column) {
  overlayPosition.value = {row, column};
}

function openReference() {
  overlayPosition.value = {reference: true};
}

/**
 * The nearest cell with an image from the overlay's cell, null at the edge. Up and down stay in the column; left and
 * right go on in the next or previous row (reading order), so that the diagonals generated first can be walked
 * @param {number} rowStep
 * @param {number} columnStep
 * @returns {{row: number, column: number}|null}
 */
function neighbour(rowStep, columnStep) {
  const position = overlayPosition.value;

  if (!position || position.reference)
    return null;

  const columns = sweep.ends.length;
  const rows = sweep.weights.length;
  let {row, column} = position;

  for (;;) {
    if (columnStep) {
      const index = row * columns + column + columnStep;
      row = Math.floor(index / columns);
      column = index - row * columns;
    }
    else
      row += rowStep;

    if (row < 0 || row >= rows)
      return null;

    if (imageAt(row, column))
      return {row, column};
  }
}

const hasLeft = computed(() => !!neighbour(0, -1));
const hasRight = computed(() => !!neighbour(0, 1));
const hasUp = computed(() => !!neighbour(-1, 0));
const hasDown = computed(() => !!neighbour(1, 0));

function step(rowStep, columnStep) {
  const next = neighbour(rowStep, columnStep);

  if (next)
    overlayPosition.value = next;
}

function applyOverlay() {
  if (overlayPosition.value && !overlayPosition.value.reference)
    emit("apply", {...overlayValues.value});
}

async function closeOverlay() {
  if (!overlayImage.value) {
    overlayPosition.value = null;
    return;
  }

  const image = toRaw(overlayImage.value);
  overlayPosition.value = null;
  highlightedImage.value = null;
  await nextTick();
  highlightedImage.value = image;
}

const isHighlighted = image => !!highlightedImage.value && toRaw(image) === highlightedImage.value;

function onImageOpen(image) {
  window.open(createImageLink(image), "_blank");
}

const ARROW_STEPS = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0]};

function onKeydown(e) {
  if (e.key === "Escape") {
    closeOverlay();
    paramsImage.value = null;
  }
  else if (overlayPosition.value && !paramsImage.value && ARROW_STEPS[e.key]) {
    e.preventDefault();
    step(...ARROW_STEPS[e.key]);
  }
}

// The tab is kept alive: listen only while it is shown
onMounted(() => document.addEventListener("keydown", onKeydown));
onActivated(() => document.addEventListener("keydown", onKeydown));
onDeactivated(() => document.removeEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <ImageOverlay v-if="overlayImage" :image="overlayImage" kind="controlnet_sweep" markable
                :has-prev="hasLeft" :has-next="hasRight" :has-up="hasUp" :has-down="hasDown"
                @navigate="columnStep => step(0, columnStep)" @navigate-vertical="rowStep => step(rowStep, 0)"
                @show-params="paramsImage = overlayImage" @hide-overlay="closeOverlay">
    <template #info>
      <span class="overlay-values">
        <template v-if="overlayPosition.reference">Current values · </template>w {{ format(overlayValues.weight) }} ·
        end {{ format(overlayValues.end) }}</span>
      <span v-if="!overlayPosition.reference && isCurrent(overlayValues.weight, overlayValues.end)"
            class="overlay-current">in the unit</span>
      <button v-else-if="!overlayPosition.reference" type="button" class="overlay-apply"
              :title="`Set weight ${format(overlayValues.weight)} and ending step ${format(overlayValues.end)}`"
              @click="applyOverlay"><AppIcon name="check" :size="14"/>Apply</button>
    </template>
  </ImageOverlay>
  <ParametersOverlay v-if="paramsImage" :image="paramsImage" @hide-overlay="paramsImage = null"/>

  <div class="sweep" :style="sweepStyle">
    <div v-if="!sweep.hasSweep" class="empty-state">
      Set the axes at the right, then press <b>Sweep</b>.
    </div>

    <template v-else>
      <aside class="reference">
        <div class="label-small">Current values</div>
        <div class="values">w {{ format(sweep.reference.weight) }} · end {{ format(sweep.reference.end) }}</div>
        <div class="frame">
          <GeneratedImage v-if="sweep.reference.image" kind="controlnet_sweep" :is-tray="false" :rim="false"
                          :image="sweep.reference.image" :highlighted="isHighlighted(sweep.reference.image)"
                          @show-params="paramsImage = sweep.reference.image"
                          @image-click="openReference"
                          @image-open="onImageOpen(sweep.reference.image)"/>
          <div v-else class="pending"></div>
        </div>
        <template v-if="controlImage">
          <div class="label-small">Control</div>
          <img class="control" :src="controlImage" alt="Control image">
        </template>
      </aside>

      <div class="matrix-scroller scrollable">
        <div class="matrix" :style="{'--columns': sweep.ends.length}">
          <div class="corner label-small">w \ end</div>
          <button v-for="end in sweep.ends" :key="end" type="button" class="column-header"
                  :class="{current: roundSweepValue(current.end) === end}"
                  :title="`Set the ending step to ${format(end)}`" @click="emit('apply', {end})">{{ format(end) }}</button>

          <template v-for="(weight, row) in sweep.weights" :key="weight">
            <button type="button" class="row-header" :class="{current: roundSweepValue(current.weight) === weight}"
                    :title="`Set the control weight to ${format(weight)}`"
                    @click="emit('apply', {weight})">{{ format(weight) }}</button>
            <div v-for="(end, column) in sweep.ends" :key="end" class="cell" :class="{current: isCurrent(weight, end)}">
              <div class="frame">
                <GeneratedImage v-if="sweep.cellAt(weight, end)" kind="controlnet_sweep" :is-tray="false" :rim="false"
                                :image="sweep.cellAt(weight, end)"
                                :highlighted="isHighlighted(sweep.cellAt(weight, end))"
                                @show-params="paramsImage = sweep.cellAt(weight, end)"
                                @image-click="openCell(row, column)"
                                @image-open="onImageOpen(sweep.cellAt(weight, end))"/>
                <div v-else class="pending"></div>
                <button v-if="sweep.cellAt(weight, end)" type="button" class="apply"
                        :title="`Set weight ${format(weight)} and ending step ${format(end)}`"
                        @click="emit('apply', {weight, end})"><AppIcon name="check" :size="12"/>Apply</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sweep {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.empty-state {
  margin: auto;
  color: var(--ib-muted);
}

.empty-state b {
  color: var(--ib-text-2);
  font-weight: 600;
}

/* The reference stays in view while the matrix scrolls */
.reference {
  flex: none;
  width: 216px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
}

/* A box of the cell width in the aspect ratio of the sweep's images (square until the first one is in), the image
   centered in it; pending cells have the same box, so the rows keep their height while the matrix is filled in */
.frame {
  flex: none;
  width: 100%;
  aspect-ratio: var(--frame-aspect, 1);
  container-type: size;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.frame :deep(.selectable-image) {
  max-width: 100%;
  max-height: 100%;
}

.frame :deep(.selectable-image-preview) {
  max-width: 100cqw;
  max-height: 100cqh;
}

.values {
  font-size: 12px;
  color: var(--ib-text);
  font-variant-numeric: tabular-nums;
}

.control {
  width: 100%;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: #000;
}

.matrix-scroller {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.matrix {
  display: grid;
  grid-template-columns: 48px repeat(var(--columns), minmax(168px, 1fr));
  gap: 8px;
  align-items: start;
  padding-bottom: 8px;
}

.corner,
.column-header {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 26px;
  background: var(--ib-bg);
}

.corner {
  left: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  text-transform: none;
}

.column-header,
.row-header {
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--ib-text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.row-header {
  position: sticky;
  left: 0;
  z-index: 1;
  align-self: stretch;
  padding-top: 8px;
  background: var(--ib-bg);
  text-align: left;
}

.column-header:hover,
.row-header:hover {
  color: var(--ib-text);
  background: var(--ib-elev-2);
}

.column-header.current,
.row-header.current {
  color: var(--ib-accent);
}

.cell {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell.current :deep(.selectable-image) {
  outline: 2px solid var(--ib-accent);
  outline-offset: 2px;
  border-radius: 6px;
}

/* Over the top left corner of the image (the rim toggle is at the top right), so that it takes no row space */
.apply {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ib-surface) 85%, transparent);
  color: var(--ib-text-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
}

.cell:hover .apply,
.apply:focus-visible {
  opacity: 1;
}

.apply:hover {
  color: var(--ib-accent);
  border-color: var(--ib-accent-border);
}

.overlay-values {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.overlay-current {
  font-size: 12px;
  color: var(--ib-accent);
}

.overlay-apply {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 5px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.overlay-apply:hover {
  background: var(--ib-accent);
  color: var(--ib-accent-ink);
}

.pending {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--ib-border);
  border-radius: 6px;
}
</style>
