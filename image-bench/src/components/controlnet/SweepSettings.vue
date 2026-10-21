<script setup>
/**
 * Axes of the ControlNet sweep (weight x ending step) in the parameters column of the ControlNet tab,
 * kept in the generation settings with the sweep's own seed; emits start with the values of both axes and the seed
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {useGenerationSettingsStore} from "@/stores/generationSettings.js";
import {sweepAxis} from "@/stores/controlnetSweep.js";

// More values per axis would make cells too small to compare
const MAX_AXIS_VALUES = 12;

const props = defineProps({
  unit: {type: Number, required: true},
  running: {type: Boolean, default: false},
  disabled: {type: Boolean, default: false}
});

const emit = defineEmits(["start", "stop"]);

const generationSettings = useGenerationSettingsStore();
// Older settings files lack the seed
const axes = computed(() => ({seedEnabled: false, seed: 0, ...generationSettings.settings.controlNetSweep}));

function setAxis(name, value) {
  if (value !== "" && Number.isFinite(Number(value)))
    generationSettings.set("controlNetSweep", {...axes.value, [name]: Number(value)});
}

function setSeedEnabled(enabled) {
  generationSettings.set("controlNetSweep", {...axes.value, seedEnabled: enabled});
}

function setSeed(value) {
  const seed = Math.trunc(Number(value));

  if (value !== "" && Number.isFinite(seed) && seed >= 0)
    generationSettings.set("controlNetSweep", {...axes.value, seed});
}

function onRandomSeed() {
  setSeed(Math.floor(Math.random() * 2 ** 32));
}

const weights = computed(() => sweepAxis(axes.value.weightFrom, axes.value.weightTo, axes.value.weightStep));
const ends = computed(() => sweepAxis(axes.value.endFrom, axes.value.endTo, axes.value.endStep));

const error = computed(() => {
  if (!weights.value.length || !ends.value.length)
    return "Each axis needs From ≤ To and a step above 0";

  if (weights.value.length > MAX_AXIS_VALUES || ends.value.length > MAX_AXIS_VALUES)
    return `At most ${MAX_AXIS_VALUES} values per axis: use a larger step`;

  return null;
});

const summary = computed(() => error.value
  ?? `${weights.value.length} × ${ends.value.length} = ${weights.value.length * ends.value.length} images, plus the current values`);

const AXES = [
  {label: "Control weight", prefix: "weight", max: 2},
  {label: "Ending step", prefix: "end", max: 1}
];

function onStart() {
  if (!error.value)
    emit("start", {weights: weights.value, ends: ends.value, seed: axes.value.seedEnabled ? axes.value.seed : null});
}
</script>

<template>
  <div class="sweep-settings">
    <p class="intro">Unit {{ unit + 1 }} with the same seed for each weight and ending step. The first image uses the
      current values, to compare the matrix with.</p>

    <div v-for="axis in AXES" :key="axis.prefix" class="axis">
      <div class="group-header label-small">{{ axis.label }}</div>
      <div class="axis-fields">
        <label class="axis-field">From
          <NumberStepper :model-value="axes[`${axis.prefix}From`]" :min="0" :max="axis.max" :step="0.05"
                         :label="`${axis.label} from`" :disabled="running"
                         @update:model-value="v => setAxis(`${axis.prefix}From`, v)"/>
        </label>
        <label class="axis-field">To
          <NumberStepper :model-value="axes[`${axis.prefix}To`]" :min="0" :max="axis.max" :step="0.05"
                         :label="`${axis.label} to`" :disabled="running"
                         @update:model-value="v => setAxis(`${axis.prefix}To`, v)"/>
        </label>
        <label class="axis-field">Step
          <NumberStepper :model-value="axes[`${axis.prefix}Step`]" :min="0.01" :max="axis.max" :step="0.05"
                         :label="`${axis.label} step`" :disabled="running"
                         @update:model-value="v => setAxis(`${axis.prefix}Step`, v)"/>
        </label>
      </div>
    </div>

    <div class="group-header label-small">Seed</div>
    <div class="seed">
      <label class="seed-check"><input type="checkbox" :checked="axes.seedEnabled" :disabled="running"
                                       @change="e => setSeedEnabled(e.target.checked)">Use seed</label>
      <input type="number" min="0" step="1" class="seed-value" aria-label="Seed of the sweep"
             :value="axes.seed" :disabled="running || !axes.seedEnabled" @change="e => setSeed(e.target.value)">
      <button type="button" class="seed-random" title="Random seed" aria-label="Random seed"
              :disabled="running || !axes.seedEnabled" @click="onRandomSeed"><AppIcon name="dice" :size="14"/></button>
    </div>
    <p class="seed-note">{{ axes.seedEnabled ? "Every image uses this seed."
      : "Unchecked: the seed of the generation tab, a random one for all images if it is -1." }}</p>

    <div class="summary" :class="{error}">{{ summary }}</div>

    <button class="btn swap" :class="running ? 'stop' : 'primary'" :disabled="!running && (disabled || !!error)"
            @click="running ? emit('stop') : onStart()">
      <span :class="{off: running}"><AppIcon name="play" :size="13"/>Sweep</span>
      <span :class="{off: !running}"><AppIcon name="stop" :size="13"/>Stop</span>
    </button>

    <p class="hint">The diagonals of the matrix come first (weak and short to strong and long, strong and short to weak
      and long), then the cells between them: you may stop once the matrix tells enough.
      <b>Apply</b> under an image sets its values in the unit.</p>
  </div>
</template>

<style scoped>
.sweep-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}

.intro,
.hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ib-muted);
}

.hint b {
  color: var(--ib-text-2);
  font-weight: 600;
}

.group-header {
  margin-top: 4px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--ib-border);
}

.axis-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.axis-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--ib-text-2);
  font-size: 11px;
}

.axis-field :deep(.stepper) {
  display: flex;
  height: 26px;
}

.axis-field :deep(.stepper input) {
  flex: 1;
  width: auto;
  min-width: 0;
  height: 24px;
}

.seed {
  display: flex;
  align-items: center;
  gap: 8px;
}

.seed-check {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  color: var(--ib-text);
  cursor: pointer;
}

.seed-value {
  flex: 1;
  min-width: 0;
  height: 26px;
}

.seed-random {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
  color: var(--ib-text-2);
  cursor: pointer;
}

.seed-random:hover:not(:disabled) {
  color: var(--ib-text);
}

.seed-value:disabled,
.seed-random:disabled {
  opacity: 0.45;
  cursor: default;
}

.seed-note {
  margin: -4px 0 0;
  font-size: 11.5px;
  color: var(--ib-muted);
}

.summary {
  font-size: 12px;
  color: var(--ib-text-2);
}

.summary.error {
  color: var(--ib-warn);
}
</style>
