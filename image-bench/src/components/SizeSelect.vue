<script setup>
/**
 * Image size picker: preset sizes grouped by model, and a button swapping width and height.
 * The presets are listed in the orientation of the current size, so after a swap they stay selectable;
 * a size that matches no preset is shown as custom.
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {SIZE_PRESET_GROUPS} from "@/consts.js";

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
const isPortrait = computed(() => height.value > width.value);
const currentValue = computed(() => `${width.value}x${height.value}`);

// Presets turned to the current orientation, e.g. 1216x832 (19:13) -> 832x1216 (13:19)
const groups = computed(() => SIZE_PRESET_GROUPS.map(group => ({
  name: group.name,
  sizes: group.sizes.map(({width: w, height: h, note}) => {
    const flip = isPortrait.value && w > h;
    const [sw, sh] = flip ? [h, w] : [w, h];
    const shownNote = flip ? note.replace(/^(\d+):(\d+)/, "$2:$1") : note;

    return {value: `${sw}x${sh}`, label: `${sw}x${sh}` + (shownNote ? ` (${shownNote})` : "")};
  })
})));

const isCustom = computed(() => !groups.value.some(group => group.sizes.some(size => size.value === currentValue.value)));

function onChange(e) {
  const [w, h] = e.target.value.split("x").map(Number);
  emit('change', w, h);
}
</script>

<template>
  <div class="size-select">
    <div class="select-wrap">
      <select :value="currentValue" :disabled="disabled" aria-label="Image size" title="Image size" @change="onChange">
        <option v-if="isCustom" :value="currentValue">{{ currentValue }} (custom)</option>
        <optgroup v-for="group in groups" :key="group.name" :label="group.name">
          <option v-for="size in group.sizes" :key="size.value" :value="size.value">{{ size.label }}</option>
        </optgroup>
      </select>
      <AppIcon name="chevron" :size="14"/>
    </div>
    <button class="ib" :disabled="disabled || width === height" title="Swap width and height"
            aria-label="Swap width and height" @click="emit('change', height, width)"><AppIcon name="swap"/></button>
  </div>
</template>

<style scoped>
.size-select {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.select-wrap select {
  font-family: var(--ib-mono);
  font-size: 12px;
}
</style>
