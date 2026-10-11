<script setup>
/**
 * Image pane of the ControlNet tab (control image, its mask or the preprocessor preview): a header with
 * the label and the actions (slot), and the image, which may be replaced by dropping a file
 * (the tab handles pasting).
 * WebUI keeps the image, the pane shows what it reports.
 */
import {ref, watch} from "vue";
import {imageFilesFromDataTransfer} from "@/imageFiles.js";

const props = defineProps({
  image: {
    type: String,
    default: null
  },
  emptyText: {
    type: String,
    required: true
  },
  // Accepts dropped and pasted images
  droppable: {
    type: Boolean,
    default: false
  },
  // Black background, as for masks and preprocessor maps
  dark: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['file']);

const dragOver = ref(false);
const size = ref(null);

watch(() => props.image, () => size.value = null);

function onLoad(e) {
  size.value = {width: e.target.naturalWidth, height: e.target.naturalHeight};
}

async function onDrop(e) {
  dragOver.value = false;

  if (!props.droppable)
    return;

  const [file] = await imageFilesFromDataTransfer(e.dataTransfer);

  if (file)
    emit('file', file);
}

</script>

<template>
  <section class="pane" :class="{dragover: dragOver}">
    <header class="pane-header">
      <slot name="label"/>
      <span v-if="size" class="size">{{ size.width }} × {{ size.height }}</span>
      <span class="spacer"></span>
      <slot name="actions"/>
    </header>
    <div class="view" :class="{dark}"
         @dragover.prevent="dragOver = droppable" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <img v-if="image" :src="image" alt="" @load="onLoad">
      <span v-else class="empty">{{ emptyText }}</span>
      <slot/>
    </div>
  </section>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ib-border);
  border-radius: 8px;
  background: var(--ib-surface);
}

.pane.dragover {
  border-color: var(--ib-accent-border);
}

.pane-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 6px 4px 10px;
  border-bottom: 1px solid var(--ib-border);
}

.size {
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 11.5px;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.view {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view.dark {
  background: #000;
}

/* Out of the flow, so that the image does not size the grid row */
.view img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty {
  padding: 0 16px;
  color: var(--ib-muted);
  font-size: 12px;
  text-align: center;
  white-space: pre-line;
}
</style>
