<script setup>
/**
 * Compact number input with -/+ buttons
 */
import AppIcon from "@/components/AppIcon.vue";

const model = defineModel({type: [Number, String], required: true});

const props = defineProps({
  min: {
    type: Number,
    default: 1
  },
  label: {
    type: String,
    default: ""
  }
});

function step(delta) {
  model.value = Math.max(props.min, (parseInt(model.value) || 0) + delta);
}
</script>

<template>
  <span class="stepper">
    <button type="button" :aria-label="`Decrease ${label}`" @click="step(-1)"><AppIcon name="minus" :size="12"/></button>
    <input type="number" :min="min" :aria-label="label" v-model="model">
    <button type="button" :aria-label="`Increase ${label}`" @click="step(1)"><AppIcon name="plus" :size="12"/></button>
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

.stepper button:hover {
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
