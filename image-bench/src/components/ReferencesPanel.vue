<script setup>
/**
 * Reference images of the edit models (Forge ImageStitch of the shown WebUI tab, or the LoadImage nodes marked
 * ib:ref in ComfyUI), named Image 1, 2, ...
 * as edit prompts refer to them. Images are added by browsing, dropping (also from the Generated tab
 * and the trays) or pasting, and from the editor if it sends here.
 */
import {ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {editorName, editorShortName} from "@/editor.js";
import NumberStepper from "@/components/NumberStepper.vue";
import {imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";

defineProps({
  // {enabled, images: [src], maxSize}
  references: {
    type: Object,
    required: true
  },
  // Where images sent from the editor go: input or reference
  editorTarget: {
    type: String,
    required: true,
    validator: value => ["input", "reference"].includes(value)
  },
  // Feature check (useFeatures): referencesEnabled, referenceMaxSize
  has: {
    type: Function,
    default: () => true
  }
});

const emit = defineEmits(['add', 'remove', 'clear', 'enabled', 'max-size', 'editor-target']);

const dragOver = ref(false);

async function onBrowse() {
  const files = await pickImageFiles(true);

  if (files.length)
    emit('add', files);
}

async function onDrop(e) {
  dragOver.value = false;

  const files = await imageFilesFromDataTransfer(e.dataTransfer);

  if (files.length)
    emit('add', files);
}

async function onPaste(e) {
  const files = await imageFilesFromDataTransfer(e.clipboardData);

  if (files.length) {
    e.preventDefault();
    emit('add', files);
  }
}
</script>

<template>
  <div class="references" @paste="onPaste">
    <div class="row">
      <label v-if="has('referencesEnabled')" class="check" title="Pass the images to the model (ImageStitch Integrated)">
        <input type="checkbox" :checked="references.enabled" @change="e => emit('enabled', e.target.checked)">Use
      </label>
      <span class="spacer"></span>
      <label v-if="has('referenceMaxSize')" class="max-size" title="Maximum side length of the references, 0 for no limit">Max side
        <NumberStepper :model-value="references.maxSize ?? ''" :min="0" :max="2048" :step="256" label="Maximum side length"
                       @update:model-value="v => emit('max-size', v)"/>
      </label>
      <button v-if="has('referenceMaxSize')" class="ib sm" :disabled="references.maxSize === 0"
              title="Any side (no size limit)" aria-label="Reset the maximum side to no limit"
              @click="emit('max-size', 0)"><AppIcon name="infinity" :size="13"/></button>
      <button class="ib sm" :disabled="!references.images.length" title="Remove all references"
              aria-label="Remove all references" @click="emit('clear')"><AppIcon name="trash" :size="13"/></button>
    </div>

    <ol class="slots" aria-label="Reference images">
      <li v-for="(src, index) in references.images" :key="`${index}:${src}`" class="slot">
        <img :src="src" alt="">
        <span class="name">Image {{ index + 1 }}</span>
        <button class="ib sm" :aria-label="`Remove image ${index + 1}`" title="Remove"
                @click="emit('remove', index)"><AppIcon name="close" :size="13"/></button>
      </li>
    </ol>

    <button type="button" class="drop" :class="{over: dragOver}" @click="onBrowse"
            @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <span><AppIcon name="upload" :size="14"/>Drop, paste or browse</span>
      <small>or drag from Generated and the trays</small>
    </button>

    <label class="row editor">
      <span class="ps">{{ editorShortName() }}</span>sends to
      <span class="select-wrap">
        <select :value="editorTarget" :aria-label="`Where images from ${editorName} go`"
                @change="e => emit('editor-target', e.target.value)">
          <option value="input">Input image</option>
          <option value="reference">New reference</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </span>
    </label>
  </div>
</template>

<style scoped>
.references {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  font-size: 12px;
}

.spacer {
  flex: 1;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ib-text);
}

.max-size {
  display: flex;
  align-items: center;
  gap: 6px;
}

.max-size :deep(.stepper input) {
  width: 44px;
}

.slots {
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px;
  border-radius: 5px;
}

.slot:hover {
  background: var(--ib-hover);
}

.slot img {
  width: 44px;
  height: 44px;
  flex: none;
  object-fit: cover;
  border-radius: 4px;
  background: var(--ib-elev);
}

.name {
  flex: 1;
  font-size: 12.5px;
}

.drop {
  flex: 1 0 52px;
  max-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px dashed var(--ib-border-2);
  border-radius: 6px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.drop span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drop small {
  color: var(--ib-muted);
  font-size: 11px;
}

.drop:hover,
.drop.over {
  border-color: var(--ib-accent-border);
  color: var(--ib-text);
}

.editor {
  padding-top: 6px;
  border-top: 1px solid var(--ib-border);
  font-size: 11px;
}

.ps {
  padding: 0 4px;
  border-radius: 3px;
  background: #31a8ff;
  color: #001e36;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
}
</style>
