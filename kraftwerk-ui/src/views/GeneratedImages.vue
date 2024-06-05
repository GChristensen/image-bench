<script setup>

import {computed, h, ref, render} from "vue";
import SelectableImage from "@/components/SelectableImage.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";

const images = ref([]);
const selected = ref(new Set());
const allSelected = computed(() => images.value.length && (images.value.length === selected.value.size));
const showOverlay = ref(false);
const overlayImage = ref(null);
const overlayImageIndex = ref(null);

function onSelectAllClick(e) {
  e.preventDefault();

  if (allSelected.value) {
    selected.value.clear();
  }
  else {
    for (let i = 0; i < images.value.length; ++i)
      selected.value.add(i);
  }
}

function onClearClick(e) {
  e.preventDefault();

  const remainingItems = [];
  const selectedItems = [];
  let selectedCtr = 0;

  for (let i = 0; i < images.value.length; ++i) {
    if (selected.value.has(i)) {
      remainingItems.push(images.value[i]);
      selectedItems.push(selectedCtr++);
    }
  }

  images.value = remainingItems;
  selected.value = new Set(selectedItems);
}

function onUpscaleSelectedClick(e) {
  e.preventDefault();
}

function createPreview(data) {
  const fileURL = "http://" + location.host + "/file=";
  const imageLink = fileURL + encodeURIComponent(data.filename);
  const parameters = JSON.stringify(data.pnginfo);

  return {imageLink, parameters};
}

function onItemSelected(isSelected, index) {
  if (isSelected)
    selected.value.add(index)
  else {
    selected.value.delete(index);
  }
}

function onImageSelect(evt, index) {
  evt.preventDefault();
  selected.value.add(index);
  showOverlay.value = false;
}

function onImageClick(index) {
  overlayImageIndex.value = index;
  overlayImage.value = images.value[index].imageLink;
  showOverlay.value = true;
}

function onSDEvent(e) {
  const previewData = createPreview(e);
  images.value.push(previewData);
}

defineExpose({onSDEvent});

document.addEventListener("keydown", onKeydown);

function onKeydown(e) {
  if (e.key === "Esc" || e.key === "Escape") {
    showOverlay.value = false;
  }
}

</script>

<template>
  <ImageOverlay v-if="showOverlay" :image="overlayImage" :imageIndex="overlayImageIndex"
                @hide-overlay="showOverlay = false"
                @image-select="onImageSelect"/>
  <div class="view-container">
    <div class="toolbar">
      <a href="#" class="tool-item" id="select-all" @click="onSelectAllClick">
        {{ allSelected? "Unselect all": "Select all" }}
      </a>
      <a href="#" class="tool-item" id="clear" @click="onClearClick">Clear unselected</a>
      <a href="#" class="tool-item" id="upscale-selected" @click="onUpscaleSelectedClick">Upscale selected</a>
    </div>
    <div class="item-stream-container">
      <div class="item-stream">
        <SelectableImage v-for="(item, index) in images"
          :image-link="item.imageLink"
          :parameters="item.parameters"
          :selected="selected.has(index)"
          @image-click="() => onImageClick(index)"
          @select="isSelected => onItemSelected(isSelected, index)"
        ></SelectableImage>
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>