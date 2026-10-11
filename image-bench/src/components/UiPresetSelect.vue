<script setup>
/**
 * Forge UI preset selector: the given presets as buttons and the rest of the WebUI presets in a menu
 * opened by the chevron. A selected preset from the menu takes the place of the chevron label.
 */
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {UI_PRESET_LABELS} from "@/consts.js";

const model = defineModel({type: String, default: null});

const props = defineProps({
  // Preset values shown as buttons
  presets: {
    type: Array,
    required: true
  },
  // Preset values offered by the WebUI, empty if unknown
  choices: {
    type: Array,
    default: () => []
  }
});

const buttons = computed(() => props.presets.map(value => ({
  value,
  label: UI_PRESET_LABELS[value] ?? value,
  available: !props.choices.length || props.choices.includes(value)
})));

const otherPresets = computed(() => props.choices.filter(value => !props.presets.includes(value)));
const otherSelected = computed(() => otherPresets.value.includes(model.value) ? model.value : null);

const menuOpen = ref(false);
const element = ref(null);

function select(value) {
  menuOpen.value = false;
  model.value = value;
}

function onDocumentMousedown(e) {
  if (menuOpen.value && !element.value?.contains(e.target))
    menuOpen.value = false;
}

function onKeydown(e) {
  if (menuOpen.value && (e.key === "Escape" || e.key === "Esc")) {
    e.stopPropagation();
    menuOpen.value = false;
  }
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="ui-preset-select" ref="element" @keydown="onKeydown">
    <div class="seg" role="group" aria-label="UI preset">
      <button v-for="preset in buttons" :key="preset.value" type="button"
              :class="{on: model === preset.value}" :disabled="!preset.available"
              :title="preset.available ? `UI preset: ${preset.value}` : `UI preset '${preset.value}' is not available`"
              @click="select(preset.value)">{{ preset.label }}</button>
      <button v-if="otherPresets.length" type="button" class="more" :class="{on: otherSelected}"
              :aria-expanded="menuOpen" aria-haspopup="menu" title="Other UI presets"
              @click="menuOpen = !menuOpen"
        >{{ otherSelected || "" }}<AppIcon name="chevron" :size="13"/></button>
    </div>
    <div v-if="menuOpen" class="menu" role="menu">
      <button v-for="value in otherPresets" :key="value" type="button" role="menuitemradio"
              :aria-checked="model === value" :class="{current: model === value}"
              @click="select(value)"
        ><AppIcon name="check" :size="13" :class="{hidden: model !== value}"/>{{ value }}</button>
    </div>
  </div>
</template>

<style scoped>
.ui-preset-select {
  position: relative;
  flex: none;
}

.seg button {
  padding: 0 7px;
}

.seg button:disabled {
  opacity: 0.35;
  cursor: default;
}

.seg .more {
  padding: 0 4px;
  gap: 2px;
}

.menu {
  top: 32px;
  right: 0;
  min-width: 120px;
}

.menu .current {
  color: var(--ib-accent);
}

.hidden {
  visibility: hidden;
}
</style>
