<script setup>

import {computed, onBeforeMount, ref, watch} from "vue";
import GeneratedImage from "@/components/GeneratedImage.vue";
import {createImageGenerationParams, createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {useExploreImagesStore} from "@/stores/explore.js";
import {usePromptModal} from "@/composables/usePromptModal.js";
import {useExploreList} from "@/composables/useExploreList.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import PromptModal from "@/components/PromptModal.vue";
import ExploreParamsModal from "@/components/ExploreParamsModal.vue";
import LoraParamsModal from "@/components/LoraParamsModal.vue";
import ExploreListPanel from "@/components/ExploreListPanel.vue";

const TAB_CHECKPOINTS = "checkpoints";
const TAB_LORAS = "loras";
const ACTIVE_TAB_STORAGE_KEY = "imageBench_exploreActiveTab";

const PARAM_LABELS = {
  sampler: "Smp",
  scheduler: "Sch",
  steps: "Steps",
  shift: "Shift",
  cfg: "CFG",
  distilledCfg: "DCFG"
};

const LORA_PARAM_LABELS = {
  weight: "Weight",
  text: "Text"
};

const exploreImagesStore = useExploreImagesStore();
const promptModal = usePromptModal();
const storage = useLocalStorage();
const appConfigStore = useAppConfigStore();

// Shared explore presets object: checkpoints use the top-level keys, LoRAs the "loras" section
let explorePresets = {};

const checkpoints = useExploreList({
  keyOf: model => model.model_name,
  section: () => explorePresets,
  keys: {presets: "presets", lastPreset: "last_preset", params: "model_params"},
  save: writePresets
});

const loras = useExploreList({
  keyOf: lora => lora.name,
  labelOf: lora => lora.folder ? `${lora.folder}/${lora.name}` : lora.name,
  section: () => explorePresets.loras = explorePresets.loras || {},
  keys: {presets: "presets", lastPreset: "last_preset", params: "params"},
  save: writePresets
});

const activeTab = ref(storage.getItem(ACTIVE_TAB_STORAGE_KEY, TAB_CHECKPOINTS));
const activeList = computed(() => activeTab.value === TAB_LORAS ? loras : checkpoints);

watch(activeTab, tab => storage.setItem(ACTIVE_TAB_STORAGE_KEY, tab));

const modelImages = computed(() => exploreImagesStore.images);
const generateImagesNumber = ref(3);

const samplers = ref([]);
const schedulers = ref([]);
const showParamsModal = ref(false);
const showLoraParamsModal = ref(false);

const activeListItems = computed(() => {
  const list = activeList.value;
  return list.items.value.map(item => ({key: list.keyOf(item), label: list.labelOf(item)}));
});

const focusedModelParams = computed(() =>
  checkpoints.focusedKey.value ? checkpoints.params.value[checkpoints.focusedKey.value] : null);

const focusedLora = computed(() =>
  loras.items.value.find(lora => lora.name === loras.focusedKey.value) || null);
const focusedLoraParams = computed(() =>
  loras.focusedKey.value ? loras.params.value[loras.focusedKey.value] : null);

const settingsSummary = computed(() => {
  const list = activeList.value;
  const labels = activeTab.value === TAB_LORAS ? LORA_PARAM_LABELS : PARAM_LABELS;
  const params = list.focusedKey.value ? list.params.value[list.focusedKey.value] : null;
  const items = params
    ? Object.keys(labels).filter(k => k in params).map(k => `${labels[k]}: ${params[k]}`)
    : [];

  return items.length ? items.join(", ") : "default";
});

const generatedImagesElement = ref();
const showImageOverlay = ref(false);
const overlayImage = ref(null);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");

let scrolledToBottom = true;

function sortByName(list, nameOf) {
  return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, {numeric: true, sensitivity: "base"}));
}

async function refreshModels() {
  const modelList = await fetch("/image-bench/models").then(r => r.json());
  checkpoints.items.value = sortByName(modelList, m => m.model_name);
}

async function refreshLoras() {
  const response = await fetch("/image-bench/loras");
  loras.items.value = response.ok ? sortByName(await response.json(), loras.labelOf) : [];
}

async function loadPresets() {
  const response = await fetch("/image-bench/explore_presets");

  if (response.ok && response.headers.get("content-length") > 0)
    explorePresets = await response.json();
  else
    explorePresets = {};

  checkpoints.load();
  loras.load();
}

async function loadSamplers() {
  const response = await fetch("/image-bench/samplers");

  if (response.ok) {
    const data = await response.json();
    samplers.value = data.samplers || [];
    schedulers.value = data.schedulers || [];
  }
}

async function writePresets() {
  const presets = JSON.stringify(explorePresets);
  await fetch("/image-bench/explore_presets", {method: "post", body: presets});
}

onBeforeMount(async () => {
  await Promise.all([refreshModels(), refreshLoras()]);
  await loadPresets();
  await loadSamplers();
});

function getLoraDefaults(lora) {
  return {
    weight: lora?.preferredWeight ?? 1,
    text: lora?.activationText ?? ""
  };
}

/**
 * Build the prompt string of a LoRA: <lora:alias:weight> followed by the extra text
 */
function createLoraPrompt(lora) {
  const defaults = getLoraDefaults(lora);
  const weight = lora.params?.weight ?? defaults.weight;
  const text = lora.params?.text ?? defaults.text;

  return `<lora:${lora.alias}:${weight}>` + (text ? ` ${text}` : "");
}

function onExploreClick() {
  if (exploreImagesStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else {
    const selectedModels = checkpoints.getSelectedItems();
    const selectedLoras = loras.getSelectedItems().map(lora => ({name: lora.name, prompt: createLoraPrompt(lora)}));

    exploreImagesStore.generationProgress = 0;
    exploreImagesStore.generationInProgress = true;
    exploreImagesStore.clear();
    sendWebUIMessage({
      type: "EXPLORE_MODELS",
      models: selectedModels,
      loras: selectedLoras,
      loraFreeImages: appConfigStore.exploreLoraFreeImages,
      generateImages: generateImagesNumber.value
    });
  }
}

async function onCreateClick() {
  const presetName = await promptModal.showPrompt(
    "New preset name:",
    "",
    activeTab.value === TAB_LORAS ? "loraPresetName" : "presetName"
  );

  if (presetName)
    await activeList.value.createPreset(presetName);
}

async function onDeleteClick() {
  if (confirm("Do you really want to continue?"))
    await activeList.value.deleteCurrentPreset();
}

function onEditSettings() {
  if (!activeList.value.focusedKey.value)
    return;

  if (activeTab.value === TAB_LORAS)
    showLoraParamsModal.value = true;
  else
    showParamsModal.value = true;
}

async function onParamsConfirm(params) {
  showParamsModal.value = false;
  await checkpoints.setParams(checkpoints.focusedKey.value, params);
}

async function onLoraParamsConfirm(params) {
  showLoraParamsModal.value = false;

  // Store only values that differ from the LoRA defaults
  const defaults = getLoraDefaults(focusedLora.value);
  const changed = {};

  if (params.weight !== defaults.weight)
    changed.weight = params.weight;

  if (params.text !== defaults.text)
    changed.text = params.text;

  await loras.setParams(loras.focusedKey.value, changed);
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
  <ExploreParamsModal
    :show="showParamsModal"
    :model-name="checkpoints.focusedKey.value || ''"
    :params="focusedModelParams"
    :samplers="samplers"
    :schedulers="schedulers"
    @confirm="onParamsConfirm"
    @cancel="showParamsModal = false"
  />
  <LoraParamsModal
    :show="showLoraParamsModal"
    :lora-name="loras.focusedKey.value || ''"
    :params="focusedLoraParams"
    :defaults="getLoraDefaults(focusedLora)"
    @confirm="onLoraParamsConfirm"
    @cancel="showLoraParamsModal = false"
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
        <div class="tabs">
          <a href="#" class="tab" :class="{active: activeTab === 'checkpoints'}"
             @click.prevent="activeTab = 'checkpoints'">Checkpoints</a>
          <a href="#" class="tab" :class="{active: activeTab === 'loras'}"
             @click.prevent="activeTab = 'loras'">Loras<span v-if="loras.selected.value.size"
              >&nbsp;({{ loras.selected.value.size }})</span></a>
        </div>
        <ExploreListPanel
          :items="activeListItems"
          :selected="activeList.selected.value"
          :preset-names="activeList.presetNames.value"
          :current-preset="activeList.currentPreset.value"
          :focused-key="activeList.focusedKey.value"
          :params="activeList.params.value"
          :summary="settingsSummary"
          :item-kind="activeTab === 'loras' ? 'LoRA' : 'model'"
          @toggle="activeList.toggle"
          @focus="activeList.focus"
          @preset-change="activeList.activatePreset"
          @create="onCreateClick"
          @save="activeList.saveCurrentPreset"
          @delete="onDeleteClick"
          @clear="activeList.clearSelection"
          @edit-settings="onEditSettings"
        />
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

.model-list {
  margin: 0 0 15px 0;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  padding-right: 10px;
  border-right: 1px solid white;
}

.tabs {
  display: flex;
  margin-bottom: 8px;
  border-bottom: 1px solid white;
}

.tab {
  padding: 2px 10px;
  cursor: pointer;
  text-decoration: none;
  color: white;
  white-space: nowrap;
  border-bottom: 3px solid transparent;
}

.tab:hover {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.tab.active {
  border-bottom-color: white;
  font-weight: bold;
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
