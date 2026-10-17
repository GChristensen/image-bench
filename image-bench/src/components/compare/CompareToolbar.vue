<script setup>
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {editorIcon, editorName} from "@/editor.js";
import {REGION_ASPECTS} from "@/components/compare/compareGeometry.js";

/**
 * Presentational toolbar of the Compare tab
 */
const props = defineProps({
  imageCount: {
    type: Number,
    default: 0
  },
  markedCount: {
    type: Number,
    default: 0
  },
  selecting: {
    type: Boolean,
    default: false
  },
  hasRegion: {
    type: Boolean,
    default: false
  },
  cropView: {
    type: Boolean,
    default: false
  },
  aspect: {
    type: String,
    default: "free"
  },
  // Zoom relative to fit, and the label of the current zoom in pixels of the first image
  zoom: {
    type: Number,
    default: 1
  },
  zoomLabel: {
    type: String,
    default: ""
  },
  separatorName: {
    type: String,
    required: true
  },
  separatorColor: {
    type: String,
    required: true
  },
  exporting: {
    type: Boolean,
    default: false
  }
});

// The image the zoom presets and the label refer to
const pixelsOf = computed(() => props.cropView ? "largest crop" : "first image");

defineEmits(["upload", "toggleSelect", "update:aspect", "clearRegion", "toggleCrop", "zoom",
  "cycleSeparator", "savePng", "sendToEditor", "removeMarked", "clear"]);
</script>

<template>
  <div class="toolbar">
    <button class="ib" title="Add images from files (.png, .jpg, .webp)" aria-label="Add images from files"
            @click="$emit('upload')"><AppIcon name="upload"/></button>

    <div class="vsep"></div>

    <button class="ib" :class="{on: selecting}" :aria-pressed="selecting" :disabled="!imageCount || cropView"
            :title="selecting ? 'Selecting a region: drag on any image, drag inside to move, handles resize; Shift keeps the ratio (R)'
              : 'Select a region on the images (R)'"
            aria-label="Select a region" @click="$emit('toggleSelect')"><AppIcon name="region" :size="14"/></button>
    <div class="select-wrap aspect-select" title="Aspect ratio of the region in pixels">
      <select :value="aspect" aria-label="Aspect ratio of the region"
              @change="$emit('update:aspect', $event.target.value)">
        <option v-for="option in REGION_ASPECTS" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
      <AppIcon name="chevron" :size="14"/>
    </div>
    <button class="ib" title="Clear the region" aria-label="Clear the region" :disabled="!hasRegion"
            @click="$emit('clearRegion')"><AppIcon name="close" :size="14"/></button>
    <button class="btn" :class="cropView ? 'primary' : 'outline'" :disabled="!hasRegion || !imageCount"
            :title="cropView ? 'Show the whole images (X)' : 'Show the region of all images side by side (X)'"
            @click="$emit('toggleCrop')"><AppIcon name="crop" :size="14"/>Crops</button>

    <template v-if="cropView">
      <button class="ib" title="Save the crops as one PNG image" aria-label="Save the crops as PNG"
              :disabled="exporting" @click="$emit('savePng')"><AppIcon name="save" :size="14"/></button>
      <button class="ib" :title="`Send the crops to ${editorName} as a new document`" :aria-label="`Send the crops to ${editorName}`"
              :disabled="exporting" @click="$emit('sendToEditor')"><AppIcon :name="editorIcon()" :size="14"/></button>
    </template>

    <div class="vsep"></div>
    <div class="toolbar-group">
      <button class="btn small" :class="{on: zoom === 1}"
              :title="cropView ? 'Fit the crops (the wheel zooms, dragging pans)' : 'Fit the images (Ctrl+wheel zooms)'"
              @click="$emit('zoom', 'fit')"><AppIcon name="fit" :size="13"/></button>
      <button class="btn small" :title="`Actual pixels of the ${pixelsOf}`" @click="$emit('zoom', 1)">100%</button>
      <button class="btn small" :title="`Twice the actual pixels of the ${pixelsOf}`" @click="$emit('zoom', 2)">200%</button>
    </div>
    <span v-if="zoom !== 1" class="zoom-label" :title="`Zoom in pixels of the ${pixelsOf}`">{{ zoomLabel }}</span>

    <div class="vsep"></div>
    <button class="ib" :title="`Separator: ${separatorName} (click to change)`" aria-label="Separator color"
            @click="$emit('cycleSeparator')"><span class="swatch" :style="{background: separatorColor}"></span></button>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <span class="toolbar-group-label"><AppIcon name="eraser" :size="14"/>Clear</span>
      <button class="btn small" :disabled="!markedCount"
              :title="`Remove the ${markedCount} marked images (the files stay on disk)`"
              @click="$emit('removeMarked', true)">Marked</button>
      <button class="btn small" :disabled="markedCount === imageCount"
              :title="`Remove the ${imageCount - markedCount} unmarked images (the files stay on disk)`"
              @click="$emit('removeMarked', false)">Unmarked</button>
      <button class="btn small" :disabled="!imageCount"
              :title="`Remove all ${imageCount} images (the files stay on disk)`"
              @click="$emit('clear')">All</button>
    </div>
  </div>
</template>

<style scoped>
.aspect-select {
  flex: none;
  width: 76px;
}

.btn.small.on {
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.zoom-label {
  color: var(--ib-text-2);
  font-family: var(--ib-mono);
  font-size: 12px;
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px var(--ib-border-2);
}
</style>
