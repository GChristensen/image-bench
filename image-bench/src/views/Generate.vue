<script setup>
/**
 * Generate tab: the main controls of txt2img, img2img or Inpaint upload, mirrored both ways with the host,
 * so that the whole edit-generate-review cycle can happen in the popup. The host page polls the controls of the
 * shown mode while the tab is shown (WEBUI_PARAMS) and applies the edits made here (SET_WEBUI_PARAMS).
 * In WebUI, switching the mode switches the WebUI tab; the parameters of each mode are remembered here and reapplied,
 * since img2img and Inpaint share the WebUI img2img controls. In ComfyUI the mode follows the image markers
 * of the workflow, and the host page reports which parameters it found (features, see src/host.js).
 * One image is generated in place with a live preview; more images are a batch shown in the Generated tab.
 */
import {computed, onActivated, onBeforeMount, onDeactivated, reactive, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import CheckTree from "@/components/CheckTree.vue";
import GenerateImageCell from "@/components/GenerateImageCell.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";
import PromptField from "@/components/PromptField.vue";
import ReferencesPanel from "@/components/ReferencesPanel.vue";
import ResizeToInput from "@/components/ResizeToInput.vue";
import SizeSelect from "@/components/SizeSelect.vue";
import UiPresetSelect from "@/components/UiPresetSelect.vue";
import SamplingGroup from "@/components/generate/SamplingGroup.vue";
import SeedGroup from "@/components/generate/SeedGroup.vue";
import HiresGroup from "@/components/generate/HiresGroup.vue";
import Img2ImgGroup from "@/components/generate/Img2ImgGroup.vue";
import {withCurrent} from "@/components/generate/choices.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useFeatures} from "@/composables/useFeatures.js";
import {HOST_NAME} from "@/host.js";
import {createImageLink} from "@/sdwebui.js";
import {fetchModelInfo} from "@/civitai.js";
import {dialog} from "@/dialogs/useDialog.js";
import {addLoraToPrompt, hasLoraTag, removeLoraFromPrompt} from "@/loras.js";

// A value edited here is not overwritten by the polled WebUI value for this long,
// which covers the send delay and the next poll
const EDIT_HOLD = 2000;
const SEND_DELAY = 250;

// A mode switch that WebUI does not report within this time is given up
const MODE_SWITCH_TIMEOUT = 3000;

const MODES = [
  {value: "txt2img", label: "txt2img", title: "txt2img"},
  {value: "img2img", label: "img2img", title: "img2img › img2img"},
  {value: "inpaint", label: "Inpaint", title: "img2img › Inpaint upload"}
];

// Parameters common to all modes, not remembered per mode
const GLOBAL_PARAMS = ["uiPreset", "checkpoint"];

const NEGATIVE_HEIGHT_KEY = "imageBench_generateNegativeHeight";
const SIDE_TAB_KEY = "imageBench_generateSideTab";
const PHOTOSHOP_TARGET_KEY = "imageBench_generatePhotoshopTarget";
const NEGATIVE_HEIGHT = {min: 40, max: 320, default: 62, keyStep: 20};

const sdWebUI = useSDWebUIStateStore();
const generatedImagesStore = useGeneratedImagesStore();
const config = useAppConfigStore();
const webUI = useWebUIBridge();
const storage = useLocalStorage();
const has = useFeatures("generate", () => sdWebUI.features);

// ---------- Mirrored parameters ----------

// The WebUI parameters as edited here: prompt, negativePrompt, width, height, steps, cfg, shift, seed, subseed,
// subseedStrength, sampler, scheduler, denoising, uiPreset, checkpoint; txt2img: hiresUpscaler, hiresScale,
// hiresSteps (denoising is that of hires. fix); img2img and inpaint: resizeMode, maskMode, inpaintArea, maskedContent
const form = reactive({});
const editedAt = {};
let pending = {};
let sendTimeout = null;

const connected = computed(() => !!sdWebUI.params);

// ---------- Mode ----------

// Mode chosen here until WebUI reports it; meanwhile the parameters of the previous mode are ignored
const requestedMode = ref(null);
let requestTimeout = null;
const mode = computed(() => requestedMode.value ?? sdWebUI.mode);
const isTxt2Img = computed(() => mode.value === "txt2img");
// Inpaint upload, or another img2img mode tab chosen in WebUI
const hasInpaintParams = computed(() => mode.value === "inpaint" || mode.value === "other");
// The generation runs in the mode shown here; another img2img mode tab is kept as it is
const generationMode = computed(() => mode.value === "other" ? null : mode.value);

// Parameters of the modes left, reapplied when they are shown again
const modeParams = {};

watch(() => sdWebUI.params, params => {
  if (requestedMode.value) {
    if (sdWebUI.mode !== requestedMode.value)
      return;

    requestedMode.value = null;
    clearTimeout(requestTimeout);
  }

  const now = Date.now();

  for (const [name, value] of Object.entries(params || {}))
    if (!(name in pending) && now - (editedAt[name] || 0) > EDIT_HOLD)
      form[name] = value;
}, {immediate: true});

function onModeSelect(value) {
  if (value === mode.value || generating.value)
    return;

  flushParams();

  if (mode.value !== "other")
    modeParams[mode.value] = Object.fromEntries(Object.entries(form).filter(([name]) => !GLOBAL_PARAMS.includes(name)));

  // Shown at once and held until WebUI reports them for the new mode
  const params = modeParams[value] ?? null;
  const now = Date.now();

  for (const [name, paramValue] of Object.entries(params || {})) {
    form[name] = paramValue;
    editedAt[name] = now;
  }

  requestedMode.value = value;
  clearTimeout(requestTimeout);
  requestTimeout = setTimeout(() => requestedMode.value = null, MODE_SWITCH_TIMEOUT);

  webUI.setGenerationMode(value, params);
}

function setParams(values) {
  const now = Date.now();

  for (const [name, value] of Object.entries(values)) {
    form[name] = value;
    editedAt[name] = now;
    pending[name] = value;
  }

  clearTimeout(sendTimeout);
  sendTimeout = setTimeout(flushParams, SEND_DELAY);
}

function setParam(name, value) {
  setParams({[name]: value});
}

function flushParams() {
  clearTimeout(sendTimeout);

  if (Object.keys(pending).length)
    webUI.setWebUIParams(pending);

  pending = {};
}

onActivated(() => webUI.subscribeMirror(true));

onDeactivated(() => {
  flushParams();
  webUI.subscribeMirror(false);
});

// ---------- Choices ----------

const checkpoints = ref([]);
const samplers = ref([]);
const schedulers = ref([]);

const stripHash = title => title.replace(/ \[[^\]]+\]$/, "");

// The host page may send the choices of the workflow widgets (ComfyUI), which replace those of the backend
const checkpointChoices = computed(() => sdWebUI.options.checkpoints ?? checkpoints.value);
const samplerChoices = computed(() => sdWebUI.options.samplers ?? samplers.value);
const schedulerChoices = computed(() => sdWebUI.options.schedulers ?? schedulers.value);

// WebUI may report the checkpoint with or without its hash
const checkpointValue = computed(() => {
  const value = form.checkpoint;

  if (!value)
    return "";

  return checkpointChoices.value.find(title => title === value)
    ?? checkpointChoices.value.find(title => stripHash(title) === stripHash(value))
    ?? value;
});

async function loadChoices() {
  const sortByName = (list, nameOf) =>
    list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, {numeric: true, sensitivity: "base"}));

  const [models, samplerData] = await Promise.all([
    fetch("/image-bench/models").then(r => r.ok ? r.json() : []),
    fetch("/image-bench/samplers").then(r => r.ok ? r.json() : {})
  ]);

  checkpoints.value = sortByName(models.map(model => model.title), title => title);
  samplers.value = samplerData.samplers || [];
  schedulers.value = samplerData.schedulers || [];
}

// ---------- LoRAs ----------

const loras = ref([]);
const loraFilter = ref("");

const loraLabel = lora => lora.folder ? `${lora.folder}/${lora.name}` : lora.name;

const loraItems = computed(() => {
  const filter = loraFilter.value.trim().toLowerCase();

  return loras.value
    .map(lora => ({key: lora.name, label: loraLabel(lora)}))
    .filter(item => !filter || item.label.toLowerCase().includes(filter));
});

// A LoRA is checked while the prompt contains its tag, whoever put it there
const selectedLoras = computed(() =>
  new Set(loras.value.filter(lora => hasLoraTag(form.prompt, lora.name)).map(lora => lora.name)));

async function loadLoras() {
  const [list, presets] = await Promise.all([
    fetch("/image-bench/loras").then(r => r.ok ? r.json() : []),
    fetch("/image-bench/explore_presets")
      .then(r => r.ok && r.headers.get("content-length") > 0 ? r.json() : {})
      .catch(() => ({}))
  ]);

  // Weights and extra text set in the Explore tab apply here too
  const params = presets?.loras?.params || {};

  for (const lora of list)
    if (params[lora.name])
      lora.params = params[lora.name];

  loras.value = list.sort((a, b) =>
    loraLabel(a).localeCompare(loraLabel(b), undefined, {numeric: true, sensitivity: "base"}));
}

function onLoraToggle(names, checked) {
  let prompt = form.prompt || "";

  for (const name of names) {
    const lora = loras.value.find(lora => lora.name === name);

    if (!lora || hasLoraTag(prompt, name) === checked)
      continue;

    prompt = checked ? addLoraToPrompt(prompt, lora) : removeLoraFromPrompt(prompt, lora);
  }

  setParam("prompt", prompt);
}

onBeforeMount(async () => {
  await Promise.all([loadChoices(), loadLoras()]);
});

// ---------- Generation ----------

const generateImagesNumber = ref(1);
const generateForever = computed(() => generateImagesNumber.value === -1);
let finiteImagesNumber = 1;

// A single image generated from this tab, shown with its live preview
const singleInProgress = ref(false);
const batchInProgress = computed(() => generatedImagesStore.generationInProgress);
let batchForever = false;

const generating = computed(() => singleInProgress.value || batchInProgress.value || sdWebUI.busy);

const progress = computed(() => {
  if (batchInProgress.value)
    return batchForever
      ? {value: 100, label: "∞"}
      : {value: generatedImagesStore.generationProgress || 0, label: "",
         completed: generatedImagesStore.generationCompleted, total: generatedImagesStore.generationTotal};

  return {value: sdWebUI.live.active ? sdWebUI.live.progress : 0, label: ""};
});

// -1 images: generate until stopped
function toggleGenerateForever() {
  if (generateForever.value)
    generateImagesNumber.value = finiteImagesNumber;
  else {
    finiteImagesNumber = generateImagesNumber.value;
    generateImagesNumber.value = -1;
  }
}

function onGenerate() {
  flushParams();

  const nImages = Number(generateImagesNumber.value);

  // More images are a batch: it starts with the separator in the Generated tab, which then is shown
  if (nImages === -1 || nImages > 1) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    batchForever = nImages === -1;
    generatedImagesStore.startingGeneration();
    webUI.batchGenerate(nImages, {mode: generationMode.value});
  }
  else {
    singleInProgress.value = true;
    webUI.generateImage(generationMode.value);
  }
}

/**
 * Variations of the current seed: a batch that sets the variation seed and strength
 * and restores them afterwards (the batch strategy does it)
 */
async function onGenerateVariations() {
  const strength = await dialog.prompt("Variation strength:",
    {defaultValue: storage.getVariationStrength(), storageKey: "variationStrength"});

  if (!strength)
    return;

  flushParams();

  if (config.automaticallyClearGeneratedImages)
    generatedImagesStore.clear();

  const nImages = Number(generateImagesNumber.value);

  batchForever = nImages === -1;
  generatedImagesStore.startingGeneration();
  storage.setVariationStrength(strength);
  webUI.generateVariations(strength, nImages, {mode: generationMode.value});
}

function onInterrupt() {
  webUI.stopGeneration();
}

watch(() => sdWebUI.busy, (busy, wasBusy) => {
  if (wasBusy && !busy)
    singleInProgress.value = false;
});

function onAfterSDEvent(e) {
  if (e.type === "GENERATION_FINISHED")
    singleInProgress.value = false;
}

defineExpose({onAfterSDEvent});

function toggleLock() {
  const lock = !sdWebUI.promptsLocked;

  sdWebUI.setPromptsLockRemembered(lock);
  webUI.lockWebUIPrompts(lock);
}

// ---------- Image ----------

const latestImage = computed(() => {
  const images = generatedImagesStore.images;

  for (let i = images.length - 1; i >= 0; i--)
    if (!images[i].separator)
      return images[i];

  return null;
});

const livePreview = computed(() => sdWebUI.live.active ? sdWebUI.live.preview : null);
const shownImageUrl = computed(() => livePreview.value || createImageLink(latestImage.value));

// Input images of the shown mode, as WebUI reports them
const inputs = computed(() => sdWebUI.inputs.mode === mode.value ? sdWebUI.inputs : {image: null, mask: null});

function onInputUpload(kind, file) {
  webUI.setInputImage(kind, file);
}

/**
 * Reuse the (variation) seed of the latest image: set here and mirrored to WebUI like an edit,
 * so that the value is shown at once. As in WebUI, the variation seed of an image without variations is -1.
 * Without an image, the WebUI reuse button is clicked (it uses the last generation of the WebUI session)
 * @param {'seed'|'subseed'} which
 */
function onReuseSeed(which) {
  const parameters = latestImage.value?.parameters;

  if (!parameters) {
    webUI.reuseSeed(which);
    return;
  }

  const seed = which === "subseed" ? parameters["variation seed"] : parameters["seed"];
  setParam(which, seed ?? -1);
}

const showImageOverlay = ref(false);
const overlayImage = ref(null);

function onResultClick() {
  if (!latestImage.value || livePreview.value)
    return;

  overlayImage.value = latestImage.value;
  showImageOverlay.value = true;
}

function onKeydown(e) {
  if ((e.key === "Escape" || e.key === "Esc") && showImageOverlay.value)
    showImageOverlay.value = false;
}

onActivated(() => document.addEventListener("keydown", onKeydown));
onDeactivated(() => document.removeEventListener("keydown", onKeydown));

// ---------- References ----------

const referenceEdits = reactive({});

// Reference images of the edit models in the shown WebUI tab, null if WebUI has none (no Forge ImageStitch)
const references = computed(() => {
  const state = sdWebUI.references;

  if (!state)
    return null;

  // Values changed here are shown until WebUI reports them
  const now = Date.now();
  const held = Object.fromEntries(Object.entries(referenceEdits)
    .filter(([, edit]) => now - edit.at < EDIT_HOLD)
    .map(([name, edit]) => [name, edit.value]));

  return {...state, ...held};
});

// LoRA or references
const sideTab = ref(storage.getItem(SIDE_TAB_KEY) === "references" ? "references" : "lora");
const shownSideTab = computed(() => references.value ? sideTab.value : "lora");

watch(sideTab, tab => storage.setItem(SIDE_TAB_KEY, tab));

function setReferenceParam(name, param, value) {
  referenceEdits[name] = {value, at: Date.now()};
  webUI.setWebUIParams({[param]: value});
}

watch(() => sdWebUI.references, state => {
  for (const name of Object.keys(referenceEdits))
    if (state?.[name] === referenceEdits[name].value)
      delete referenceEdits[name];
});

const photoshopTarget = ref(storage.getItem(PHOTOSHOP_TARGET_KEY) === "reference" ? "reference" : "input");

function setPhotoshopTarget(target) {
  photoshopTarget.value = target;
  storage.setItem(PHOTOSHOP_TARGET_KEY, target);
  webUI.setPhotoshopTarget(target);
}

// The host page forgets the target when WebUI is reloaded
onActivated(() => webUI.setPhotoshopTarget(photoshopTarget.value));

// ---------- Model info ----------

const modelInfoBusy = ref(false);

/**
 * Open the Civitai page of the checkpoint, as the ℹ️ button added to the WebUI header does
 * The window is opened before the request, so that it is not blocked as a popup without a user gesture
 */
async function onModelInfo() {
  if (!form.checkpoint || modelInfoBusy.value)
    return;

  const civitaiWindow = window.open("about:blank", "_blank");

  modelInfoBusy.value = true;
  const info = await fetchModelInfo({kind: "checkpoint", name: checkpointValue.value});
  modelInfoBusy.value = false;

  if (info.found) {
    if (civitaiWindow)
      civitaiWindow.location = info.url;
    else
      window.open(info.url, "_blank");
    return;
  }

  civitaiWindow?.close();

  if (info.error)
    await dialog.alert(info.error, {title: "Civitai"});
  else if (info.searchUrl && await dialog.confirm(`'${info.name || stripHash(checkpointValue.value)}' is not found on Civitai. Search by name?`,
                                                  {title: "Civitai", okText: "Search"}))
    window.open(info.searchUrl, "_blank");
}

// ---------- Negative prompt height ----------

const clampHeight = height => Math.round(Math.min(NEGATIVE_HEIGHT.max, Math.max(NEGATIVE_HEIGHT.min, height)));

const negativeHeight = ref(clampHeight(parseInt(storage.getItem(NEGATIVE_HEIGHT_KEY)) || NEGATIVE_HEIGHT.default));
const resizing = ref(false);

watch(resizing, active => {
  if (!active)
    storage.setItem(NEGATIVE_HEIGHT_KEY, String(negativeHeight.value));
});

// Dragging the grip up enlarges the negative prompt at the expense of the prompt
function onGripPointerDown(e) {
  e.preventDefault();

  const startY = e.clientY;
  const startHeight = negativeHeight.value;

  const onMove = moveEvent => negativeHeight.value = clampHeight(startHeight + startY - moveEvent.clientY);
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    resizing.value = false;
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  resizing.value = true;
}

function onGripKeydown(e) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown")
    return;

  e.preventDefault();
  negativeHeight.value = clampHeight(negativeHeight.value + (e.key === "ArrowUp" ? 1 : -1) * NEGATIVE_HEIGHT.keyStep);
  storage.setItem(NEGATIVE_HEIGHT_KEY, String(negativeHeight.value));
}
</script>

<template>
  <ImageOverlay v-if="showImageOverlay" :image="overlayImage" @hide-overlay="showImageOverlay = false"/>

  <div class="view-container generate">
    <div class="toolbar">
      <div class="toolbar-group">
        <button class="btn swap" :class="generating ? 'stop' : 'primary'" :disabled="!generating && !connected"
                @click="generating ? onInterrupt() : onGenerate()">
          <span :class="{off: generating}"><AppIcon name="play" :size="13"/>Generate</span>
          <span :class="{off: !generating}"><AppIcon name="stop" :size="13"/>Stop</span>
        </button>
        <button class="btn outline" :disabled="!generating" title="Skip the image being generated"
                @click="webUI.skipGeneration()"><AppIcon name="skip" :size="13"/>Skip</button>
        <label class="toolbar-group-label">×<NumberStepper v-model="generateImagesNumber" label="Images to generate"/></label>
        <button class="btn preset-count" :class="{on: generateImagesNumber === config.generatePresetImages}"
                :disabled="generating" :title="`Generate ${config.generatePresetImages} images (set in the settings)`"
                @click="generateImagesNumber = config.generatePresetImages">{{ config.generatePresetImages }}</button>
        <button class="ib" :class="{on: generateForever}" :aria-pressed="generateForever" :disabled="generating"
                :title="generateForever ? 'Generating forever: click to restore the number of images' : 'Generate forever (until stopped)'"
                aria-label="Generate forever" @click="toggleGenerateForever"><AppIcon name="infinity" :size="14"/></button>
      </div>
      <button v-if="has('variations')" class="btn outline" :disabled="generating || !connected"
              title="Generate variations of the current seed in the Generated tab; the variation seed and strength are set for the batch and cleared afterwards automatically"
              @click="onGenerateVariations"><AppIcon name="shuffle" :size="14"/>Variations…</button>

      <ProgressIndicator v-if="generating" :value="progress.value" :label="progress.label"
                         :completed="progress.completed || 0" :total="progress.total || 0"/>

      <div class="toolbar-spacer"></div>

      <span v-if="!connected" class="chip">Waiting for {{ HOST_NAME }}…</span>
      <button v-if="has('promptLock')" class="btn outline lock-button" :class="{on: sdWebUI.promptsLocked}" :aria-pressed="sdWebUI.promptsLocked"
              :disabled="!connected"
              :title="sdWebUI.promptsLocked ? 'Allow editing the prompts in WebUI' : 'Cover the prompts in WebUI, so that they are edited only here'"
              @click="toggleLock"
        ><AppIcon :name="sdWebUI.promptsLocked ? 'lock' : 'unlock'" :size="14"/>{{ sdWebUI.promptsLocked ? "WebUI prompts locked" : "Lock WebUI prompts" }}</button>
      <span v-if="has('modeSwitch')" class="toolbar-divider"></span>
      <div v-if="has('modeSwitch')" class="seg modes" role="radiogroup" aria-label="Generation mode">
        <button v-for="item in MODES" :key="item.value" type="button" role="radio" :class="{on: mode === item.value}"
                :aria-checked="mode === item.value" :disabled="!connected || generating" :title="item.title"
                @click="onModeSelect(item.value)">{{ item.label }}</button>
      </div>
    </div>

    <fieldset class="generate-grid" :disabled="!connected">
      <!-- Model row -->
      <div class="model-row">
        <UiPresetSelect v-if="has('uiPreset') && form.uiPreset !== null && form.uiPreset !== undefined"
                        :model-value="form.uiPreset" :presets="config.generateUiPresets"
                        :choices="sdWebUI.options.uiPresets"
                        @update:model-value="v => setParam('uiPreset', v)"/>
        <div v-if="has('checkpoint')" class="select-wrap checkpoint">
          <select :value="checkpointValue" aria-label="Checkpoint" :title="checkpointValue"
                  @change="e => setParam('checkpoint', e.target.value)">
            <option v-for="title in withCurrent(checkpointChoices, checkpointValue)" :key="title" :value="title">{{ title }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </div>
        <span v-else class="checkpoint"></span>
        <button v-if="has('checkpoint')" class="ib" :class="{busy: modelInfoBusy}" :disabled="!form.checkpoint || modelInfoBusy"
                title="Open the checkpoint page on Civitai" aria-label="Civitai model info" @click="onModelInfo"
          ><span v-if="modelInfoBusy" class="spinner"></span><AppIcon v-else name="info" :size="14"/></button>
        <template v-if="has('size')">
          <SizeSelect v-if="isTxt2Img" class="size" :width="form.width" :height="form.height"
                      @change="(width, height) => setParams({width, height})"/>
          <ResizeToInput v-else class="size" :width="form.width" :height="form.height"
                         @change="(width, height) => setParams({width, height})"/>
        </template>
        <label v-if="has('steps')" class="inline-field">Steps
          <NumberStepper :model-value="form.steps ?? ''" :min="1" :max="150" label="Sampling steps"
                         @update:model-value="v => setParam('steps', v)"/>
        </label>
      </div>

      <div class="lora-header">
        <div v-if="references" class="side-tabs" role="tablist">
          <button type="button" role="tab" class="side-tab label-small" :class="{on: shownSideTab === 'lora'}"
                  :aria-selected="shownSideTab === 'lora'" @click="sideTab = 'lora'">LoRA
            <span v-if="selectedLoras.size" class="count" title="LoRAs in the prompt">{{ selectedLoras.size }}</span></button>
          <button type="button" role="tab" class="side-tab label-small" :class="{on: shownSideTab === 'references'}"
                  :aria-selected="shownSideTab === 'references'" @click="sideTab = 'references'">References
            <span v-if="references.images.length" class="count" title="Reference images">{{ references.images.length }}</span></button>
        </div>
        <template v-else>
          <span class="label-small">LoRA</span>
          <span v-if="selectedLoras.size" class="count" title="LoRAs in the prompt">{{ selectedLoras.size }}</span>
        </template>
        <input v-if="shownSideTab === 'lora'" v-model="loraFilter" class="filter" type="search" placeholder="Filter…"
               aria-label="Filter LoRAs">
        <template v-else>
          <span class="spacer"></span>
          <button v-if="references.edit !== null" type="button" class="edit-switch" role="switch"
                  :aria-checked="references.edit" title="Edit with the references (the WebUI setting of the current model)"
                  @click="setReferenceParam('edit', 'edit', !references.edit)"><i></i>Edit</button>
        </template>
      </div>

      <!-- Prompt and LoRAs -->
      <PromptField class="prompt" label="Prompt" :tokens="has('tokens') ? sdWebUI.tokens?.prompt : null"
                   :model-value="form.prompt ?? ''" @update:model-value="v => setParam('prompt', v)"/>

      <ReferencesPanel v-if="shownSideTab === 'references'" class="side-panel" :references="references"
                       :photoshop-target="photoshopTarget" :has="has"
                       @add="files => webUI.editReferences({add: files})"
                       @remove="index => webUI.editReferences({remove: index})"
                       @clear="webUI.editReferences({clear: true})"
                       @enabled="value => setReferenceParam('enabled', 'referencesEnabled', value)"
                       @max-size="value => setReferenceParam('maxSize', 'referenceMaxSize', value)"
                       @photoshop-target="setPhotoshopTarget"/>

      <div v-else class="lora-tree side-panel">
        <CheckTree v-if="loraItems.length" :items="loraItems" :selected="selectedLoras"
                   storage-key="imageBench_generateLoraCollapsed"
                   @toggle="(name, checked) => onLoraToggle([name], checked)"
                   @toggle-many="onLoraToggle"
                   @focus="name => onLoraToggle([name], !selectedLoras.has(name))"/>
        <div v-else class="empty">{{ loras.length ? "No matching LoRAs" : "No LoRAs" }}</div>
      </div>

      <!-- Negative prompt and parameters -->
      <div class="lower">
        <template v-if="has('negativePrompt')">
          <div class="grip" :class="{active: resizing}" role="separator" aria-orientation="horizontal"
               aria-label="Resize the negative prompt" :aria-valuenow="negativeHeight"
               :aria-valuemin="NEGATIVE_HEIGHT.min" :aria-valuemax="NEGATIVE_HEIGHT.max" tabindex="0"
               title="Drag to resize the negative prompt"
               @pointerdown="onGripPointerDown" @keydown="onGripKeydown"><i></i></div>

          <PromptField class="negative" label="Negative prompt" :tokens="has('tokens') ? sdWebUI.tokens?.negativePrompt : null"
                       :style="{height: `${negativeHeight + 20}px`}"
                       :model-value="form.negativePrompt ?? ''" @update:model-value="v => setParam('negativePrompt', v)"/>
        </template>

        <div class="groups">
          <SamplingGroup :form="form" :samplers="samplerChoices" :schedulers="schedulerChoices"
                         :slider-kind="sdWebUI.sliderKind" :has="has" @set="setParam"/>
          <SeedGroup :form="form" :has="has" @set="setParam" @reuse="onReuseSeed"/>
          <HiresGroup v-if="isTxt2Img && has('hires')" :form="form" :upscalers="sdWebUI.options.upscalers ?? []"
                      :has="has" @set="setParam"/>
          <Img2ImgGroup v-else-if="!isTxt2Img" :form="form" :options="sdWebUI.options" :has="has"
                        :title="mode === 'inpaint' ? 'Inpaint' : 'img2img'" :inpaint-params="hasInpaintParams"
                        @set="setParam"/>
        </div>
      </div>

      <!-- Latest image or live preview; the input images in img2img and inpaint -->
      <GenerateImageCell :mode="mode" :result-url="shownImageUrl"
                         :live-progress="livePreview ? sdWebUI.live.progress : null"
                         :result-clickable="!!latestImage && !livePreview"
                         :input-image="inputs.image" :input-mask="inputs.mask"
                         @result-click="onResultClick" @upload="onInputUpload"
                         @use-size="(width, height) => setParams({width, height})"/>
    </fieldset>
  </div>
</template>

<style scoped>
.generate-grid {
  flex: 1;
  min-height: 0;
  min-width: 0;
  margin: 0;
  padding: 10px 12px 12px;
  border: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(260px, 30vw, 360px);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px 14px;
}

/* ---------- Model row ---------- */

.model-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.checkpoint {
  flex: 1 1 160px;
}

.size {
  flex: 0 1 190px;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ib-text-2);
  font-size: 12px;
}

.ib.busy:disabled {
  opacity: 1;
}

/* ---------- LoRAs ---------- */

.lora-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.side-tabs {
  display: flex;
  gap: 12px;
}

.side-tab {
  height: 26px;
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  cursor: pointer;
}

.side-tab:hover {
  color: var(--ib-text-2);
}

.side-tab.on {
  border-bottom-color: var(--ib-accent);
  color: var(--ib-text);
}

.spacer {
  flex: 1;
}

.edit-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.edit-switch i {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--ib-elev-2);
  transition: background 0.15s;
}

.edit-switch i::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: var(--ib-text-2);
  transition: left 0.15s;
}

.edit-switch[aria-checked="true"] i {
  background: var(--ib-accent);
}

.edit-switch[aria-checked="true"] i::after {
  left: 14px;
  background: var(--ib-accent-ink);
}

.filter {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font: inherit;
}

.filter:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}

/* Aligned with the prompt textarea, below its label */
.side-panel {
  margin-top: 20px;
}

.lora-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 4px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.empty {
  margin: auto;
  color: var(--ib-muted);
  font-size: 12px;
}

/* ---------- Negative prompt and parameters ---------- */

.lower {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.grip {
  height: 12px;
  margin: -8px 0 -10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: row-resize;
  touch-action: none;
}

.grip i {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--ib-border-2);
}

.grip:hover i,
.grip:focus-visible i,
.grip.active i {
  background: var(--ib-accent);
}

.grip:focus-visible {
  outline: none;
  background: var(--ib-accent-soft);
}

.groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.inline-field :deep(.stepper) {
  height: 26px;
}

.inline-field :deep(.stepper input) {
  height: 24px;
}

.preset-count {
  min-width: 26px;
  padding: 0 6px;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.preset-count.on {
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--ib-border);
}

.modes {
  flex: none;
}

.modes button {
  padding: 0 10px;
}

.lock-button.on {
  background: var(--ib-accent-soft);
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}
</style>
