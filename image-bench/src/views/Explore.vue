<script setup>

import {computed, nextTick, onBeforeMount, ref, shallowRef, toRaw, watch} from "vue";
import GeneratedImage from "@/components/GeneratedImage.vue";
import {createImageGenerationParams, createImageLink, sendWebUIMessage} from "@/sdwebui.js";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {fetchModelInfo, showModelInfo} from "@/civitai.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useExploreList} from "@/composables/useExploreList.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import ExploreParamsModal from "@/components/ExploreParamsModal.vue";
import LoraParamsModal from "@/components/LoraParamsModal.vue";
import ExploreListPanel from "@/components/ExploreListPanel.vue";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";

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
const storage = useLocalStorage();
const appConfigStore = useAppConfigStore();

// Shared explore presets object: checkpoints use the top-level keys, LoRAs the "loras" section
let explorePresets = {};

const checkpoints = useExploreList({
  keyOf: model => model.model_name,
  section: () => explorePresets,
  keys: {presets: "presets", lastPreset: "last_preset", params: "model_params", selection: "last_selection"},
  save: writePresets
});

const loras = useExploreList({
  keyOf: lora => lora.name,
  labelOf: lora => lora.folder ? `${lora.folder}/${lora.name}` : lora.name,
  section: () => explorePresets.loras = explorePresets.loras || {},
  keys: {presets: "presets", lastPreset: "last_preset", params: "params", selection: "last_selection"},
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

const exploreSummary = computed(() => {
  const models = checkpoints.selected.value.size;
  const nLoras = loras.selected.value.size;
  const parts = [`${models} model${models === 1 ? "" : "s"}`];

  if (nLoras)
    parts.push(`${nLoras} LoRA${nLoras === 1 ? "" : "s"}`);

  // The same variants as in ModelExplorationStrategy: each LoRA, plus a LoRA-free run unless disabled
  const variants = nLoras + (nLoras && appConfigStore.exploreLoraFreeImages === false ? 0 : 1);
  const total = models * variants * generateImagesNumber.value;

  parts.push(`${generateImagesNumber.value} image${generateImagesNumber.value == 1 ? "" : "s"} each (${total})`);
  return parts.join(" · ");
});

const progressLabel = computed(() => {
  const percent = `${Math.round(exploreImagesStore.generationProgress)}%`;

  if (exploreImagesStore.generationTotal > 0)
    return `${exploreImagesStore.generationCompleted}/${exploreImagesStore.generationTotal} · ${percent}`;

  const images = modelImages.value.reduce((n, model) => n + model.images.length, 0);
  return `${percent} · ${images} image${images === 1 ? "" : "s"}`;
});

const generatedImagesElement = ref();
const showImageOverlay = ref(false);
const overlayImage = ref(null);
const highlightedImage = shallowRef(null);
const showParamsOverlay = ref(false);
const paramsOverlayText = ref("");
const paramsOverlayImage = ref(null);

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

function getLoraWeight(lora) {
  return lora.params?.weight ?? getLoraDefaults(lora).weight;
}

/**
 * Build the prompt string of a LoRA: <lora:name:weight> followed by the extra text
 * The file name is used rather than the alias: aliases come from the ss_output_name metadata,
 * which trainers often leave generic (e.g. AI Toolkit's "aitk_lora"), and WebUI rejects shared aliases
 * ComfyUI loads the LoRA in the node marked ib:lora, so its prompt string is only the extra text
 */
function createLoraPrompt(lora) {
  const text = lora.params?.text ?? getLoraDefaults(lora).text;

  if (import.meta.env.MODE === "comfy")
    return text;

  return `<lora:${lora.name}:${getLoraWeight(lora)}>` + (text ? ` ${text}` : "");
}

function onExploreClick() {
  if (exploreImagesStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else {
    const selectedModels = checkpoints.getSelectedItems();
    const selectedLoras = loras.getSelectedItems()
      .map(lora => ({name: lora.name, prompt: createLoraPrompt(lora), weight: getLoraWeight(lora)}));

    exploreImagesStore.generationProgress = 0;
    exploreImagesStore.generationCompleted = 0;
    exploreImagesStore.generationTotal = 0;
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
  const presetName = await dialog.prompt("New preset name:",
    {storageKey: activeTab.value === TAB_LORAS ? "loraPresetName" : "presetName"});

  if (presetName)
    await activeList.value.createPreset(presetName);
}

async function onDeleteClick() {
  const presetName = activeList.value.currentPreset.value;

  if (!presetName) {
    await dialog.alert("No preset is selected.");
    return;
  }

  if (await dialog.confirm(`Delete preset "${presetName}"?`, {okText: "Delete", danger: true}))
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

const modelInfoBusy = ref(false);

async function onModelInfo() {
  const isLora = activeTab.value === TAB_LORAS;
  const key = activeList.value.focusedKey.value;
  const query = {kind: isLora ? "lora" : "checkpoint", name: key};

  // The first request for a model may take a while: the backend hashes the file
  modelInfoBusy.value = true;
  const info = await fetchModelInfo(query);
  modelInfoBusy.value = false;

  const actions = isLora && info.trainedWords?.length ? [{id: "activation-text", label: "Use as activation text"}] : [];
  const result = await showModelInfo(query, {actions, info});

  if (result?.action === "activation-text")
    await loras.setParams(key, {...loras.params.value[key], text: result.info.trainedWords.join(", ")});
}

function onImageClick(image) {
  overlayImage.value = image;
  showImageOverlay.value = true;
}

// Closes the preview overlay, highlighting the previewed thumbnail and scrolling it into view
async function closeImageOverlay() {
  if (!showImageOverlay.value)
    return;

  showImageOverlay.value = false;

  // Reset first so that revealing the same image again re-triggers scrolling
  highlightedImage.value = null;
  await nextTick();
  highlightedImage.value = toRaw(overlayImage.value);
}

function isHighlighted(image) {
  return !!highlightedImage.value && toRaw(image) === highlightedImage.value;
}

function onImageOpen(image) {
  const imageLink = createImageLink(image);
  window.open(imageLink, "_blank");
}

/**
 * Save the results as a single HTML page. The backend streams the page as an attachment
 * and the form posts into a hidden frame, so the download goes to disk without buffering here
 */
function onSaveResults() {
  const groups = modelImages.value.map(model => ({
    name: model.name,
    images: model.images.map(({imagePath, imageUrl, parameters}) => ({imagePath, imageUrl, parameters}))
  }));
  const title = `Exploration · ${exploreSummary.value} · ${new Date().toLocaleString()}`;

  let frame = document.querySelector("iframe[name='ib-export-frame']");

  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = "ib-export-frame";
    frame.hidden = true;
    document.body.appendChild(frame);
  }

  const form = document.createElement("form");
  form.method = "post";
  form.action = "/image-bench/explore_export";
  form.target = frame.name;
  form.hidden = true;

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "data";
  input.value = JSON.stringify({title, groups});
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function onShowParams(image) {
  paramsOverlayText.value = createImageGenerationParams(image);
  paramsOverlayImage.value = image;
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
    closeImageOverlay();
    showParamsOverlay.value = false;
  }
}
</script>

<template>
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
                @hide-overlay="closeImageOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay" :image="paramsOverlayImage" :text="paramsOverlayText"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="wrapper">
    <div class="toolbar">
      <div class="toolbar-group">
        <button id="explore-selected" class="btn swap"
                :class="exploreImagesStore.generationInProgress ? 'stop' : 'primary'" @click="onExploreClick">
          <span :class="{off: exploreImagesStore.generationInProgress}"><AppIcon name="play" :size="13"/>Explore</span>
          <span :class="{off: !exploreImagesStore.generationInProgress}"><AppIcon name="stop" :size="13"/>Stop</span>
        </button>
        <label class="toolbar-group-label" title="Images per model">×<NumberStepper v-model="generateImagesNumber" label="Images per model"/></label>
      </div>
      <ProgressIndicator v-if="exploreImagesStore.generationInProgress"
                         :value="exploreImagesStore.generationProgress" :label="progressLabel"/>
      <span v-else class="explore-summary">{{ exploreSummary }}</span>
      <div class="toolbar-spacer"></div>
      <button class="btn" :disabled="exploreImagesStore.generationInProgress || !modelImages.length"
              title="Save the results as a single HTML page"
              @click="onSaveResults"><AppIcon name="download" :size="14"/>Save results</button>
      <button class="btn" :disabled="exploreImagesStore.generationInProgress || !modelImages.length"
              @click="exploreImagesStore.clear()"><AppIcon name="eraser" :size="14"/>Clear results</button>
    </div>
    <div class="explore-container">
      <div class="model-list">
        <div class="seg">
          <button :class="{on: activeTab === TAB_CHECKPOINTS}" @click="activeTab = TAB_CHECKPOINTS"
            >Checkpoints<span class="count">{{ checkpoints.selected.value.size }}/{{ checkpoints.items.value.length }}</span></button>
          <button :class="{on: activeTab === TAB_LORAS}" @click="activeTab = TAB_LORAS"
            >LoRAs<span class="count">{{ loras.selected.value.size }}/{{ loras.items.value.length }}</span></button>
        </div>
        <ExploreListPanel
          :items="activeListItems"
          :selected="activeList.selected.value"
          :preset-names="activeList.presetNames.value"
          :current-preset="activeList.currentPreset.value"
          :focused-key="activeList.focusedKey.value"
          :params="activeList.params.value"
          :summary="settingsSummary"
          :item-kind="activeTab === TAB_LORAS ? 'LoRA' : 'model'"
          :info-busy="modelInfoBusy"
          @toggle="activeList.toggle"
          @toggle-many="activeList.setChecked"
          @focus="activeList.focus"
          @preset-change="activeList.activatePreset"
          @create="onCreateClick"
          @save="activeList.saveCurrentPreset"
          @delete="onDeleteClick"
          @clear="activeList.clearSelection"
          @edit-settings="onEditSettings"
          @info="onModelInfo"
        />
      </div>
      <div class="generated-images-wrapper">
        <div class="generated-images scrollable" ref="generatedImagesElement">
          <section class="model-group" v-for="model in modelImages" :key="model.name">
            <div class="model-group-header">
              <h3 class="model-name" :title="model.name">{{ model.name }}</h3>
              <span class="model-group-count">{{ model.images.length }} image{{ model.images.length === 1 ? "" : "s" }}</span>
            </div>
            <div class="model-images">
              <GeneratedImage v-for="image in model.images"
                               kind="explore"
                               :is-tray="false"
                               :image="image"
                               :displayed="true"
                               :highlighted="isHighlighted(image)"
                               @show-params="() => onShowParams(image)"
                               @image-click="() => onImageClick(image)"
                               @image-open="() => onImageOpen(image)"></GeneratedImage>
            </div>
          </section>
          <div v-if="!modelImages.length && !exploreImagesStore.generationInProgress" class="empty-state">
            Check models (and optionally LoRAs) on the left, then press <b>Explore</b>.
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

.explore-summary {
  margin-left: 6px;
  font-size: 12px;
  color: var(--ib-muted);
  white-space: nowrap;
}

.explore-container {
  display: flex;
  flex-grow: 1;
  min-height: 0;
}

.model-list {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--ib-surface);
  border-right: 1px solid var(--ib-border);
}

.generated-images-wrapper {
  position: relative;
  flex-grow: 1;
}

.generated-images {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-group {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 10px;
  background: var(--ib-surface);
  border: 1px solid var(--ib-border);
  border-radius: 6px;
}

.model-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.model-name {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ib-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-group-count {
  font-size: 12px;
  color: var(--ib-muted);
  white-space: nowrap;
}

.model-images {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.empty-state {
  margin: auto;
  color: var(--ib-muted);
}

.empty-state b {
  color: var(--ib-text-2);
  font-weight: 600;
}
</style>
