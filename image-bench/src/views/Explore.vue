<script setup>

import {computed, onBeforeMount, onMounted, reactive, ref} from "vue";
import GeneratedImage from "@/components/GeneratedImage.vue";
import {createImageGenerationParams, createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {useExploreImagesStore} from "@/stores/explore.js";
import {usePromptModal} from "@/composables/usePromptModal.js";
import PromptModal from "@/components/PromptModal.vue";

const exploreImagesStore = useExploreImagesStore();
const promptModal = usePromptModal();

const models = ref([]);
const selected = ref(new Set());
const lastPreset = ref("");
const presetNames = ref([]);
const presetSelect = ref();
let modelPresets = {};
const modelImages = computed(() => exploreImagesStore.images);
const generateImagesNumber = ref(3);

const showImageOverlay = ref(false);
const overlayImage = ref(null);
const generatedImagesElement = ref();
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");

let scrolledToBottom = true;

async function refreshModels() {
  models.value = await fetch("/image-bench/models").then(r => r.json());
}

async function loadPresets() {
  const response = await fetch("/image-bench/explore_presets");

  if (response.ok && response.headers.get("content-length") > 0) {
    modelPresets = await response.json();
  }
  else
    modelPresets = {};

  presetSelect.value = lastPreset.value = modelPresets.last_preset || "";
  presetNames.value = modelPresets.presets? Object.keys(modelPresets.presets): [];
  await activatePreset(lastPreset.value);
}

async function writePresets() {
  const presets = JSON.stringify(modelPresets);
  await fetch("/image-bench/explore_presets", {method: "post", body: presets});
}

onBeforeMount(async () => {
  await refreshModels();
  await loadPresets();
});

function onModelCheckChange(e, index) {
  if (e.target.checked)
    selected.value.add(index);
  else
    selected.value.delete(index);
}

function getSelectedModels() {
  const selectedItems = [];

  for (let i = 0; i < models.value.length; ++i) {
    if (selected.value.has(i)) {
      const proxyItem = models.value[i];
      const image = JSON.parse(JSON.stringify(proxyItem));
      selectedItems.push(image);
    }
  }

  return selectedItems;
}

function onExploreClick() {
  const selectedModels = getSelectedModels();

  if (exploreImagesStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else {
    exploreImagesStore.generationProgress = 0;
    exploreImagesStore.generationInProgress = true;
    exploreImagesStore.clear();
    sendWebUIMessage({type: "EXPLORE_MODELS", models: selectedModels, generateImages: generateImagesNumber.value})
  }
}

async function onCreateClick() {
  const presetName = await promptModal.showPrompt(
    "New preset name:",
    "",
    "presetName"
  );

  if (presetName) {
    lastPreset.value = presetName;
    modelPresets.presets = modelPresets.presets || {};
    modelPresets.presets[presetName] = getSelectedModels().map(m => m.model_name);
    modelPresets.last_preset = presetName;

    if (!presetNames.value.some(m => m === presetName))
      presetNames.value.push(presetName);

    await writePresets();
  }
}

async function onSaveClick() {
  const presetName = presetSelect.value;

  if (presetName) {
    modelPresets.presets = modelPresets.presets || {};
    modelPresets.presets[presetName] = getSelectedModels().map(m => m.model_name);
    modelPresets.last_preset = presetName;
    await writePresets();
  }
  else
    alert("No preset is selected.");
}

async function onDeleteClick() {
  if (!confirm("Do you really want to continue?"))
    return;

  const presetName = presetSelect.value;
  const nameIndex = presetNames.value.indexOf(presetName);

  presetNames.value.splice(nameIndex, 1);
  delete modelPresets.presets[presetName];

  if (presetNames.value.length) {
    lastPreset.value = presetNames.value[0];
    modelPresets.last_preset = lastPreset.value;
    return activatePreset(lastPreset.value);
  }

  await writePresets();
}

async function onClearClick() {
  selected.value = new Set();
}

function onPresetChange(e) {
  activatePreset(e.target.value)
}

function activatePreset(presetName) {
  selected.value = new Set();

  for (let i = 0; i < models.value.length; ++i) {
    if (modelPresets.presets[presetName].some(h => h === models.value[i].model_name)) {
      selected.value.add(i);
    }
  }

  lastPreset.value = presetName;
  modelPresets.last_preset = lastPreset.value;
  return writePresets();
}

function onImageClick(image) {
  overlayImage.value = image;
  showImageOverlay.value = true;
}

function onImageOpen(image) {
  const imageLink = createImageLink(image);
  window.open(imageLink, "_blank");
}

function onShowParams(image) {
  paramsOverlayText.value = createImageGenerationParams(image);
  showParamsOverlay.value = true;
}


function onBeforeSDEvent(e) {
  if (e.type === "SAVED_IMAGE") {
    const gi = generatedImagesElement.value;
    scrolledToBottom = (gi.clientHeight === gi.scrollHeight) || (gi.scrollHeight - gi.scrollTop === gi.clientHeight);
  }
}

function onAfterSDEvent(e) {
  if (e.type === "SAVED_IMAGE" && scrolledToBottom) {
    const gi = generatedImagesElement.value;
    setTimeout(() => gi.scrollTop = gi.scrollHeight, 333);
  }
}

defineExpose({onBeforeSDEvent, onAfterSDEvent})


document.addEventListener("keydown", onKeydown);

function onKeydown(e) {
  if (e.key === "Esc" || e.key === "Escape") {
    showImageOverlay.value = false;
    showParamsOverlay.value = false;
  }
}
</script>

<template>
  <PromptModal
    :show="promptModal.showModal.value"
    :message="promptModal.modalMessage.value"
    :default-value="promptModal.modalDefaultValue.value"
    :storage-key="promptModal.modalStorageKey.value"
    @confirm="promptModal.onConfirm"
    @cancel="promptModal.onCancel"
  />
  <ImageOverlay v-if="showImageOverlay" :image="overlayImage"
                @hide-overlay="showImageOverlay = false"/>
  <ParametersOverlay v-if="showParamsOverlay" :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="wrapper">
    <div class="toolbar">
      <a href="#" class="tool-item" id="explore-selected" @click="onExploreClick"
        >{{ exploreImagesStore.generationInProgress? "Stop": "Explore" }}</a>
      <div class="toolbar-spacer"></div>
      <div v-if="exploreImagesStore.generationInProgress" class="generation-progress">Progress:&nbsp;
        <progress max="100" :value="exploreImagesStore.generationProgress"></progress>
      </div>
      <div class="toolbar-spacer"></div>
      <div class="generate-images-container">
        <label>Generate images:&nbsp;<input type="number" class="generate-images" v-model="generateImagesNumber"></label>
      </div>
    </div>
    <div class="explore-container">
      <div class="model-list">
        Presets&nbsp;
        <select class="model-presets" v-model="presetSelect" @change="onPresetChange">
          <option v-for="name in presetNames" :value="name" :selected="lastPreset === name">{{ name }}</option>
        </select>
        <div class="preset-controls">
          <a class="control-link" href="#" @click="onCreateClick">Create</a
          >&nbsp;<a class="control-link" href="#" @click="onSaveClick">Save</a
          >&nbsp;<a class="control-link" href="#" @click="onDeleteClick">Delete</a
          >&nbsp;<a class="control-link" href="#" @click="onClearClick">Clear</a>
        </div>
        <div class="models-container">
          <div class="models">
            <div v-for="(model, index) in models">
              <label class="model-label"><input type="checkbox"
                                                @change="e => onModelCheckChange(e, index)" :checked="selected.has(index)"
                                            >&nbsp;{{model.model_name}}</label>
            </div>
          </div>
        </div>
      </div>
      <div class="generated-images-wrapper">
        <div class="generated-images scrollable" ref="generatedImagesElement">
          <div class="model-images-wrapper" v-for="model in modelImages">
            <h3 class="model-name">{{ model.name }}</h3>
            <div class="model-images">
              <GeneratedImage v-for="image in model.images"
                               :image="image"
                               :displayed="true"
                               @show-params="() => onShowParams(image)"
                               @image-click="() => onImageClick(image)"
                               @image-open="() => onImageOpen(image)"></GeneratedImage>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-item {
  padding: 5px 15px;
  cursor: pointer;
  text-decoration: none;
  color: white;
  white-space: nowrap;
}

.tool-item:hover {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.toolbar-spacer {
  flex-grow: 1;
}

.wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.explore-container {
  display: flex;
  flex-grow: 1;
  padding: 0 10px;
}

.model-presets {
  min-width: 100px;
}

.models-container {
  position: relative;
  flex-grow: 1;
  width: 280px;
}

.models {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: auto;
}

.model-list {
  margin: 0 0 15px 0;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  padding-right: 10px;
  border-right: 1px solid white;
}

.model-label {
  white-space: nowrap;
}

.generated-images-wrapper {
  position: relative;
  flex-grow: 1;
}

.generated-images {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  margin: 15px;
}

.preset-controls {
  margin-top: 2px;
  margin-bottom: 10px;
  border-bottom: solid 1px white;
}

.control-link {
  padding: 2px 5px;
  cursor: pointer;
  text-decoration: none;
  color: white;
  white-space: nowrap;
}

.control-link:hover {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.model-name {
  font-weight: bold;
}

.model-images {
  display: flex;
  border-bottom: 1px solid white;
}

.generate-images-container {
  display: flex;
}

.generate-images-container label {
  display: flex;
  align-items: center;
}

input.generate-images {
  width: 50px;
}

.generation-progress {
  width: 20%;
  display: flex;
}

.generation-progress progress {
  flex-grow: 1;
}
</style>
