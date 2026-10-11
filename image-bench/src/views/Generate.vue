<script setup>
/**
 * Generate tab (SD WebUI): the main txt2img controls, mirrored both ways with WebUI, so that the whole
 * edit-generate-review cycle can happen in the popup. The host page polls the controls while the tab is shown
 * (WEBUI_PARAMS) and applies the edits made here (SET_WEBUI_PARAMS).
 * One image is generated in place with a live preview; more images are a batch shown in the Generated tab.
 */
import {computed, onActivated, onBeforeMount, onDeactivated, reactive, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import CheckTree from "@/components/CheckTree.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";
import PromptField from "@/components/PromptField.vue";
import SeedInput from "@/components/SeedInput.vue";
import SizeSelect from "@/components/SizeSelect.vue";
import UiPresetSelect from "@/components/UiPresetSelect.vue";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {createImageLink} from "@/sdwebui.js";
import {fetchModelInfo} from "@/civitai.js";
import {dialog} from "@/dialogs/useDialog.js";
import {addLoraToPrompt, hasLoraTag, removeLoraFromPrompt} from "@/loras.js";

// A value edited here is not overwritten by the polled WebUI value for this long,
// which covers the send delay and the next poll
const EDIT_HOLD = 2000;
const SEND_DELAY = 250;

const NEGATIVE_HEIGHT_KEY = "imageBench_generateNegativeHeight";
const NEGATIVE_HEIGHT = {min: 40, max: 320, default: 62, keyStep: 20};

const sdWebUI = useSDWebUIStateStore();
const generatedImagesStore = useGeneratedImagesStore();
const config = useAppConfigStore();
const webUI = useWebUIBridge();
const storage = useLocalStorage();

// ---------- Mirrored parameters ----------

// The WebUI parameters as edited here: prompt, negativePrompt, width, height, steps, cfg, shift, seed, subseed,
// subseedStrength, sampler, scheduler, hiresUpscaler, hiresScale, hiresSteps, denoising, uiPreset, checkpoint
const form = reactive({});
const editedAt = {};
let pending = {};
let sendTimeout = null;

const connected = computed(() => !!sdWebUI.params);

watch(() => sdWebUI.params, params => {
  const now = Date.now();

  for (const [name, value] of Object.entries(params || {}))
    if (!(name in pending) && now - (editedAt[name] || 0) > EDIT_HOLD)
      form[name] = value;
}, {immediate: true});

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

// WebUI may report the checkpoint with or without its hash
const checkpointValue = computed(() => {
  const value = form.checkpoint;

  if (!value)
    return "";

  return checkpoints.value.find(title => title === value)
    ?? checkpoints.value.find(title => stripHash(title) === stripHash(value))
    ?? value;
});

// The current value is offered even if the list does not contain it
function withCurrent(list, value) {
  return value && !list.includes(value) ? [value, ...list] : list;
}

const shiftLabel = computed(() => sdWebUI.sliderKind === "distilledCfg" ? "Distilled CFG" : "Shift");

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
    webUI.batchGenerate(nImages, {txt2img: true});
  }
  else {
    singleInProgress.value = true;
    webUI.generateImage();
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
  webUI.generateVariations(strength, nImages, {txt2img: true});
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

function onImageClick() {
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
      <button class="btn outline" :disabled="generating || !connected"
              title="Generate variations of the current seed in the Generated tab; the variation seed and strength are set for the batch and cleared afterwards automatically"
              @click="onGenerateVariations"><AppIcon name="shuffle" :size="14"/>Variations…</button>

      <ProgressIndicator v-if="generating" :value="progress.value" :label="progress.label"
                         :completed="progress.completed || 0" :total="progress.total || 0"/>

      <div class="toolbar-spacer"></div>

      <span v-if="!connected" class="chip">Waiting for WebUI…</span>
      <button class="btn outline lock-button" :class="{on: sdWebUI.promptsLocked}" :aria-pressed="sdWebUI.promptsLocked"
              :disabled="!connected"
              :title="sdWebUI.promptsLocked ? 'Allow editing the prompts in WebUI' : 'Cover the prompts in WebUI, so that they are edited only here'"
              @click="toggleLock"
        ><AppIcon :name="sdWebUI.promptsLocked ? 'lock' : 'unlock'" :size="14"/>{{ sdWebUI.promptsLocked ? "WebUI prompts locked" : "Lock WebUI prompts" }}</button>
    </div>

    <fieldset class="generate-grid" :disabled="!connected">
      <!-- Model row -->
      <div class="model-row">
        <UiPresetSelect v-if="form.uiPreset !== null && form.uiPreset !== undefined"
                        :model-value="form.uiPreset" :presets="config.generateUiPresets"
                        :choices="sdWebUI.options.uiPresets"
                        @update:model-value="v => setParam('uiPreset', v)"/>
        <div class="select-wrap checkpoint">
          <select :value="checkpointValue" aria-label="Checkpoint" :title="checkpointValue"
                  @change="e => setParam('checkpoint', e.target.value)">
            <option v-for="title in withCurrent(checkpoints, checkpointValue)" :key="title" :value="title">{{ title }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </div>
        <button class="ib" :class="{busy: modelInfoBusy}" :disabled="!form.checkpoint || modelInfoBusy"
                title="Open the checkpoint page on Civitai" aria-label="Civitai model info" @click="onModelInfo"
          ><span v-if="modelInfoBusy" class="spinner"></span><AppIcon v-else name="info" :size="14"/></button>
        <SizeSelect class="size" :width="form.width" :height="form.height"
                    @change="(width, height) => setParams({width, height})"/>
        <label class="inline-field">Steps
          <NumberStepper :model-value="form.steps ?? ''" :min="1" :max="150" label="Sampling steps"
                         @update:model-value="v => setParam('steps', v)"/>
        </label>
      </div>

      <div class="lora-header">
        <span class="label-small">LoRA</span>
        <span v-if="selectedLoras.size" class="count" title="LoRAs in the prompt">{{ selectedLoras.size }}</span>
        <input v-model="loraFilter" class="filter" type="search" placeholder="Filter…" aria-label="Filter LoRAs">
      </div>

      <!-- Prompt and LoRAs -->
      <PromptField class="prompt" label="Prompt" :tokens="sdWebUI.tokens.prompt"
                   :model-value="form.prompt ?? ''" @update:model-value="v => setParam('prompt', v)"/>

      <div class="lora-tree">
        <CheckTree v-if="loraItems.length" :items="loraItems" :selected="selectedLoras"
                   storage-key="imageBench_generateLoraCollapsed"
                   @toggle="(name, checked) => onLoraToggle([name], checked)"
                   @toggle-many="onLoraToggle"
                   @focus="name => onLoraToggle([name], !selectedLoras.has(name))"/>
        <div v-else class="empty">{{ loras.length ? "No matching LoRAs" : "No LoRAs" }}</div>
      </div>

      <!-- Negative prompt and parameters -->
      <div class="lower">
        <div class="grip" :class="{active: resizing}" role="separator" aria-orientation="horizontal"
             aria-label="Resize the negative prompt" :aria-valuenow="negativeHeight"
             :aria-valuemin="NEGATIVE_HEIGHT.min" :aria-valuemax="NEGATIVE_HEIGHT.max" tabindex="0"
             title="Drag to resize the negative prompt"
             @pointerdown="onGripPointerDown" @keydown="onGripKeydown"><i></i></div>

        <PromptField class="negative" label="Negative prompt" :tokens="sdWebUI.tokens.negativePrompt"
                     :style="{height: `${negativeHeight + 20}px`}"
                     :model-value="form.negativePrompt ?? ''" @update:model-value="v => setParam('negativePrompt', v)"/>

        <div class="groups">
          <div class="group">
            <div class="group-header label-small">Sampling</div>
            <label class="field">Sampling method
              <span class="select-wrap">
                <select :value="form.sampler" @change="e => setParam('sampler', e.target.value)">
                  <option v-for="name in withCurrent(samplers, form.sampler)" :key="name" :value="name">{{ name }}</option>
                </select>
                <AppIcon name="chevron" :size="14"/>
              </span>
            </label>
            <label class="field">Schedule type
              <span class="select-wrap">
                <select :value="form.scheduler" @change="e => setParam('scheduler', e.target.value)">
                  <option v-for="name in withCurrent(schedulers, form.scheduler)" :key="name" :value="name">{{ name }}</option>
                </select>
                <AppIcon name="chevron" :size="14"/>
              </span>
            </label>
            <div class="pair">
              <label class="field">CFG scale
                <NumberStepper :model-value="form.cfg ?? ''" :min="1" :max="30" :step="0.5" label="CFG scale"
                               @update:model-value="v => setParam('cfg', v)"/>
              </label>
              <label class="field" :class="{off: !sdWebUI.sliderKind}"
                     :title="sdWebUI.sliderKind ? '' : 'Not used by the current UI preset'">{{ shiftLabel }}
                <NumberStepper :model-value="form.shift ?? ''" :min="0" :max="30" :step="0.1" :label="shiftLabel"
                               @update:model-value="v => setParam('shift', v)"/>
              </label>
            </div>
          </div>

          <div class="group">
            <div class="group-header label-small">Seed</div>
            <label class="field">Seed
              <SeedInput :model-value="form.seed ?? -1" label="Seed"
                         @update:model-value="v => setParam('seed', v)" @reuse="onReuseSeed('seed')"/>
            </label>
            <label class="field">Variation seed
              <SeedInput :model-value="form.subseed ?? -1" label="Variation seed"
                         @update:model-value="v => setParam('subseed', v)" @reuse="onReuseSeed('subseed')"/>
            </label>
            <label class="field">Variation strength
              <NumberStepper :model-value="form.subseedStrength ?? ''" :min="0" :max="1" :step="0.01"
                             label="Variation strength" @update:model-value="v => setParam('subseedStrength', v)"/>
            </label>
          </div>

          <div class="group">
            <div class="group-header label-small">Hires. fix</div>
            <label class="field">Upscaler
              <span class="select-wrap">
                <select :value="form.hiresUpscaler" @change="e => setParam('hiresUpscaler', e.target.value)">
                  <option v-for="name in withCurrent(sdWebUI.options.upscalers, form.hiresUpscaler)" :key="name"
                          :value="name">{{ name }}</option>
                </select>
                <AppIcon name="chevron" :size="14"/>
              </span>
            </label>
            <div class="pair">
              <label class="field">Upscale by
                <NumberStepper :model-value="form.hiresScale ?? ''" :min="1" :max="4" :step="0.05" label="Upscale by"
                               @update:model-value="v => setParam('hiresScale', v)"/>
              </label>
              <label class="field">Steps
                <NumberStepper :model-value="form.hiresSteps ?? ''" :min="0" :max="150" label="Hires steps"
                               @update:model-value="v => setParam('hiresSteps', v)"/>
              </label>
            </div>
            <label class="field">Denoising strength
              <NumberStepper :model-value="form.denoising ?? ''" :min="0" :max="1" :step="0.01"
                             label="Denoising strength" @update:model-value="v => setParam('denoising', v)"/>
            </label>
          </div>
        </div>
      </div>

      <!-- Latest image or live preview -->
      <button type="button" class="image" :class="{clickable: latestImage && !livePreview}"
              :title="livePreview ? 'Live preview' : latestImage ? 'Click to view' : ''" @click="onImageClick">
        <img v-if="shownImageUrl" :src="shownImageUrl" alt="">
        <span v-else class="empty">The generated image appears here</span>
        <span v-if="livePreview" class="live-progress"><i :style="{width: `${sdWebUI.live.progress}%`}"></i></span>
      </button>
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
.lora-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 20px;
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

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.group-header {
  padding-bottom: 5px;
  border-bottom: 1px solid var(--ib-border);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--ib-text-2);
  font-size: 11px;
  white-space: nowrap;
}

.field.off {
  opacity: 0.45;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.field :deep(.stepper),
.inline-field :deep(.stepper) {
  height: 26px;
}

.field :deep(.stepper) {
  display: flex;
  width: 100%;
}

.field :deep(.stepper input) {
  flex: 1;
  width: auto;
  min-width: 0;
  height: 24px;
}

.inline-field :deep(.stepper input) {
  height: 24px;
}

.field .select-wrap {
  flex: none;
}

/* ---------- Image ---------- */

.image {
  position: relative;
  min-height: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--ib-border);
  border-radius: 8px;
  background: var(--ib-surface);
  color: inherit;
  font: inherit;
  cursor: default;
}

.image.clickable {
  cursor: zoom-in;
}

/* Out of the flow, so that the image does not size the grid row */
.image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.live-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--ib-elev-2);
}

.live-progress i {
  display: block;
  height: 100%;
  background: var(--ib-accent);
  transition: width 0.3s;
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

.lock-button.on {
  background: var(--ib-accent-soft);
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}
</style>
