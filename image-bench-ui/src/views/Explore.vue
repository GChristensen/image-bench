<script setup>

import {computed, onBeforeMount, onMounted, reactive, ref} from "vue";
import SelectableImage from "@/components/SelectableImage.vue";
import {createImageData, createImageGenerationParams, createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {useExploreImagesStore} from "@/stores/explore.js";

const exploreImagesStore = useExploreImagesStore();

const models = ref([]);
const selected = ref(new Set());
const lastPreset = ref("");
const presetNames = ref([]);
const presetSelect = ref();
let modelPresets = {};
const modelImages = computed(() => exploreImagesStore.images);
const generateImages = ref(3);

const showImageOverlay = ref(false);
const overlayImage = ref(null);
const generatedImagesElement = ref();
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");

let scrolledToBottom = true;

async function refreshModels() {
  models.value = await fetch("/sdapi/v1/sd-models").then(r => r.json());
}

async function loadPresets() {
  const response = await fetch("/image-bench/explore_presets");

  if (response.ok && response.headers.get("content-length") > 0) {
    modelPresets = await response.json();
  }
  else
    modelPresets = {};

  lastPreset.value = modelPresets.last_preset || "";
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

  exploreImagesStore.clear();
  sendWebUIMessage({type: "EXPLORE_MODELS", models: selectedModels, generateImages: generateImages.value})
}

async function onCreateClick(e) {
  e.preventDefault();

  const presetName = prompt("New preset name: ");

  if (presetName) {
    lastPreset.value = presetName;
    modelPresets.presets = modelPresets.presets || {};
    modelPresets.presets[presetName] = getSelectedModels().map(m => m.sha256);
    modelPresets.last_preset = presetName;

    if (!presetNames.value.some(m => m === presetName))
      presetNames.value.push(presetName);

    await writePresets();
  }
}

async function onSaveClick(e) {
  e.preventDefault();

  const presetName = presetSelect.value.value;

  if (presetName) {
    modelPresets.presets = modelPresets.presets || {};
    modelPresets.presets[presetName] = getSelectedModels().map(m => m.sha256);
    modelPresets.last_preset = presetName;
    await writePresets();
  }
  else
    alert("No preset is selected.");
}

async function onDeleteClick(e) {
  e.preventDefault();

  if (!confirm("Do you really want to continue?"))
    return;

  const presetName = presetSelect.value.value;
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

function onPresetChange(e) {
  activatePreset(e.target.value)
}

function activatePreset(presetName) {
  selected.value = new Set();

  for (let i = 0; i < models.value.length; ++i) {
    if (modelPresets.presets[presetName].some(h => h === models.value[i].sha256)) {
      selected.value.add(i);
    }
  }

  lastPreset.value = presetName;
  modelPresets.last_preset = lastPreset.value;
  return writePresets();
}

function onImageClick(image) {
  overlayImage.value = createImageLink(image.imagePath);
  showImageOverlay.value = true;
}

function onImageOpen(image) {
  const imageLink = createImageLink(image.imagePath);
  window.open(imageLink, "_blank");
}

function onShowParams(image) {
  paramsOverlayText.value = createImageGenerationParams(image);
  showParamsOverlay.value = true;
}


function onBeforeSDEvent(e) {
  const gi = generatedImagesElement.value;
  scrolledToBottom = (gi.clientHeight === gi.scrollHeight) || (gi.scrollHeight - gi.scrollTop === gi.clientHeight);
}

function onAfterSDEvent(e) {
  if (scrolledToBottom) {
    const gi = generatedImagesElement.value;
    setTimeout(() => gi.scrollTop = gi.scrollHeight, 500);
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
  <ImageOverlay v-if="showImageOverlay" :image="overlayImage"
                @hide-overlay="showImageOverlay = false"/>
  <ParametersOverlay v-if="showParamsOverlay" :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="wrapper">
    <div class="toolbar">
      <a href="#" class="tool-item" id="explore-selected" @click="onExploreClick">Explore</a>
      <div class="generate-images-container">
        <label>Generate images:&nbsp;<input type="number" class="generate-images" v-model="generateImages"></label>
      </div>
    </div>
    <div class="explore-container">
      <div class="model-list">
        Presets&nbsp;
        <select class="model-presets" ref="presetSelect" @change="onPresetChange">
          <option v-for="name in presetNames" :value="name" :selected="lastPreset === name">{{ name }}</option>
        </select>
        <div class="preset-controls">
          <a class="control-link" href="#" @click="onCreateClick">Create</a
          >&nbsp;<a class="control-link" href="#" @click="onSaveClick">Save</a
          >&nbsp;<a class="control-link" href="#" @click="onDeleteClick">Delete</a>
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
        <div class="generated-images" ref="generatedImagesElement">
          <div class="model-images-wrapper" v-for="model in modelImages">
            <h3 class="model-name">{{ model.name }}</h3>
            <div class="model-images">
              <SelectableImage v-for="image in model.images"
                               :image="image"
                               @show-params="() => onShowParams(image)"
                               @image-click="() => onImageClick(image)"
                               @image-open="onImageOpen"></SelectableImage>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.explore-container {
  display: flex;
  flex-grow: 1;
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
  margin: 15px 0;
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

.control-link {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
  padding: 3px;
  font-size: 90%;
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
</style>