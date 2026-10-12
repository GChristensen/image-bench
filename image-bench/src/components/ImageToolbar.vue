<script setup>
import {computed, ref, watch} from 'vue';
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
  generationCompleted: {
    type: Number,
    default: 0
  },
  generationTotal: {
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
  },
  // Number of images of the count button, also the initial number of images to generate
  presetImages: {
    type: Number,
    default: 128
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
const generateImagesNumber = ref(props.presetImages);
const isWebUI = import.meta.env.MODE === 'webui';
const generateForever = computed(() => generateImagesNumber.value === -1);
let finiteImagesNumber = generateImagesNumber.value;

// The setting arrives after the toolbar is created, or is changed: follow it unless the number was edited
watch(() => props.presetImages, (images, previous) => {
  if (generateImagesNumber.value === previous)
    generateImagesNumber.value = images;
});

function setPresetImages() {
  generateImagesNumber.value = props.presetImages;
}

// -1 images: generate until stopped
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
    <!-- Tray I/O; the upscaled images can be downloaded too -->
    <button v-if="kind === KIND_UPSCALED" class="ib" title="Download upscaled images (.zip)"
            aria-label="Download upscaled images" @click="$emit('save')"><AppIcon name="download"/></button>
    <template v-if="isTray">
      <button class="ib" title="Download tray (.zip)" aria-label="Download tray" @click="$emit('save')"><AppIcon name="download"/></button>
      <button class="ib" title="Import images (.png, .zip)" aria-label="Import images" @click="$emit('open')"><AppIcon name="upload"/></button>
      <div class="vsep"></div>
      <button class="btn outline select-all" @click="$emit('select-all')"><AppIcon name="checks" :size="14"/>{{ selectAllText }}</button>
      <button class="ib" :class="{on: isShowingMarked}" :aria-pressed="isShowingMarked"
              :title="isShowingMarked ? 'Showing marked images: click to show all' : 'Show marked images only'"
              aria-label="Show marked images only" @click="$emit('show-marked')"><AppIcon name="filter" :size="14"/></button>
      <div v-if="isWebUI" class="vsep"></div>
      <button v-if="isWebUI && !upscaleInProgress" class="btn primary" :disabled="!isSomeSelected"
              :title="isSomeSelected ? 'Upscale selected images' : 'Select images to upscale'"
              @click="$emit('upscale-selected')"><AppIcon name="upscale" :size="14"/>Upscale selected</button>
    </template>

    <!-- Generated images actions -->
    <template v-if="kind === KIND_GENERATED">
      <div class="toolbar-group">
        <button class="btn swap" :class="generationInProgress ? 'stop' : 'primary'"
                @click="$emit(generationInProgress ? 'stop-generation' : 'batch-generate')">
          <span :class="{off: generationInProgress}"><AppIcon name="play" :size="13"/>Generate</span>
          <span :class="{off: !generationInProgress}"><AppIcon name="stop" :size="13"/>Stop</span>
        </button>
        <label class="toolbar-group-label"><span class="reset-count" title="Reset to 1 image"
              @click.prevent="generateImagesNumber = 1">×</span><NumberStepper v-model="generateImagesNumber" label="Images to generate"/></label>
        <button class="btn preset-count" :class="{on: generateImagesNumber === presetImages}"
                :disabled="generationInProgress" :title="`Generate ${presetImages} images (set in the settings)`"
                @click="setPresetImages">{{ presetImages }}</button>
        <button class="ib" :class="{on: generateForever}" :aria-pressed="generateForever"
                :disabled="generationInProgress"
                :title="generateForever ? 'Generating forever: click to restore the number of images' : 'Generate forever (until stopped)'"
                aria-label="Generate forever" @click="toggleGenerateForever"><AppIcon name="infinity" :size="14"/></button>
      </div>
      <button class="btn outline" :disabled="generationInProgress"
              title="Generate variations of the current seed; the variation seed and strength are set for the batch and cleared afterwards automatically"
              @click="$emit('generate-variations')"
        ><AppIcon name="shuffle" :size="14"/>Variations…</button>
    </template>

    <!-- Upscale stop -->
    <button v-if="kind === KIND_UPSCALED && upscaleInProgress" class="btn stop" @click="$emit('upscale-selected')"
      ><AppIcon name="stop" :size="13"/>Stop</button>

    <!-- Progress indicator -->
    <ProgressIndicator v-if="generationInProgress" :value="generateForever ? 100 : generationProgress || 0"
                       :label="generateForever ? '∞' : ''"
                       :completed="generationCompleted" :total="generationTotal"/>

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

.preset-count {
  min-width: 26px;
  padding: 0 6px;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.preset-count.on {
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.preset-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  width: 260px;
}
</style>
