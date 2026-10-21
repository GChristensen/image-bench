<script setup>
/**
 * Images of the ControlNet sweep: the reference image with the unit's values when the sweep started, kept in view at
 * the left, and the matrix of weights (rows) x ending steps (columns), both ascending from the top left. Apply under an image,
 * or a click on a row or column header, sets its values in the unit
 */
import {nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, toRaw} from "vue";
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

// ---------- Overlays ----------

const overlayImage = ref(null);
const paramsImage = ref(null);
const highlightedImage = shallowRef(null);

function onImageClick(image) {
  overlayImage.value = image;
}

async function closeOverlay() {
  if (!overlayImage.value)
    return;

  const image = toRaw(overlayImage.value);
  overlayImage.value = null;
  highlightedImage.value = null;
  await nextTick();
  highlightedImage.value = image;
}

const isHighlighted = image => !!highlightedImage.value && toRaw(image) === highlightedImage.value;

function onImageOpen(image) {
  window.open(createImageLink(image), "_blank");
}

function onKeydown(e) {
  if (e.key === "Escape") {
    closeOverlay();
    paramsImage.value = null;
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
                @show-params="paramsImage = overlayImage" @hide-overlay="closeOverlay"/>
  <ParametersOverlay v-if="paramsImage" :image="paramsImage" @hide-overlay="paramsImage = null"/>

  <div class="sweep">
    <div v-if="!sweep.hasSweep" class="empty-state">
      Set the axes at the right, then press <b>Sweep</b>.
    </div>

    <template v-else>
      <aside class="reference">
        <div class="label-small">Current values</div>
        <div class="values">w {{ format(sweep.reference.weight) }} · end {{ format(sweep.reference.end) }}</div>
        <GeneratedImage v-if="sweep.reference.image" kind="controlnet_sweep" :is-tray="false"
                        :image="sweep.reference.image" :highlighted="isHighlighted(sweep.reference.image)"
                        @show-params="paramsImage = sweep.reference.image"
                        @image-click="onImageClick(sweep.reference.image)"
                        @image-open="onImageOpen(sweep.reference.image)"/>
        <div v-else class="pending"></div>
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

          <template v-for="weight in sweep.weights" :key="weight">
            <button type="button" class="row-header" :class="{current: roundSweepValue(current.weight) === weight}"
                    :title="`Set the control weight to ${format(weight)}`"
                    @click="emit('apply', {weight})">{{ format(weight) }}</button>
            <div v-for="end in sweep.ends" :key="end" class="cell" :class="{current: isCurrent(weight, end)}">
              <template v-if="sweep.cellAt(weight, end)">
                <GeneratedImage kind="controlnet_sweep" :is-tray="false" :image="sweep.cellAt(weight, end)"
                                :highlighted="isHighlighted(sweep.cellAt(weight, end))"
                                @show-params="paramsImage = sweep.cellAt(weight, end)"
                                @image-click="onImageClick(sweep.cellAt(weight, end))"
                                @image-open="onImageOpen(sweep.cellAt(weight, end))"/>
                <button type="button" class="apply" :title="`Set weight ${format(weight)} and ending step ${format(end)}`"
                        @click="emit('apply', {weight, end})"><AppIcon name="check" :size="12"/>Apply</button>
              </template>
              <div v-else class="pending"></div>
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

.reference :deep(.selectable-image) {
  max-width: 100%;
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
  align-items: center;
  gap: 4px;
}

/* The placeholder of a pending cell takes the cell width */
.cell .pending {
  align-self: stretch;
}

/* A cell holds a single card: it takes the cell width instead of the card's share of a row */
.cell :deep(.selectable-image) {
  max-width: 100%;
}

.cell.current :deep(.selectable-image) {
  outline: 2px solid var(--ib-accent);
  outline-offset: 2px;
  border-radius: 6px;
}

.apply {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 4px;
  background: var(--ib-surface);
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

.pending {
  aspect-ratio: 1;
  border: 1px dashed var(--ib-border);
  border-radius: 6px;
}
</style>
