<script setup>
import {computed, ref} from 'vue';
import {KIND_GENERATED, KIND_UPSCALED} from "@/consts.js";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";

/**
 * Presentational component for the image toolbar
 * Displays actions based on kind and state, emits events to parent
 */
defineOptions({
  name: 'ImageToolbar',
  inheritAttrs: false
});

const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: (value) => ['generated', 'image-tray', 'concept-tray', 'upscaled'].includes(value)
  },
  isTray: {
    type: Boolean,
    required: true
  },
  isAllSelected: {
    type: Boolean,
    default: false
  },
  isSomeSelected: {
    type: Boolean,
    default: false
  },
  isShowingMarked: {
    type: Boolean,
    default: false
  },
  generationInProgress: {
    type: Boolean,
    default: false
  },
  generationProgress: {
    type: Number,
    default: 0
  },
  upscaleInProgress: {
    type: Boolean,
    default: false
  },
  applyPreset: {
    type: String,
    default: null
  },
  presets: {
    type: Array,
    default: () => []
  },
  showPresetSelector: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'save',
  'open',
  'select-all',
  'show-marked',
  'batch-generate',
  'generate-variations',
  'stop-generation',
  'upscale-selected',
  'clear',
  'preset-change'
]);

const selectAllText = computed(() => props.isAllSelected ? 'Unselect all' : 'Select all');
const clearText = computed(() => props.isSomeSelected ? 'Clear selected' : 'Clear');
const generateImagesNumber = ref(128);
const isWebUI = import.meta.env.MODE === 'webui';
const generateForever = computed(() => isWebUI && generateImagesNumber.value === -1);
let finiteImagesNumber = generateImagesNumber.value;

// -1 images: generate until stopped (WebUI "Generate forever")
function toggleGenerateForever() {
  if (generateForever.value)
    generateImagesNumber.value = finiteImagesNumber;
  else {
    finiteImagesNumber = generateImagesNumber.value;
    generateImagesNumber.value = -1;
  }
}

defineExpose({generateImagesNumber});
</script>

<template>
  <div class="toolbar">
    <!-- Tray I/O -->
    <template v-if="isTray">
      <button class="ib" title="Download tray (.zip)" aria-label="Download tray" @click="$emit('save')"><AppIcon name="download"/></button>
      <button class="ib" title="Import images (.png, .zip)" aria-label="Import images" @click="$emit('open')"><AppIcon name="upload"/></button>
      <div class="vsep"></div>
      <button class="btn outline select-all" @click="$emit('select-all')"><AppIcon name="checks" :size="14"/>{{ selectAllText }}</button>
      <button class="ib" :class="{on: isShowingMarked}" :aria-pressed="isShowingMarked"
              :title="isShowingMarked ? 'Showing marked images: click to show all' : 'Show marked images only'"
              aria-label="Show marked images only" @click="$emit('show-marked')"><AppIcon name="filter" :size="14"/></button>
      <div class="vsep"></div>
      <button v-if="!upscaleInProgress" class="btn primary" :disabled="!isSomeSelected"
              :title="isSomeSelected ? 'Upscale selected images' : 'Select images to upscale'"
              @click="$emit('upscale-selected')"><AppIcon name="upscale" :size="14"/>Upscale selected</button>
    </template>

    <!-- Generated images actions -->
    <template v-if="kind === KIND_GENERATED">
      <div class="toolbar-group">
        <button v-if="!generationInProgress" class="btn primary" @click="$emit('batch-generate')"
          ><AppIcon name="play" :size="13"/>Generate</button>
        <button v-else class="btn stop" @click="$emit('stop-generation')"><AppIcon name="stop" :size="13"/>Stop</button>
        <label class="toolbar-group-label">×<NumberStepper v-model="generateImagesNumber" label="Images to generate"/></label>
        <button v-if="isWebUI" class="ib" :class="{on: generateForever}" :aria-pressed="generateForever"
                :disabled="generationInProgress"
                :title="generateForever ? 'Generating forever: click to restore the number of images' : 'Generate forever (until stopped)'"
                aria-label="Generate forever" @click="toggleGenerateForever"><AppIcon name="infinity" :size="14"/></button>
      </div>
      <button class="btn outline" :disabled="generationInProgress" @click="$emit('generate-variations')"
        ><AppIcon name="shuffle" :size="14"/>Variations…</button>
    </template>

    <!-- Upscale stop -->
    <button v-if="kind === KIND_UPSCALED && upscaleInProgress" class="btn stop" @click="$emit('upscale-selected')"
      ><AppIcon name="stop" :size="13"/>Stop</button>

    <!-- Progress indicator -->
    <ProgressIndicator v-if="generationInProgress" :value="generateForever ? 100 : generationProgress || 0"
                       :label="generateForever ? '∞' : ''"/>

    <div class="toolbar-spacer"></div>

    <!-- Preset selector -->
    <div class="preset-selector" v-if="showPresetSelector">
      <span>Apply preset</span>
      <div class="select-wrap">
        <select :value="applyPreset" @change="$emit('preset-change', $event.target.value)">
          <option v-for="preset in presets" :key="preset" :value="preset">{{ preset }}</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </div>
    </div>

    <!-- Clear action -->
    <button class="btn" @click="$emit('clear')"><AppIcon name="eraser" :size="14"/>{{ clearText }}</button>
  </div>
</template>

<style scoped>
.select-all {
  min-width: 112px;
}

.preset-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  width: 260px;
}
</style>
