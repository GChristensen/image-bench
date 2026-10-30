<script setup>
import {computed} from 'vue';
import {KIND_GENERATED, KIND_UPSCALED} from "@/consts.js";
import AppIcon from "@/components/AppIcon.vue";
import ClearButton from "@/components/ClearButton.vue";
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
  // The entries of the view, for the counts of the Clear button
  images: {
    type: Array,
    default: () => []
  },
  // Buttons of the image actions for the checked images: [{id, icon, label, title, color, disabled}]
  bulkItems: {
    type: Array,
    default: () => []
  },
  isAllSelected: {
    type: Boolean,
    default: false
  },
  // The run of the view's tab (runState.js:useTabRun(), e.g. upscales), null while none runs
  run: {
    type: Object,
    default: null
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
  'bulk',
  'remove',
  'remove-selected',
  'unselect-all',
  'preset-change',
  'update:autoClear'
]);

const selectAllText = computed(() => props.isAllSelected ? 'Unselect all' : 'Select all');
</script>

<template>
  <div class="toolbar">
    <!-- Tray I/O; the upscaled images can be downloaded too -->
    <button v-if="kind === KIND_UPSCALED" class="ib" title="Download upscaled images (.zip)"
            aria-label="Download upscaled images" @click="$emit('save')"><AppIcon name="download"/></button>
    <template v-if="isTray">
      <button class="ib" title="Download tray (.zip)" aria-label="Download tray" @click="$emit('save')"><AppIcon name="download"/></button>
      <button class="ib" title="Import images (.png, .zip)" aria-label="Import images" @click="$emit('open')"><AppIcon name="upload"/></button>
    </template>

    <!-- Selection and marking filter of all views (no filter in the Upscaled tab) -->
    <div v-if="kind !== KIND_GENERATED" class="vsep"></div>
    <button class="btn outline select-all" title="Ctrl+U unselects all"
            @click="$emit('select-all')"><AppIcon name="checks" :size="14"/>{{ selectAllText }}</button>
    <button v-if="kind !== KIND_UPSCALED" class="ib" :class="{on: isShowingMarked}" :aria-pressed="isShowingMarked"
            :title="markingFilter ? `Showing ${markingFilter} only: click to show all`
              : isShowingMarked ? 'Showing marked images: click to show all' : 'Show marked images only'"
            aria-label="Show marked images only" @click="$emit('show-marked')"
      ><span v-if="markingFilter" class="marking-filter">{{ markingFilter }}</span
      ><AppIcon v-else name="filter" :size="14"/></button>

    <!-- Actions on the checked images -->
    <template v-if="selectedCount">
      <div class="vsep"></div>
      <span class="selection-count">{{ selectedCount }} selected</span>
      <!-- The image actions that take many images (imageActions.js:bulkActions()) -->
      <button v-for="item in bulkItems" :key="item.id" class="btn outline bulk-action" :disabled="item.disabled"
              :title="item.title" @click="$emit('bulk', item.id)"
        ><AppIcon :name="item.icon" :size="14" :style="{color: item.color}"/>{{ item.label }}</button>
      <button class="btn outline remove-selected"
              title="Remove the checked images from this view; the output files stay on disk (Undo in the notice)"
              @click="$emit('remove-selected')"><AppIcon name="trash" :size="14"/>Remove</button>
      <button class="ib" title="Unselect all (Ctrl+U)" aria-label="Unselect all" @click="$emit('unselect-all')"
        ><AppIcon name="close" :size="14"/></button>
    </template>

    <ProgressIndicator v-if="run" :run="run"/>

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

    <ClearButton :images="images" @remove="predicate => $emit('remove', predicate)"/>
    <button v-if="kind === KIND_GENERATED" class="ib" :class="{on: autoClear}" :aria-pressed="autoClear"
            :title="`Clear automatically when a new batch starts: ${autoClear ? 'on' : 'off'}`"
            aria-label="Clear automatically when a new batch starts"
            @click="$emit('update:autoClear', !autoClear)"><AppIcon name="recycle" :size="14"/></button>
  </div>

</template>

<style scoped>
.toolbar {
  /* The line of the run progress is on its bottom edge (ProgressIndicator) */
  position: relative;
}

.marking-filter {
  font-size: 13px;
  line-height: 1;
}

.select-all {
  min-width: 112px;
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
