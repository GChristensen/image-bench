<script setup>

import {computed, onBeforeMount, ref} from "vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ImageStream from "@/components/ImageStream.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {generationStateToKind, KIND_GENERATED, KIND_TRAY, KIND_UPSCALED} from "@/consts.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {createImageLink} from "@/utils.js";

const props = defineProps(["kind"]);

const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();

const imageStream = ref(null);
const showImageOverlay = ref(false);
const overlayImageLink = ref(null);
const overlayImageIndex = ref(null);
const isAllSelected = computed(() => imageStream.value?.isAllSelected);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");
const configPresets = ref();
const lastConfigPreset = ref("");

function getImageStore() {
  switch (props.kind) {
    case KIND_GENERATED:
      return generatedImagesStore;
    case KIND_TRAY:
      return imageTrayStore;
    case KIND_UPSCALED:
      return upscaledImageStore;
  }
}

function onSelectAllClick(e) {
  e.preventDefault();
  imageStream.value.selectAll();
}

function onClearClick(e) {
  e.preventDefault();
  imageStream.value.clear();
}

function onUpscaleSelectedClick(e) {
  e.preventDefault();
  const selectedImages = imageStream.value.getSelectedImages();

  if (selectedImages.length) {
    window.opener.postMessage({type: "UPSCALE_IMAGES", images: selectedImages, preset: configPresets.value.value});
  }
}

function onUpscaleImage(imageProxy) {
  const image = JSON.parse(JSON.stringify(imageProxy))
  window.opener.postMessage({type: "UPSCALE_IMAGES", images: [image], preset: configPresets.value.value});
}

function onBatchGenerateClick(e) {
  e.preventDefault();

  window.opener.postMessage({type: "BATCH_GENERATE", preset: configPresets.value.value});
}

function onImageClick(index) {
  overlayImageIndex.value = index;
  overlayImageLink.value = imageStream.value.getImageLink(index);
  showImageOverlay.value = true;
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
  showImageOverlay.value = false;
}

function onConfigPresetChange(e) {
  localStorage.setItem("imageBench_" + props.kind + "_configPreset", e.target.value);
}

function onBeforeSDEvent(e) {
  imageStream.value.beforeAddImage();
}

function onSDEvent(e) {
  const currentKind = generationStateToKind(window.getGenerationState());
  console.log([currentKind, props.kind]);
  if (currentKind === props.kind)
    imageStream.value.afterAddImage();
}

onBeforeMount(() => {
  lastConfigPreset.value = localStorage.getItem("imageBench_" + props.kind + "_configPreset");
});

document.addEventListener("keydown", onKeydown);

function onKeydown(e) {
  if (e.key === "Esc" || e.key === "Escape") {
    hideOverlay();
  }
  else if (e.key === "ArrowLeft") {
    displayPrevImage();
  }
  else if (e.key === "ArrowRight") {
    displayNextImage();
  }
}

function hideOverlay() {
  showImageOverlay.value = false;
  showParamsOverlay.value = false;
}

function displayPrevImage() {
  if (showImageOverlay.value) {
    const prevImage = imageStream.value.getPrevImage(overlayImageIndex.value);

    if (prevImage) {
      overlayImageLink.value = createImageLink(prevImage.imagePath);
      overlayImageIndex.value -= 1;
    }
  }
}

function displayNextImage() {
  if (showImageOverlay.value) {
    const nextImage = imageStream.value.getNextImage(overlayImageIndex.value);

    if (nextImage) {
      overlayImageLink.value = createImageLink(nextImage.imagePath);
      overlayImageIndex.value += 1;
    }
  }
}

defineExpose({onBeforeSDEvent, onSDEvent, imageStream});


</script>

<template>
  <ImageOverlay v-if="showImageOverlay"
                :image="overlayImageLink"
                :imageIndex="overlayImageIndex"
                :is-tray="kind === KIND_TRAY"
                @hide-overlay="showImageOverlay = false"
                @image-select="onImageSelectOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay" :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <div class="toolbar">
      <a v-if="kind === KIND_TRAY" href="#" class="tool-item" id="select-all" @click="onSelectAllClick">
        {{ isAllSelected? "Unselect all": "Select all" }}
      </a>
      <a href="#" class="tool-item" id="clear" @click="onClearClick">Clear</a>
      <a v-if="kind === KIND_GENERATED" href="#" class="tool-item" id="batch-generate"
         @click="onBatchGenerateClick"
        >Generate</a>
      <a v-if="kind === KIND_TRAY" href="#" class="tool-item" id="upscale-selected"
         @click="onUpscaleSelectedClick"
        >Upscale selected</a>
      <!--a href="#" class="tool-item" id="upscale-selected" v-if="isTray" @click="onUpscaleSelectedClick">Clear storage</a-->
      <div class="toolbar-spacer"></div>
      <div v-if="kind !== KIND_UPSCALED">Apply preset:
        <select class="config-presets" ref="configPresets" @change="onConfigPresetChange">
          <option v-for="preset in configPresetsStore.presets"
                  :value="preset"
                  :selected="lastConfigPreset === preset">{{ preset }}</option>
        </select>
      </div>
    </div>
    <ImageStream ref="imageStream"
                 :is-tray="kind === KIND_TRAY"
                 :image-store="getImageStore()"
                 @image-click="onImageClick"
                 @image-open="onImageOpen"
                 @show-params="onShowParams"
                 @upscale-image="onUpscaleImage"></ImageStream>
  </div>
</template>

<style scoped>
  .toolbar-spacer {
    flex-grow: 1;
  }
</style>