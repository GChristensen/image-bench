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
import {createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {createGenerationId} from "@/utils.js";
import {onBeforeRouteLeave, onBeforeRouteUpdate} from "vue-router";

const props = defineProps(["kind"]);

const appConfigStore = useAppConfigStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const imageStore = getImageStore();

const config = appConfigStore.config;
const imageStream = ref(null);
const showImageOverlay = ref(false);
const overlayImageLink = ref(null);
const overlayImageIndex = ref(null);
const isAllSelected = computed(() => imageStream.value?.isAllSelected);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");
const paramsOverlayImage = ref(null);
const lastConfigPreset = ref("");
const batchGenerate = ref();
const isShowingMarked = ref(false);

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

  if (upscaledImageStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else {
    if (selectedImages.length) {
      if (config.automaticallyClearGeneratedImages)
        upscaledImageStore.clear();

      upscaledImageStore.generationProgress = 0;
      upscaledImageStore.generationInProgress = true;
      sendWebUIMessage({type: "UPSCALE_IMAGES", images: selectedImages, preset: imageStore.applyPreset});
    }
  }
}

function onUpscaleImage(imageProxy, usePreset) {
  const image = JSON.parse(JSON.stringify(imageProxy))
  const options = {type: "UPSCALE_IMAGES", images: [image]};

  if (usePreset) {
    options.preset = imageTrayStore.applyPreset;
  }

  sendWebUIMessage(options);
}

function onBatchGenerateClick(e) {
  e.preventDefault();

  if (imageStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    imageStore.generationProgress = 0;
    imageStore.generationInProgress = true;

    const generationId = createGenerationId();
    sendWebUIMessage({type: "BATCH_GENERATE", preset: imageStore.applyPreset, generationId});
  }
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
  paramsOverlayImage.value = imageStore.images[index];
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
  if (e.type === "SAVED_IMAGE") {
    imageStream.value.beforeAddImage();
  }
}

function onAfterSDEvent(e) {
  if (e.type === "SAVED_IMAGE") {
    const currentKind = generationStateToKind(window.getGenerationState());

    if (currentKind === props.kind)
      imageStream.value.afterAddImage();
  }
}

onBeforeMount(() => {
  imageStore.applyPreset = lastConfigPreset.value =
      localStorage.getItem("imageBench_" + props.kind + "_configPreset");
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

function onShowMarkedClick(e) {
  e.preventDefault();

  if (isShowingMarked.value) {
    isShowingMarked.value = false;
  }
  else {
    isShowingMarked.value = true;
  }
}

defineExpose({onBeforeSDEvent, onAfterSDEvent, imageStream});

</script>

<template>
  <ImageOverlay v-if="showImageOverlay"
                :image="overlayImageLink"
                :imageIndex="overlayImageIndex"
                :is-tray="kind === KIND_TRAY"
                @hide-overlay="showImageOverlay = false"
                @image-select="onImageSelectOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay"
                     :image="paramsOverlayImage"
                     :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <div class="toolbar">
      <a href="#" class="tool-item" id="clear" @click="onClearClick">Clear</a>
      <a v-if="kind === KIND_TRAY" href="#" class="tool-item" id="select-all" @click="onSelectAllClick">
        {{ isAllSelected? "Unselect all": "Select all" }}
      </a>
      <a v-if="kind === KIND_TRAY" href="#" class="tool-item" id="show-marked" @click="onShowMarkedClick">
        {{ isShowingMarked? "Show all": "Show marked" }}
      </a>
      <a v-if="kind === KIND_GENERATED" href="#" class="tool-item" id="batch-generate" ref="batchGenerate"
         @click="onBatchGenerateClick"
        >{{ generatedImagesStore.generationInProgress? "Stop": "Generate" }}</a>
      <a v-if="kind === KIND_TRAY && !upscaledImageStore.generationInProgress" href="#" class="tool-item" id="upscale-selected" @click="onUpscaleSelectedClick"
        >Upscale selected</a>
      <a v-if="kind === KIND_UPSCALED && upscaledImageStore.generationInProgress" href="#" class="tool-item" id="upscale-selected"
         @click="onUpscaleSelectedClick"
        >Stop</a>
      <!--a href="#" class="tool-item" id="upscale-selected" v-if="isTray" @click="onUpscaleSelectedClick">Clear storage</a-->
      <div class="toolbar-spacer"></div>
      <div v-if="imageStore.generationInProgress" class="generation-progress">Progress:&nbsp;
        <progress max="100" :value="imageStore.generationProgress || 0"></progress>
      </div>
      <div class="toolbar-spacer"></div>
      <div v-if="kind !== KIND_UPSCALED">Apply preset:
        <select class="config-presets" v-model="imageStore.applyPreset" @change="onConfigPresetChange">
          <option v-for="preset in configPresetsStore.presets"
                  :value="preset"
                  :selected="lastConfigPreset === preset">{{ preset }}</option>
        </select>
      </div>
    </div>
    <ImageStream ref="imageStream"
                 :kind="kind"
                 :image-store="imageStore"
                 :show-marked="isShowingMarked"
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

  .generation-progress {
    width: 20%;
    display: flex;
  }

  .generation-progress progress {
    flex-grow: 1;
  }
</style>