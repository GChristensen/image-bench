<script setup>

import {computed, onBeforeMount, ref, watch} from "vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ImageStream from "@/components/ImageStream.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import ImageToolbar from "@/components/ImageToolbar.vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {generationStateToKind, KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {createImageLink} from "@/sdwebui.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useKeyboardShortcuts} from "@/composables/useKeyboardShortcuts.js";
import {dialog} from "@/dialogs/useDialog.js";

const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: (value) => {
      return ['generated', 'image-tray', 'concept-tray', 'upscaled'].includes(value);
    }
  }
});

const config = useAppConfigStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaleTrayStore = useConceptTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const imageStore = getImageStore();

const imageToolbar = ref();
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
const isShowingMarked = ref(false);
const openFileInput = ref()

// Composables
const webUI = useWebUIBridge();
const imageOps = useImageOperations();
const storage = useLocalStorage();

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

function onSelectAllClick() {
  imageStream.value.selectAll();
}

function onClearClick() {
  imageStream.value.clear();
}

function onUpscaleSelectedClick() {
  const selectedImages = imageStream.value.getSelectedImages();

  if (upscaledImageStore.generationInProgress) {
    webUI.stopGeneration();
  }
  else {
    if (selectedImages.length) {
      if (config.automaticallyClearGeneratedImages)
        upscaledImageStore.clear();

      upscaledImageStore.startingGeneration();

      webUI.upscaleImages(selectedImages);
    }
  }
}

function onUpscaleImage(imageProxy, usePreset) {
  const image = imageOps.cloneImage(imageProxy);

  if (config.automaticallyClearGeneratedImages)
    upscaledImageStore.clear();

  upscaledImageStore.startingGeneration();

  webUI.upscaleImages([image]);
}

function onBatchGenerateClick() {
  if (imageStore.generationInProgress) {
    webUI.stopGeneration();
  }
  else {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    const nImagesToGenerate = imageToolbar.value.generateImagesNumber;
    webUI.batchGenerate(nImagesToGenerate);
  }
}

async function onGenerateVariationsClick() {
  const variationStrength = storage.getVariationStrength();
  const strength = await dialog.prompt("Variation strength:",
    {defaultValue: variationStrength, storageKey: "variationStrength"});

  if (strength) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    const nImagesToGenerate = imageToolbar.value.generateImagesNumber;

    storage.setVariationStrength(strength);
    webUI.generateVariations(strength, nImagesToGenerate);
  }
}

function onStopGenerationClick() {
  webUI.stopGeneration();
}

// Tray persist replaces all image objects with the ones returned by the server:
// keep the overlay on the current object, so that its changes (e.g. markings) are not lost
watch(() => imageStore.images, images => {
  const image = overlayImage.value;

  if (image)
    overlayImage.value = images.find(i => !i.separator && i.imagePath === image.imagePath) || image;
});

function onImageClick(image) {
  overlayImage.value = image;
  showImageOverlay.value = true;
}

function onImageOpen(image) {
  imageOps.openImageInNewWindow(image);
}

function onShowParams(image) {
  paramsOverlayText.value = imageOps.getImageParams(image);
  paramsOverlayImage.value = image;
  showParamsOverlay.value = true;
}

function closeImageOverlay() {
  if (!showImageOverlay.value)
    return;

  showImageOverlay.value = false;
  imageStream.value.revealImage(overlayImage.value);
}

function onImageSelectOverlay(evt, image) {
  evt.preventDefault();
  imageStream.value.selectImage(image);
  closeImageOverlay();
}

// After deleting, the overlay moves on to the neighbouring image, or closes if there is none
async function onDeleteImageOverlay(image) {
  const neighbour = imageStream.value.getNextImage(image) || imageStream.value.getPrevImage(image);

  if (!await imageStream.value.deleteImage(image))
    return;

  if (neighbour)
    overlayImage.value = neighbour;
  else
    showImageOverlay.value = false;
}

function onConfigPresetChange(preset) {
  imageStore.applyPreset = preset;
  storage.setConfigPreset(props.kind, preset);
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
  imageStore.applyPreset = lastConfigPreset.value = storage.getConfigPreset(props.kind);
});

// Keyboard shortcuts
useKeyboardShortcuts({
  onEscape: hideOverlay,
  onArrowLeft: displayPrevImage,
  onArrowRight: displayNextImage,
  onCtrlU: () => imageStream.value.selectAll(false)
});

function hideOverlay() {
  closeImageOverlay();
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

function onShowMarkedClick() {
  if (isShowingMarked.value) {
    isShowingMarked.value = false;
  }
  else {
    isShowingMarked.value = true;
  }
}

function onOpenClick() {
  openFileInput.value.click();
}

async function onOpenFileInputChange(e) {
  if (!e.target.files[0]) {
    await dialog.alert('Please select a file.');
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
        await dialog.alert(result.error, {title: "Upload failed"});
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

function onSaveClick() {
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
                :kind="kind"
                @hide-overlay="closeImageOverlay"
                @image-select="onImageSelectOverlay"
                @set-marking="imageStore.persist()"
                @delete-image="onDeleteImageOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay"
                     :image="paramsOverlayImage"
                     :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="view-container">
    <!-- Hidden file input for tray open functionality -->
    <input type="file" class="open-file-input" ref="openFileInput" @change="onOpenFileInputChange"
           accept=".png, .zip" multiple>
    
    <!-- Presentational toolbar component -->
    <ImageToolbar
      ref="imageToolbar"
      :kind="kind"
      :is-tray="isComponentTray(kind)"
      :is-all-selected="isAllSelected"
      :is-some-selected="isSomeSelected"
      :is-showing-marked="isShowingMarked"
      :generation-in-progress="imageStore.generationInProgress"
      :generation-progress="imageStore.generationProgress"
      :generation-completed="imageStore.generationCompleted"
      :generation-total="imageStore.generationTotal"
      :upscale-in-progress="upscaledImageStore.generationInProgress"
      :apply-preset="imageStore.applyPreset"
      :presets="configPresetsStore.presets"
      :preset-images="config.generatePresetImages"
      @save="onSaveClick"
      @open="onOpenClick"
      @select-all="onSelectAllClick"
      @show-marked="onShowMarkedClick"
      @batch-generate="onBatchGenerateClick"
      @generate-variations="onGenerateVariationsClick"
      @stop-generation="onStopGenerationClick"
      @upscale-selected="onUpscaleSelectedClick"
      @clear="onClearClick"
      @preset-change="onConfigPresetChange"
    />
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
  .open-file-input {
    display: none;
  }
</style>
