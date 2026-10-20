<script setup>
/**
 * ControlNet unit in the parameter groups of the Generate tab, a tab next to Hires. fix or img2img: the enabled
 * units, model, weight and timestep range of the shown one, and its preview (the control image without one)
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {withCurrent} from "./choices.js";

const props = defineProps({
  form: {
    type: Object,
    required: true
  },
  // Indexes of the enabled units
  units: {
    type: Array,
    required: true
  },
  unit: {
    type: Number,
    required: true
  },
  models: {
    type: Array,
    required: true
  },
  // Preview or control image URL, null without one
  image: {
    type: String,
    default: null
  },
  // Caption of the image (the preprocessor, or that it is the control image)
  imageLabel: {
    type: String,
    default: ""
  },
  emptyText: {
    type: String,
    default: "No image"
  },
  // The preprocessor parameters changed after the preview was made
  stale: {
    type: Boolean,
    default: false
  },
  // The host has not reported the unit yet
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['set', 'guidance', 'select-unit', 'open']);

const start = computed(() => props.form.guidanceStart ?? 0);
const end = computed(() => props.form.guidanceEnd ?? 1);
const rangeStyle = computed(() => ({left: `${start.value * 100}%`, right: `${(1 - end.value) * 100}%`}));
</script>

<template>
  <div class="group">
    <div class="group-header label-small header">
      <slot name="tabs"/>
      <span class="spacer"></span>
      <span class="units" role="radiogroup" aria-label="ControlNet unit">
        <button v-for="index in units" :key="index" type="button" role="radio" class="unit-chip"
                :class="{on: unit === index}" :aria-checked="unit === index" :title="`Unit ${index + 1}`"
                @click="emit('select-unit', index)">{{ index + 1 }}</button>
      </span>
    </div>

    <div class="body">
      <fieldset class="controls" :disabled="disabled">
        <label class="field">Model
          <span class="select-wrap">
            <select :value="form.model" :title="form.model" @change="e => emit('set', 'model', e.target.value)">
              <option v-for="name in withCurrent(models, form.model)" :key="name" :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
        <label class="field">Weight
          <NumberStepper :model-value="form.weight ?? ''" :min="0" :max="2" :step="0.05" label="Control weight"
                         @update:model-value="v => emit('set', 'weight', Number(v))"/>
        </label>
        <div class="field">
          <span class="range-label">Timestep range<span class="range-values">{{ start.toFixed(2) }} – {{ end.toFixed(2) }}</span></span>
          <span class="range" role="group" aria-label="Timestep range">
            <span class="range-track"><span class="range-fill" :style="rangeStyle"></span></span>
            <input type="range" min="0" max="1" step="0.01" :value="start" aria-label="Starting control step"
                   @input="e => emit('guidance', 'guidanceStart', e.target.value)">
            <input type="range" min="0" max="1" step="0.01" :value="end" aria-label="Ending control step"
                   @input="e => emit('guidance', 'guidanceEnd', e.target.value)">
          </span>
        </div>
      </fieldset>

      <button type="button" class="thumb" :class="{stale}" :disabled="disabled"
              :title="stale ? 'The preprocessor parameters changed after the preview was made; open the ControlNet tab'
                            : 'Open the ControlNet tab'"
              aria-label="Open the ControlNet tab" @click="emit('open')">
        <img v-if="image" :src="image" alt="">
        <span v-else class="empty">{{ emptyText }}</span>
        <span v-if="stale" class="badge stale-badge">Stale</span>
        <span v-if="image && imageLabel" class="badge caption" :title="imageLabel">{{ imageLabel }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped src="./groups.css"></style>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.spacer {
  flex: 1;
}

/* At the top of the scrolled parameters, so the chips reach down into the padding of the header only
   (a negative top margin would be cut off) */
.units {
  display: flex;
  align-self: flex-start;
  gap: 3px;
  margin-bottom: -4px;
}

.unit-chip {
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--ib-border-2);
  border-radius: 9px;
  line-height: 16px;
  background: none;
  color: var(--ib-text-2);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0;
  cursor: pointer;
}

.unit-chip:hover {
  background: var(--ib-hover);
}

.unit-chip.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent-hover);
}

.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 10px;
  align-items: start;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.field .select-wrap {
  min-width: 0;
}

.range-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.range-values {
  color: var(--ib-text);
  font-family: var(--ib-mono);
}

/* Two range inputs over one track; only their thumbs take the pointer */
.range {
  position: relative;
  display: block;
  height: 26px;
}

.range-track {
  position: absolute;
  top: 12px;
  left: 6px;
  right: 6px;
  height: 3px;
  border-radius: 2px;
  background: var(--ib-border);
}

.range-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  background: var(--ib-accent);
}

.range input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: none;
  pointer-events: none;
  appearance: none;
}

.range input::-moz-range-track {
  background: none;
}

.range input::-webkit-slider-runnable-track {
  background: none;
}

.range input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--ib-accent);
  border-radius: 50%;
  background: var(--ib-text);
  pointer-events: auto;
  cursor: pointer;
}

.range input::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--ib-accent);
  border-radius: 50%;
  background: var(--ib-text);
  pointer-events: auto;
  cursor: pointer;
  appearance: none;
}

.range input:focus-visible::-moz-range-thumb {
  outline: 2px solid var(--ib-accent-border);
}

.range input:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--ib-accent-border);
}

.thumb {
  position: relative;
  width: 96px;
  height: 140px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  background: #000;
  cursor: pointer;
}

.thumb:disabled {
  cursor: default;
}

.thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumb.stale {
  border: 1px dashed var(--ib-warn);
}

.thumb.stale img {
  opacity: 0.55;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 6px;
  color: var(--ib-muted);
  font-size: 11px;
  white-space: normal;
}

.badge {
  position: absolute;
  left: 4px;
  max-width: calc(100% - 8px);
  padding: 1px 5px;
  overflow: hidden;
  border-radius: 3px;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption {
  bottom: 4px;
  background: rgba(17, 19, 23, 0.8);
  color: var(--ib-text-2);
}

.stale-badge {
  top: 4px;
  background: var(--ib-warn);
  color: var(--ib-accent-ink);
  font-weight: 600;
}
</style>
