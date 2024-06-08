<script setup>

import {computed, ref} from "vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ImageStream from "@/components/ImageStream.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";

const imageStream = ref(null);
const showOverlay = ref(false);
const overlayImage = ref(null);
const overlayImageIndex = ref(null);
const isAllSelected = computed(() => imageStream.value?.isAllSelected);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");

function onSelectAllClick(e) {
  e.preventDefault();
  imageStream.value.selectAll();
}

function onClearClick(e) {
  e.preventDefault();
  imageStream.value.clearUnselected();
}

function onImageClick(index) {
  overlayImageIndex.value = index;
  overlayImage.value = imageStream.value.getImageLink(index);
  showOverlay.value = true;
}

function onImageOpen(index) {
  overlayImageIndex.value = index;
  const imageLink = imageStream.value.getImageLink(index);
  window.open(imageLink, "_blank");
}


function onShowParams(index) {
  paramsOverlayText.value = imageStream.value.getImageGenerationParams(index);
  showParamsOverlay.value = true;
}

function onImageSelectOverlay(evt, index) {
  evt.preventDefault();
  imageStream.value.selectImage(index);
  showOverlay.value = false;
}

function onSDEvent(e) {
  imageStream.value.addImage(e);
}

defineExpose({onSDEvent, imageStream});

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
                @image-select="onImageSelectOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay" :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <div class="toolbar">
      <a href="#" class="tool-item" id="select-all" @click="onSelectAllClick">
        {{ isAllSelected? "Unselect all": "Select all" }}
      </a>
      <a href="#" class="tool-item" id="clear" @click="onClearClick">Clear unselected</a>
    </div>
    <ImageStream ref="imageStream"
                 @image-click="onImageClick"
                 @image-open="onImageOpen"
                 @show-params="onShowParams"></ImageStream>
  </div>
</template>

<style scoped>

</style>