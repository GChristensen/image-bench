<script setup>
/**
 * Size as width and height inputs ("Resize to" in img2img), and a button rounding them to the nearest multiples of 16
 * (sizes taken from an input image are often not). Switched with SizeSelect in the Generate tab.
 */
import {computed, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {animateColors} from "@/utils_html.js";

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
  },
  label: {
    type: String,
    default: "Resize to"
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

const root = ref(null);

// Flashes the inputs, for a size set from elsewhere (the crop factors of the mask view)
function flash() {
  root.value?.querySelectorAll("input").forEach(input => animateColors(input, 0.7));
}

defineExpose({flash});
</script>

<template>
  <div ref="root" class="resize-to" :title="label">
    <input type="number" min="1" :class="{unaligned: !aligned}" :value="width" :disabled="disabled"
           :aria-label="`${label} width`" @change="e => onInput('width', e)">
    <span class="times" :class="{disabled: disabled || width === height}" title="Swap width and height"
          aria-hidden="true" @click="emit('change', height, width)"><AppIcon name="swap" :size="12"/></span>
    <input type="number" min="1" :class="{unaligned: !aligned}" :value="height" :disabled="disabled"
           :aria-label="`${label} height`" @change="e => onInput('height', e)">
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
  flex-shrink: 0;
  color: var(--ib-muted);
  font-size: 12px;
  cursor: pointer;
}

.times:hover {
  color: var(--ib-text);
}

.times.disabled {
  cursor: default;
  pointer-events: none;
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
