<script setup>
/**
 * img2img "Resize to" size: width and height inputs, and a button rounding them to the nearest multiples of 16
 * (sizes taken from an input image are often not). Occupies the place of SizeSelect in the Generate tab.
 */
import {computed} from "vue";

const MULTIPLE = 16;

const props = defineProps({
  width: {
    type: [Number, String],
    default: null
  },
  height: {
    type: [Number, String],
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['change']);

const width = computed(() => parseInt(props.width) || 0);
const height = computed(() => parseInt(props.height) || 0);

const round = value => Math.max(MULTIPLE, Math.round(value / MULTIPLE) * MULTIPLE);
const aligned = computed(() => width.value % MULTIPLE === 0 && height.value % MULTIPLE === 0);

function onInput(which, e) {
  const value = parseInt(e.target.value);

  if (!value || value < 1) {
    e.target.value = which === "width" ? width.value : height.value;
    return;
  }

  emit('change', which === "width" ? value : width.value, which === "height" ? value : height.value);
}
</script>

<template>
  <div class="resize-to" title="Resize to">
    <input type="number" min="1" :class="{unaligned: !aligned}" :value="width" :disabled="disabled"
           aria-label="Resize to width" @change="e => onInput('width', e)">
    <span class="times" aria-hidden="true">×</span>
    <input type="number" min="1" :class="{unaligned: !aligned}" :value="height" :disabled="disabled"
           aria-label="Resize to height" @change="e => onInput('height', e)">
    <button class="ib round" :class="{on: !aligned}" :disabled="disabled || aligned"
            :title="`Round to the nearest multiples of ${MULTIPLE}`"
            :aria-label="`Round to the nearest multiples of ${MULTIPLE}`"
            @click="emit('change', round(width), round(height))">÷{{ MULTIPLE }}</button>
  </div>
</template>

<style scoped>
.resize-to {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.resize-to input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 26px;
  box-sizing: border-box;
  padding: 0 4px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12px;
  text-align: center;
  -moz-appearance: textfield;
}

.resize-to input::-webkit-inner-spin-button,
.resize-to input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.resize-to input:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}

.resize-to input.unaligned {
  border-color: var(--ib-warn);
  color: var(--ib-warn);
}

.times {
  color: var(--ib-muted);
  font-size: 12px;
}

.round {
  font-family: var(--ib-mono);
  font-size: 10.5px;
}

.round.on {
  background: var(--ib-accent-soft);
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}
</style>
