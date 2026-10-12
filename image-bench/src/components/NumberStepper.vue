<script setup>
/**
 * Compact number input with -/+ buttons
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const model = defineModel({type: [Number, String], required: true});

const props = defineProps({
  min: {
    type: Number,
    default: 1
  },
  max: {
    type: Number,
    default: Infinity
  },
  // Increment of the buttons; its decimal places are kept, e.g. 0.01 -> 0.35
  step: {
    type: Number,
    default: 1
  },
  label: {
    type: String,
    default: ""
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const decimals = computed(() => (String(props.step).split(".")[1] || "").length);

function increment(direction) {
  const value = (parseFloat(model.value) || 0) + direction * props.step;
  model.value = Number(Math.min(props.max, Math.max(props.min, value)).toFixed(decimals.value));
}
</script>

<template>
  <span class="stepper" :class="{disabled}">
    <button type="button" :aria-label="`Decrease ${label}`" @click="increment(-1)" :disabled="disabled"><AppIcon name="minus" :size="12"/></button>
    <input type="number" :min="min" :max="max === Infinity ? undefined : max" :step="step" :aria-label="label"
           :disabled="disabled" v-model="model">
    <button type="button" :aria-label="`Increase ${label}`" @click="increment(1)" :disabled="disabled"><AppIcon name="plus" :size="12"/></button>
  </span>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  height: 24px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
}

.stepper.disabled {
  opacity: 0.5;
}

.stepper button {
  width: 22px;
  height: 22px;
  border: 0;
  background: none;
  color: var(--ib-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.stepper button:disabled {
  cursor: default;
}

.stepper button:not(:disabled):hover {
  color: var(--ib-text);
  background: var(--ib-hover);
}

.stepper input {
  width: 44px;
  height: 22px;
  border: 0;
  border-left: 1px solid var(--ib-border);
  border-right: 1px solid var(--ib-border);
  background: none;
  color: var(--ib-text);
  text-align: center;
  font: inherit;
  font-family: var(--ib-mono);
  font-size: 12px;
  -moz-appearance: textfield;
}

.stepper input::-webkit-inner-spin-button,
.stepper input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper input:focus {
  outline: none;
  background: var(--ib-hover);
}
</style>
