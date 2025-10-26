<script setup>
import {computed, ref} from 'vue';
import {KIND_GENERATED, KIND_UPSCALED} from "@/consts.js";

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
const showMarkedText = computed(() => props.isShowingMarked ? 'Show all' : 'Show marked');
const clearText = computed(() => props.isSomeSelected ? 'Clear selected' : 'Clear');
const generateImagesNumber = ref(256);

defineExpose({generateImagesNumber});
</script>

<template>
  <div class="toolbar">
    <!-- Tray actions -->
    <a v-if="isTray" href="#" class="tool-item" @click.prevent="$emit('save')">Save</a>
    <a v-if="isTray" href="#" class="tool-item" @click.prevent="$emit('open')">Open</a>
    
    <a v-if="isTray" href="#" class="tool-item" @click.prevent="$emit('select-all')">
      {{ selectAllText }}
    </a>
    <a v-if="isTray" href="#" class="tool-item" @click.prevent="$emit('show-marked')">
      {{ showMarkedText }}
    </a>

    <!-- Generated images actions -->
    <a 
      v-if="kind === KIND_GENERATED && !generationInProgress"
      href="#" 
      class="tool-item" 
      @click.prevent="$emit('batch-generate')"
    >Generate</a>
    
    <a 
      v-if="kind === KIND_GENERATED && !generationInProgress"
      href="#" 
      class="tool-item" 
      @click.prevent="$emit('generate-variations')"
    >Variations</a>
    
    <a 
      v-if="kind === KIND_GENERATED && generationInProgress"
      href="#" 
      class="tool-item" 
      @click.prevent="$emit('stop-generation')"
    >Stop</a>

    <!-- Upscale actions -->
    <a 
      v-if="isTray && !upscaleInProgress" 
      href="#" 
      class="tool-item" 
      @click.prevent="$emit('upscale-selected')"
    >Upscale selected</a>
    
    <a 
      v-if="kind === KIND_UPSCALED && upscaleInProgress"
      href="#" 
      class="tool-item"
      @click.prevent="$emit('upscale-selected')"
    >Stop</a>

    <!-- Clear action -->
    <a href="#" class="tool-item" @click.prevent="$emit('clear')">{{ clearText }}</a>

    <div class="toolbar-spacer"></div>

    <!-- Progress indicator -->
    <div v-if="generationInProgress" class="generation-progress">
      Progress:&nbsp;
      <progress max="100" :value="generationProgress || 0"></progress>
    </div>

    <div class="toolbar-spacer"></div>

    <!-- Preset selector -->
    <div class="preset-selector" v-if="showPresetSelector">
      Apply preset:
      <select 
        class="config-presets" 
        :value="applyPreset" 
        @change="$emit('preset-change', $event.target.value)"
      >
        <option 
          v-for="preset in presets" 
          :key="preset"
          :value="preset"
        >{{ preset }}</option>
      </select>
    </div>

    <!-- Generate image number input -->
    <div v-if="kind === KIND_GENERATED" class="generate-images-container">
      <label>Generate images:&nbsp;<input type="number" class="generate-images" v-model="generateImagesNumber"></label>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  border-bottom: 1px solid #ccc;
  width: 100%;
  align-items: center;
  padding: 5px;
}

.tool-item {
  padding: 5px 5px;
  cursor: pointer;
  text-decoration: none;
  color: white;
  white-space: nowrap;
}

.tool-item:hover {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.toolbar-spacer {
  flex-grow: 1;
}

.generation-progress {
  width: 20%;
  display: flex;
  align-items: center;
}

.generation-progress progress {
  flex-grow: 1;
}

.config-presets {
  margin-left: 5px;
}

.generate-images-container {
  display: flex;
}

.generate-images-container label {
  display: flex;
  align-items: center;
}

input.generate-images {
  width: 50px;
}
</style>
