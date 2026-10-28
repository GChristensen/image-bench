<script setup>

import {computed, nextTick, onBeforeMount, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, watch} from "vue";
import {useDragSize} from "@/composables/useDragSize.js";
import GeneratedImage from "@/components/GeneratedImage.vue";
import {createImageLink, ensureGenerationIdle, sendWebUIMessage} from "@/sdwebui.js";
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
import RunControl from "@/components/RunControl.vue";
import {useTabRun} from "@/runState.js";
import ScrollTopButton from "@/components/ScrollTopButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ClearButton from "@/components/ClearButton.vue";
import {removeWithUndo} from "@/undo.js";
import {createLoraPrompt, getLoraDefaults, getLoraWeight} from "@/loras.js";

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

// What to do in the empty results
const EMPTY_WAYS = [
  {text: "Check checkpoints on the left. Check LoRAs too for a model × LoRA matrix."},
  {text: "Click Explore to render the current prompt with each checked model."}
];
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

// Matrix mode: one image per model x LoRA, rows are models, columns are LoRAs
const matrixMode = ref(false);

watch(matrixMode, on => generateImagesNumber.value = on ? 1 : 3);
watch(() => loras.selected.value.size, n => {
  if (!n)
    matrixMode.value = false;
});

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

  // The same variants as in ModelExplorationStrategy: each LoRA, plus a LoRA-free run unless disabled
  const variants = nLoras + (nLoras && appConfigStore.exploreLoraFreeImages === false ? 0 : 1);
  const total = models * variants * generateImagesNumber.value;

  if (matrixMode.value)
    return `${models} model${models === 1 ? "" : "s"} × ${variants} column${variants === 1 ? "" : "s"} · matrix (${total})`;

  const parts = [`${models} model${models === 1 ? "" : "s"}`];

  if (nLoras)
    parts.push(`${nLoras} LoRA${nLoras === 1 ? "" : "s"}`);

  parts.push(`${generateImagesNumber.value} image${generateImagesNumber.value == 1 ? "" : "s"} each (${total})`);
  return parts.join(" · ");
});

const imageCount = computed(() => modelImages.value.reduce((n, model) => n + model.images.length, 0));

const run = useTabRun("explore-tab");

// Progress text while the number of images is unknown
const progressLabel = computed(() => {
  const percent = `${Math.floor(run.value?.progress ?? 0)}%`;
  const images = imageCount.value;
  return `${percent} · ${images} image${images === 1 ? "" : "s"}`;
});

// Rows of a matrix run: models in the order of arrival, a cell per LoRA column (null while pending)
const matrixRows = computed(() => {
  const columns = exploreImagesStore.matrixColumns;

  if (!columns)
    return null;

  const rows = [];

  for (const group of modelImages.value) {
    let row = rows.find(r => r.model === group.model);

    if (!row) {
      row = {model: group.model, cells: columns.map(() => null)};
      rows.push(row);
    }

    const column = columns.indexOf(group.lora);

    if (column >= 0)
      row.cells[column] = group.images[0] ?? null;
  }

  return rows;
});

const generatedImagesElement = ref();
const showImageOverlay = ref(false);
const overlayImage = ref(null);
const highlightedImage = shallowRef(null);
const showParamsOverlay = ref(false);
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

async function onExploreClick() {
  if (exploreImagesStore.generationInProgress) {
    sendWebUIMessage({type: "STOP_GENERATION"});
  }
  else if (await ensureGenerationIdle()) {
    const selectedModels = checkpoints.getSelectedItems();
    const selectedLoras = loras.getSelectedItems()
      .map(lora => ({name: lora.name, prompt: createLoraPrompt(lora), weight: getLoraWeight(lora)}));

    exploreImagesStore.generationProgress = 0;
    exploreImagesStore.generationCompleted = 0;
    exploreImagesStore.generationTotal = 0;
    exploreImagesStore.generationInProgress = true;
    exploreImagesStore.clear();
    exploreImagesStore.matrixColumns = matrixMode.value
      ? [...(appConfigStore.exploreLoraFreeImages === false ? [] : [null]), ...selectedLoras.map(lora => lora.name)]
      : null;
    sendWebUIMessage({
      type: "EXPLORE_MODELS",
      models: selectedModels,
      loras: selectedLoras,
      loraFreeImages: appConfigStore.exploreLoraFreeImages,
      generateImages: generateImagesNumber.value,
      matrix: matrixMode.value
    });
  }
}

// The results are groups of images per model; the clear is undone from its notice
function onClearResultsClick() {
  removeWithUndo(exploreImagesStore, () => true,
    count => `Removed the results of ${count} model${count === 1 ? "" : "s"}. The files stay on disk.`);
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
  const exportImage = ({imagePath, imageUrl, parameters}) => ({imagePath, imageUrl, parameters});
  const groups = modelImages.value.map(model => ({
    name: model.name,
    images: model.images.map(exportImage)
  }));

  // A matrix run is saved as the same grid
  const matrix = matrixRows.value && {
    columns: exploreImagesStore.matrixColumns.map(lora => lora ?? "No LoRA"),
    rows: matrixRows.value.map(row => ({name: row.model, images: row.cells.map(image => image && exportImage(image))}))
  };
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
  input.value = JSON.stringify({title, groups, matrix});
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function onShowParams(image) {
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

// ---------- Layout ----------

const LIST_WIDTH_KEY = "imageBench_exploreListWidth";
const LIST_WIDTH = {min: 260, default: 340};
const IMAGES_MIN_WIDTH = 360;

// Width of the container; an estimate until it is measured
const containerElement = ref(null);
const containerWidth = ref(window.innerWidth);
let containerObserver = null;

onMounted(() => {
  containerObserver = new ResizeObserver(([entry]) => {
    // A deactivated (kept alive) tab is detached and measures 0
    if (entry.contentRect.width)
      containerWidth.value = entry.contentRect.width;
  });

  containerObserver.observe(containerElement.value);
});

onBeforeUnmount(() => containerObserver?.disconnect());

const listWidth = reactive(useDragSize(LIST_WIDTH_KEY, {
  axis: "x",
  direction: 1,
  min: LIST_WIDTH.min,
  max: () => Math.max(LIST_WIDTH.min, containerWidth.value - IMAGES_MIN_WIDTH),
  fallback: LIST_WIDTH.default
}));
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
  <ImageOverlay v-if="showImageOverlay" :image="overlayImage" kind="explore" markable @show-params="onShowParams"
                @hide-overlay="closeImageOverlay"/>
  <ParametersOverlay v-if="showParamsOverlay" :image="paramsOverlayImage"
                     @hide-overlay="showParamsOverlay = false"/>
  <div class="wrapper">
    <div class="toolbar">
      <RunControl label="Explore" :running="exploreImagesStore.generationInProgress" @click="onExploreClick"
                  v-model:count="generateImagesNumber" count-label="Images per model" :count-disabled="matrixMode"
                  :run="run" :progress-label="progressLabel">
        <template #after>
          <div class="seg layout-switch" role="radiogroup" aria-label="Exploration layout"
               :title="loras.selected.value.size ? '' : 'Select LoRAs to explore a model × LoRA matrix'">
            <button :class="{on: !matrixMode}" :disabled="!loras.selected.value.size" role="radio"
                    :aria-checked="!matrixMode" @click="matrixMode = false">By model</button>
            <button :class="{on: matrixMode}" :disabled="!loras.selected.value.size" role="radio"
                    :aria-checked="matrixMode" title="One image per model and LoRA, with the same seed"
                    @click="matrixMode = true">Matrix</button>
          </div>
          <button class="btn lora-free" :class="{on: appConfigStore.exploreLoraFreeImages}"
                  :aria-pressed="appConfigStore.exploreLoraFreeImages" :disabled="!loras.selected.value.size"
                  :title="loras.selected.value.size ? 'Also generate the images of each model without LoRAs, for comparison'
                    : 'Select LoRAs to generate LoRA-free images for comparison'"
                  @click="appConfigStore.exploreLoraFreeImages = !appConfigStore.exploreLoraFreeImages">No LoRA</button>
        </template>
      </RunControl>
      <span v-if="!exploreImagesStore.generationInProgress" class="explore-summary">{{ exploreSummary }}</span>
      <div class="toolbar-spacer"></div>
      <button class="btn" :disabled="exploreImagesStore.generationInProgress || !modelImages.length"
              title="Save the results as a single HTML page"
              @click="onSaveResults"><AppIcon name="download" :size="14"/>Save results</button>
      <ClearButton :images="modelImages" :markable="false" :selectable="false"
                   :disabled="exploreImagesStore.generationInProgress"
                   all-title="Remove all results; the files stay on disk" @remove="onClearResultsClick"/>
    </div>
    <div ref="containerElement" class="explore-container">
      <div class="model-list" :style="{width: `${listWidth.size}px`}">
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
      <div class="column-grip" :class="{active: listWidth.resizing}" role="separator"
           aria-orientation="vertical" aria-label="Resize the model list" :aria-valuenow="listWidth.size"
           tabindex="0" title="Drag to resize the column; double-click to restore it"
           @pointerdown="listWidth.onPointerDown" @keydown="listWidth.onKeydown"
           @dblclick="listWidth.reset"><i></i></div>
      <div class="generated-images-wrapper">
        <ScrollTopButton :target="generatedImagesElement" :content="imageCount"/>
        <div class="generated-images scrollable" ref="generatedImagesElement">
          <div v-if="matrixRows" class="matrix" :style="{'--columns': exploreImagesStore.matrixColumns.length}">
            <div class="matrix-corner"></div>
            <div class="matrix-column-header" v-for="lora in exploreImagesStore.matrixColumns" :key="lora ?? ''"
                 :title="lora ?? 'No LoRA'">{{ lora ?? "No LoRA" }}</div>
            <template v-for="row in matrixRows" :key="row.model">
              <div class="matrix-row-header" :title="row.model">{{ row.model }}</div>
              <div class="matrix-cell" v-for="(image, i) in row.cells" :key="i">
                <GeneratedImage v-if="image"
                                kind="explore"
                                :is-tray="false"
                                :image="image"
                                :displayed="true"
                                :highlighted="isHighlighted(image)"
                                @show-params="() => onShowParams(image)"
                                @image-click="() => onImageClick(image)"
                                @image-open="() => onImageOpen(image)"></GeneratedImage>
                <div v-else class="matrix-pending"></div>
              </div>
            </template>
          </div>
          <section v-else class="model-group" v-for="model in modelImages" :key="model.name">
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
          <EmptyState v-if="!modelImages.length && !exploreImagesStore.generationInProgress" icon="flask"
                      title="No results yet" chapter="explore" :ways="EMPTY_WAYS"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  /* The line of the run progress is on its bottom edge (ProgressIndicator) */
  position: relative;
}

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
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--ib-surface);
  border-right: 1px solid var(--ib-border);
}

/* Over the border of the model list, taking no width of its own */
.column-grip {
  position: relative;
  z-index: 1;
  flex: none;
  width: 10px;
  margin: 0 -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: col-resize;
  touch-action: none;
}

.column-grip i {
  width: 4px;
  height: 40px;
  border-radius: 2px;
  background: var(--ib-border-2);
}

.column-grip:hover i,
.column-grip:focus-visible i,
.column-grip.active i {
  background: var(--ib-accent);
}

.column-grip:focus-visible {
  outline: none;
  background: var(--ib-accent-soft);
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

.layout-switch {
  margin-left: 6px;
}

.layout-switch button:disabled {
  opacity: 0.45;
  cursor: default;
}

.layout-switch button:disabled:hover {
  color: var(--ib-text-2);
}

.lora-free.on {
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.lora-free:disabled {
  opacity: 0.45;
  cursor: default;
}

.matrix {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(120px, 200px) repeat(var(--columns), minmax(200px, 1fr));
  gap: 10px;
  align-items: start;
}

.matrix-corner,
.matrix-column-header,
.matrix-row-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--ib-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--ib-bg);
}

.matrix-corner,
.matrix-column-header {
  position: sticky;
  top: -12px;
  z-index: 2;
  padding: 4px 2px;
}

.matrix-corner {
  left: -16px;
  z-index: 3;
}

.matrix-column-header,
.matrix-row-header,
.matrix-cell {
  min-width: 0;
}

/* A cell holds a single card: it takes the cell width instead of the card's share of a row */
.matrix-cell :deep(.selectable-image) {
  max-width: 100%;
}

.matrix-row-header {
  position: sticky;
  left: -16px;
  z-index: 1;
  align-self: stretch;
  padding: 8px 8px 0 2px;
}

.matrix-pending {
  aspect-ratio: 1;
  border: 1px dashed var(--ib-border);
  border-radius: 6px;
}

</style>
