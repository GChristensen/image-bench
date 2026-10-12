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
  // Number of checked images; the selection bar is shown while it is nonzero
  selectedCount: {
    type: Number,
    default: 0
  },
  isShowingMarked: {
    type: Boolean,
    default: false
  },
  // Marking the shown images are filtered by, if any
  markingFilter: {
    type: String,
    default: null
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
  },
  // Clear the Generated tab when a new batch starts
  autoClear: {
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
  'remove-selected',
  'unselect-all',
  'preset-change',
  'update:autoClear'
]);

const selectAllText = computed(() => props.isAllSelected ? 'Unselect all' : 'Select all');
const selectable = computed(() => props.isTray || props.kind === KIND_UPSCALED);
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
              :title="markingFilter ? `Showing ${markingFilter} only: click to show all`
                : isShowingMarked ? 'Showing marked images: click to show all' : 'Show marked images only'"
              aria-label="Show marked images only" @click="$emit('show-marked')"
        ><span v-if="markingFilter" class="marking-filter">{{ markingFilter }}</span
        ><AppIcon v-else name="filter" :size="14"/></button>
    </template>

    <!-- Actions on the checked images -->
    <template v-if="selectable && selectedCount">
      <div class="vsep"></div>
      <span class="selection-count">{{ selectedCount }} selected</span>
      <button v-if="isTray && isWebUI" class="btn primary" :disabled="upscaleInProgress"
              :title="upscaleInProgress ? 'An upscale is in progress' : 'Upscale the selected images'"
              @click="$emit('upscale-selected')"><AppIcon name="upscale" :size="14"/>Upscale selected</button>
      <button class="btn outline remove-selected" title="Remove the selected images from this view (the files stay on disk)"
              @click="$emit('remove-selected')"><AppIcon name="trash" :size="14"/>Remove selected</button>
      <button class="ib" title="Unselect all (Ctrl+U)" aria-label="Unselect all" @click="$emit('unselect-all')"
        ><AppIcon name="close" :size="14"/></button>
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
    <button class="btn" title="Remove all images from this view (the files stay on disk)"
            @click="$emit('clear')"><AppIcon name="eraser" :size="14"/>Clear</button>
    <button v-if="kind === KIND_GENERATED" class="ib" :class="{on: autoClear}" :aria-pressed="autoClear"
            :title="`Clear automatically when a new batch starts: ${autoClear ? 'on' : 'off'}`"
            aria-label="Clear automatically when a new batch starts"
            @click="$emit('update:autoClear', !autoClear)"><AppIcon name="recycle" :size="14"/></button>
  </div>

</template>

<style scoped>
.marking-filter {
  font-size: 13px;
  line-height: 1;
}

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

.selection-count {
  padding: 0 4px;
  color: var(--ib-text);
  font-weight: 600;
  white-space: nowrap;
}

.remove-selected:hover {
  color: var(--ib-danger-text);
  border-color: #5b2d30;
  background: #2a1a1c;
}

.preset-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  width: 260px;
}
</style>
