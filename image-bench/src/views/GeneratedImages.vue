<script setup>

import {computed, ref, toRaw, watch} from "vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ImageStream from "@/components/ImageStream.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import ImageToolbar from "@/components/ImageToolbar.vue";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {generationStateToKind, KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {useGenerationSettingsStore} from "@/stores/generationSettings.js";
import {createImageLink, ensureGenerationIdle, getGenerationState} from "@/sdwebui.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useCompareStore} from "@/stores/compare.js";
import {flashTrayTab} from "@/components/utils.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useImageOperations} from "@/composables/useImageOperations.js";
import {useKeyboardShortcuts} from "@/composables/useKeyboardShortcuts.js";
import {dialog} from "@/dialogs/useDialog.js";
import {isStill} from "@/media.js";

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
const generationSettings = useGenerationSettingsStore();
const imageStore = getImageStore();

const imageToolbar = ref();
const imageStream = ref(null);
const showImageOverlay = ref(false);
// const overlayImageLink = ref(null);
// const overlayImageIndex = ref(null);
const overlayImage = ref(null);
const isAllSelected = computed(() => imageStream.value?.isAllSelected);
const selectedCount = computed(() => imageStream.value?.selectedCount || 0);
const showParamsOverlay = ref(false);
const paramsOverlayImage = ref(null);
const lastConfigPreset = ref("");
const isShowingMarked = ref(false);
// Marking the shown images are filtered by (with isShowingMarked), set by clicking the marking of an image
const markingFilter = ref(null);
const openFileInput = ref()

// Composables
const webUI = useWebUIBridge();
const imageOps = useImageOperations();

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

function onRemoveSelectedClick() {
  imageStream.value.removeSelected();
}

// All checked images of the view, including those hidden by the marking filter, as dragging them does
async function onCompareSelectedClick() {
  const compareStore = useCompareStore();

  for (const image of imageStore.images.filter(i => i.selected && !i.separator && isStill(i)))
    await compareStore.addImage(toRaw(image));

  flashTrayTab("compare-tab");
}

const TRAY_TAB_IDS = {[KIND_IMAGE_TRAY]: "image-tray-tab", [KIND_CONCEPT_TRAY]: "concept-tray-tab"};

async function onTraySelectedClick(trayKind) {
  const trayStore = trayKind === KIND_IMAGE_TRAY ? imageTrayStore : upscaleTrayStore;

  for (const image of imageStore.images.filter(i => i.selected && !i.separator))
    await trayStore.addImage(toRaw(image));

  flashTrayTab(TRAY_TAB_IDS[trayKind]);
}

async function onUpscaleSelectedClick() {
  const selectedImages = imageStream.value.getSelectedImages().filter(isStill);

  if (upscaledImageStore.generationInProgress) {
    webUI.stopGeneration();
  }
  else {
    if (selectedImages.length && await ensureGenerationIdle()) {
      upscaledImageStore.startingGeneration();

      webUI.upscaleImages(selectedImages);
    }
  }
}

async function onUpscaleImage(imageProxy) {
  const image = imageOps.cloneImage(imageProxy);

  if (!await ensureGenerationIdle())
    return;

  upscaledImageStore.startingGeneration();

  webUI.upscaleImages([image]);
}

async function onBatchGenerateClick() {
  if (imageStore.generationInProgress) {
    webUI.stopGeneration();
  }
  else if (await ensureGenerationIdle()) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    const nImagesToGenerate = imageToolbar.value.generateImagesNumber;
    webUI.batchGenerate(nImagesToGenerate);
  }
}

async function onGenerateVariationsClick() {
  if (!await ensureGenerationIdle())
    return;

  const strength = await dialog.prompt("Variation strength:",
    {defaultValue: generationSettings.settings.variationStrength, storageKey: "variationStrength"});

  if (strength) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    generatedImagesStore.startingGeneration();

    const nImagesToGenerate = imageToolbar.value.generateImagesNumber;

    generationSettings.set("variationStrength", strength);
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
  generationSettings.setConfigPreset(props.kind, preset);
}

function onBeforeSDEvent(e) {
  if (e.type === "SAVED_IMAGE") {
    imageStream.value.beforeAddImage();
  }
}

function onAfterSDEvent(e) {
  if (e.type === "SAVED_IMAGE") {
    const currentKind = generationStateToKind(getGenerationState());

    if (currentKind === props.kind)
      imageStream.value.afterAddImage();
  }
}

// The settings may arrive after the view is mounted
watch(() => generationSettings.loaded, loaded => {
  if (loaded)
    imageStore.applyPreset = lastConfigPreset.value = generationSettings.configPreset(props.kind);
}, {immediate: true});

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

// Clicking the marking the images are filtered by shows all images again
function onMarkingFilter(marking) {
  if (markingFilter.value === marking) {
    markingFilter.value = null;
    isShowingMarked.value = false;
  }
  else {
    markingFilter.value = marking;
    isShowingMarked.value = true;
  }
}

function onMarkingFilterOverlay(marking) {
  closeImageOverlay();
  onMarkingFilter(marking);
}

const overlayHasPrev = computed(() => showImageOverlay.value && !!imageStream.value?.getPrevImage(overlayImage.value));
const overlayHasNext = computed(() => showImageOverlay.value && !!imageStream.value?.getNextImage(overlayImage.value));

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
    markingFilter.value = null;
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

// A pending tray change is saved first, so that the archive has it
async function onSaveClick() {
  await imageStore.flush?.();

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
                :upscalable="isComponentTray(kind) || kind === KIND_GENERATED"
                :marking-filter="markingFilter"
                :markable="kind === KIND_GENERATED || kind === KIND_UPSCALED"
                :has-prev="overlayHasPrev"
                :has-next="overlayHasNext"
                @navigate="step => step < 0 ? displayPrevImage() : displayNextImage()"
                @show-params="onShowParams"
                @upscale-image="onUpscaleImage"
                @add-comment="image => imageStream.addComment(image)"
                @filter-marking="onMarkingFilterOverlay"
                @hide-overlay="closeImageOverlay"
                @image-select="onImageSelectOverlay"
                @set-marking="imageStore.persist?.()"
                @delete-image="onDeleteImageOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay"
                     :image="paramsOverlayImage"
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
      :selected-count="selectedCount"
      :auto-clear="config.automaticallyClearGeneratedImages"
      :is-showing-marked="isShowingMarked"
      :marking-filter="markingFilter"
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
      @remove-selected="onRemoveSelectedClick"
      @compare-selected="onCompareSelectedClick"
      @tray-selected="onTraySelectedClick"
      @unselect-all="imageStream.unselectAll()"
      @update:autoClear="value => config.automaticallyClearGeneratedImages = value"
      @preset-change="onConfigPresetChange"
    />
    <ImageStream ref="imageStream"
                 :kind="kind"
                 :image-store="imageStore"
                 :show-marked="isShowingMarked"
                 :marking-filter="markingFilter"
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
