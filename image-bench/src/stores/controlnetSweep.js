import {computed, ref, shallowRef, triggerRef} from "vue";
import {defineStore} from "pinia";
import {KIND_CONTROLNET_SWEEP} from "@/consts.js";
import {createImageData} from "@/sdwebui.js";
import {useImageStoreState} from "@/stores/composables/useImageStoreState.js";

// Weights and ending steps are compared rounded, as the host may report them as strings or with float noise
export const roundSweepValue = value => Math.round(Number(value) * 1000) / 1000;
export const sweepCellKey = (weight, end) => `${roundSweepValue(weight)}|${roundSweepValue(end)}`;

/**
 * Values of an axis of the sweep
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @returns {number[]} Ascending, empty if the range is invalid
 */
export function sweepAxis(from, to, step) {
  from = Number(from);
  to = Number(to);
  step = Number(step);

  if (![from, to, step].every(Number.isFinite) || step <= 0 || to < from)
    return [];

  const count = Math.floor((to - from) / step + 1e-6) + 1;
  return Array.from({length: count}, (_, i) => roundSweepValue(from + i * step));
}

/**
 * The ControlNet sweep of the ControlNet tab (ControlNetSweepStrategy): images of one unit over a matrix
 * of weights x ending steps, and the reference image with the unit's values when the sweep started.
 * In memory only, like Explore
 */
export const useControlNetSweepStore = defineStore("controlNetSweep", () => {
  const state = useImageStoreState(KIND_CONTROLNET_SWEEP);

  // Rows (weights, ascending) and columns (ending steps, ascending) of the last sweep; empty before the first one
  const weights = ref([]);
  const ends = ref([]);
  const unit = ref(null);
  // {weight, end, image}; image is null while pending
  const reference = shallowRef(null);
  // Images by sweepCellKey()
  const cells = shallowRef({});

  const hasSweep = computed(() => weights.value.length > 0 && ends.value.length > 0);

  function begin(options) {
    weights.value = options.weights;
    ends.value = options.ends;
    unit.value = options.unit;
    reference.value = {...options.reference, image: null};
    cells.value = {};
    state.clear();
    state.startingGeneration();
  }

  function clear() {
    weights.value = [];
    ends.value = [];
    unit.value = null;
    reference.value = null;
    cells.value = {};
    state.clear();
  }

  function onSDEvent(e) {
    if (e.type === "SAVED_IMAGE" && e.sweepCell) {
      const image = createImageData(e);
      delete image.type;
      state.images.value.push(image);

      if (e.sweepCell.reference) {
        reference.value = {...reference.value, image};
        // The strategy does not generate the cell with the reference values again
        cells.value[sweepCellKey(reference.value.weight, reference.value.end)] = image;
        triggerRef(cells);
      }
      else {
        cells.value[sweepCellKey(e.sweepCell.weight, e.sweepCell.end)] = image;
        triggerRef(cells);
      }
    }
    else if (e.type === "GENERATION_PROGRESS")
      state.setProgress(e);
    else if (e.type === "GENERATION_FINISHED") {
      state.generationProgress.value = 100;
      state.generationInProgress.value = false;
    }
  }

  const cellAt = (weight, end) => cells.value[sweepCellKey(weight, end)] ?? null;

  return {
    ...state,
    weights,
    ends,
    unit,
    reference,
    cells,
    hasSweep,
    begin,
    clear,
    onSDEvent,
    cellAt
  };
});
