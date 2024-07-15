<script setup>

import {computed, onBeforeMount, ref} from "vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ImageStream from "@/components/ImageStream.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {generationStateToKind, KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {createImageGenerationParams, createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";

const props = defineProps(["kind"]);

const config = useAppConfigStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaleTrayStore = useConceptTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const imageStore = getImageStore();

const imageStream = ref(null);
const showImageOverlay = ref(false);
// const overlayImageLink = ref(null);
// const overlayImageIndex = ref(null);
const overlayImage = ref(null);
const isAllSelected = computed(() => imageStream.value?.isAllSelected);
const isSomeSelected = computed(() => imageStream.value?.isSomeSelected);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");
const paramsOverlayImage = ref(null);
const lastConfigPreset = ref("");
const batchGenerate = ref();
const isShowingMarked = ref(false);
const openFileInput = ref()

function getImageStore() {
  switch (props.kind) {
    case KIND_GENERATED:
      return generatedImagesStore;
    case KIND_IMAGE_TRAY:
      return imageTrayStore;
    case KIND_CONCEPT_TRAY:
      return upscaleTrayStore;
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

      upscaledImageStore.startingGeneration();

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

  if (config.automaticallyClearGeneratedImages)
    upscaledImageStore.clear();

  upscaledImageStore.startingGeneration();

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

    generatedImagesStore.startingGeneration();

    sendWebUIMessage({type: "BATCH_GENERATE", preset: imageStore.applyPreset});
  }
}

function onGenerateVariationsClick(e) {
  e.preventDefault();

  let variationStrength = localStorage.getItem("imageBench_variationStrength");

  if (!variationStrength)
    variationStrength = "0.12";

  const strength = prompt("Variation strength:", variationStrength);
  if (strength) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    localStorage.setItem("imageBench_variationStrength", strength);
    sendWebUIMessage({type: "GENERATE_VARIATIONS", strength, preset: imageStore.applyPreset});
  }
}

function onStopGenerationClick(e) {
  e.preventDefault();

  sendWebUIMessage({type: "STOP_GENERATION"});
}

function onImageClick(image) {
  overlayImage.value = image;
  showImageOverlay.value = true;
}

function onImageOpen(image) {
  //overlayImage.value = index;
  const imageLink = createImageLink(image)
  window.open(imageLink, "_blank");
}

function onShowParams(image) {
  paramsOverlayText.value = createImageGenerationParams(image);
  paramsOverlayImage.value = image;
  showParamsOverlay.value = true;
}

function onImageSelectOverlay(evt, image) {
  evt.preventDefault();
  imageStream.value.selectImage(image);
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
  else if (e.key.toUpperCase() === "U" && e.ctrlKey) {
    e.preventDefault();
    imageStream.value.selectAll(false);
  }
}

function hideOverlay() {
  showImageOverlay.value = false;
  showParamsOverlay.value = false;
}

function onMarkingFilter() {
  isShowingMarked.value = true;
}

function displayPrevImage() {
  if (showImageOverlay.value) {
    const prevImage = imageStream.value.getPrevImage(overlayImage.value);

    if (prevImage) {
      overlayImage.value = prevImage;
    }
  }
}

function displayNextImage() {
  if (showImageOverlay.value) {
    const nextImage = imageStream.value.getNextImage(overlayImage.value);

    if (nextImage) {
      overlayImage.value = nextImage;
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

function onOpenClick(e) {
  e.preventDefault();
  openFileInput.value.click();
}

async function onOpenFileInputChange(e) {
  if (!e.target.files[0]) {
    alert('Please select a file.');
    return;
  }

  for (const file of e.target.files) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/image-bench/${props.kind}_upload`, {
      method: "post",
      body: formData
    });

    if (response.ok) {
      const result = await response.json();

      if (result.error) {
        alert(result.error);
      } else {
        imageStream.value.beforeAddImage();

        if (Array.isArray(result))
          result.forEach(i => imageStore.images.push(i));
        else
          imageStore.images.push(result);

        imageStream.value.afterAddImage();
        await imageStore.persist();
      }
    }
  }
}

function onSaveClick(e) {
  e.preventDefault();
  const link = document.createElement('a');
  link.href = "/image-bench/download_image_tray?kind=" + props.kind;
  link.download = props.kind + ".zip";
  link.click();
}

defineExpose({onBeforeSDEvent, onAfterSDEvent, imageStream});

function isComponentTray(kind) {
  return kind === KIND_IMAGE_TRAY || kind === KIND_CONCEPT_TRAY;
}

</script>

<template>
  <ImageOverlay v-if="showImageOverlay"
                :image="overlayImage"
                :is-tray="isComponentTray(kind)"
                @hide-overlay="showImageOverlay = false"
                @image-select="onImageSelectOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay"
                     :image="paramsOverlayImage"
                     :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <div class="toolbar">
      <a v-if="isComponentTray(kind)" href="#" class="tool-item" id="save" @click="onSaveClick">Save</a>
      <a v-if="isComponentTray(kind)" href="#" class="tool-item" id="open" @click="onOpenClick">Open</a>
      <input type="file" class="open-file-input" ref="openFileInput" @change="onOpenFileInputChange"
             accept=".png, .zip" multiple>
      <a v-if="isComponentTray(kind)" href="#" class="tool-item" id="select-all" @click="onSelectAllClick">
        {{ isAllSelected? "Unselect all": "Select all" }}
      </a>
      <a v-if="isComponentTray(kind)" href="#" class="tool-item" id="show-marked" @click="onShowMarkedClick">
        {{ isShowingMarked? "Show all": "Show marked" }}
      </a>
      <a v-if="kind === KIND_GENERATED && !generatedImagesStore.generationInProgress"
         href="#" class="tool-item" id="batch-generate" ref="batchGenerate"
         @click="onBatchGenerateClick"
        >Generate</a>
      <a v-if="kind === KIND_GENERATED && !generatedImagesStore.generationInProgress"
         href="#" class="tool-item" id="generate-variations"
         @click="onGenerateVariationsClick"
      >Variations</a>
      <a v-if="kind === KIND_GENERATED && generatedImagesStore.generationInProgress"
         href="#" class="tool-item" id="stop-generation"
         @click="onStopGenerationClick"
      >Stop</a>
      <a v-if="isComponentTray(kind) && !upscaledImageStore.generationInProgress" href="#" class="tool-item" id="upscale-selected" @click="onUpscaleSelectedClick"
        >Upscale selected</a>
      <a v-if="kind === KIND_UPSCALED && upscaledImageStore.generationInProgress" href="#" class="tool-item" id="upscale-selected"
         @click="onUpscaleSelectedClick"
        >Stop</a>
      <a href="#" class="tool-item" id="clear" @click="onClearClick">{{ isSomeSelected? "Clear selected": "Clear" }}</a>
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
                 @marking-filter="onMarkingFilter"
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

  .open-file-input {
    display: none;
  }

  .tool-item {
    white-space: nowrap;
  }
</style>