<script setup>
/**
 * Generate tab: the main controls of txt2img, img2img or Inpaint upload, mirrored both ways with the host,
 * so that the whole edit-generate-review cycle can happen in the popup. The host page polls the controls of the
 * shown mode while the tab is shown (WEBUI_PARAMS) and applies the edits made here (SET_WEBUI_PARAMS).
 * In WebUI, switching the mode switches the WebUI tab; the parameters of each mode are remembered here and reapplied,
 * since img2img and Inpaint share the WebUI img2img controls. In ComfyUI the mode follows the image markers
 * of the workflow, and the host page reports which parameters it found (features, see src/host.js).
 * One image is generated in place with a live preview; more images are a batch shown in the Generated tab
 * and, while it runs, in the session filmstrip, which takes the place of the parameter groups.
 */
import {computed, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import CheckTree from "@/components/CheckTree.vue";
import GenerateImageCell from "@/components/GenerateImageCell.vue";
import ImageOverlay from "@/components/ImageOverlay.vue";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";
import PromptField from "@/components/PromptField.vue";
import ReferencesPanel from "@/components/ReferencesPanel.vue";
import ModulesSelect from "@/components/ModulesSelect.vue";
import ResizeToInput from "@/components/ResizeToInput.vue";
import SizeSelect from "@/components/SizeSelect.vue";
import UiPresetSelect from "@/components/UiPresetSelect.vue";
import SamplingGroup from "@/components/generate/SamplingGroup.vue";
import SeedGroup from "@/components/generate/SeedGroup.vue";
import HiresGroup from "@/components/generate/HiresGroup.vue";
import Img2ImgGroup from "@/components/generate/Img2ImgGroup.vue";
import ControlNetGroup from "@/components/generate/ControlNetGroup.vue";
import GroupTabs from "@/components/generate/GroupTabs.vue";
import SessionStrip from "@/components/generate/SessionStrip.vue";
import PngInfoDialog from "@/components/generate/PngInfoDialog.vue";
import WorkflowSelect from "@/components/generate/WorkflowSelect.vue";
import SnippetsPanel from "@/components/generate/SnippetsPanel.vue";
import PromptHistoryBar from "@/components/generate/PromptHistoryBar.vue";
import PromptVariantsSelect from "@/components/generate/PromptVariantsSelect.vue";
import PromptDiff from "@/components/generate/PromptDiff.vue";
import {consoleOpen, toggleConsole} from "@/consoleDrawer.js";
import {withCurrent} from "@/components/generate/choices.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useSessionImagesStore} from "@/stores/session.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useGenerationSettingsStore} from "@/stores/generationSettings.js";
import {formatHistoryTime, usePromptHistoryStore} from "@/stores/promptHistory.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useDragSize} from "@/composables/useDragSize.js";
import {useFeatures} from "@/composables/useFeatures.js";
import {useControlNetUnit} from "@/composables/useControlNetUnit.js";
import {useControlNetStore} from "@/stores/controlnet.js";
import {HOST_NAME, isComfy} from "@/host.js";
import {createImageLink, ensureGenerationIdle, isGenerationActive} from "@/sdwebui.js";
import {useCtrlKey} from "@/composables/useCtrlKey.js";
import {fetchModelInfo} from "@/civitai.js";
import {fetchModules, modulesSummary} from "@/modules.js";
import {dialog} from "@/dialogs/useDialog.js";
import {requestHost} from "@/hostRequest.js";
import {onHostReady} from "@/hostWindow.js";
import {toast} from "@/toast.js";
import {addLoraToPrompt, hasLoraTag, removeLoraFromPrompt} from "@/loras.js";
import {imageFilesFromDataTransfer} from "@/imageFiles.js";
import {isStill, mediaKind, previewUrl} from "@/media.js";
import {appendToPrompt, insertIntoTextarea, useSnippetsStore} from "@/stores/snippets.js";
import {useRouter} from "vue-router";

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
const GLOBAL_PARAMS = ["uiPreset", "checkpoint", "modules"];

const NEGATIVE_HEIGHT_KEY = "imageBench_generateNegativeHeight";
const SIDE_TAB_KEY = "imageBench_generateSideTab";
const MODEL_SLOT_KEY = "imageBench_generateModelSlot";
const SIZE_INPUT_KEY = "imageBench_generateSizeInput";
// Named before the editor bridge (Photoshop only)
const EDITOR_TARGET_KEY = "imageBench_generatePhotoshopTarget";
const PARAMS_COLLAPSED_KEY = "imageBench_generateParamsCollapsed";
const SNIPPETS_OPEN_KEY = "imageBench_generateSnippetsOpen";
const SIDE_WIDTH_KEY = "imageBench_generateSideWidth";
const IMAGE_WIDTH_KEY = "imageBench_generateImageWidth";
const IMAGE_HEIGHT_KEY = "imageBench_generateImageHeight";
const LOWER_HEIGHT_KEY = "imageBench_generateLowerHeight";
// Hires. fix / img2img ("main") or ControlNet in the third parameter group
const GROUP_TAB_KEY = "imageBench_generateGroupTab";
const NEGATIVE_HEIGHT = {min: 40, max: 320, default: 62};
// Parameters or filmstrip: the parameter groups at their own height unless resized; the prompts keep the reserve
const LOWER_HEIGHT = {min: 80, default: 150, promptReserve: 260};

// From this grid width on, the image has a column of its own beside the LoRA column
const WIDE_LAYOUT_WIDTH = 1500;
// Left to the prompts and the model row when the side columns are enlarged
const MAIN_MIN_WIDTH = 560;
const GRID_GAP = 14;
// Default: 30% of the grid width up to the maximum; wide: the width of the LoRA column
const SIDE_WIDTH = {min: 220, default: 360, defaultShare: 0.3, wide: 300};
// Wide: the image column fits the image at full height, up to a share of the grid width unless resized
const IMAGE_WIDTH = {min: 240, autoShare: 0.4};
// Below the LoRA list: the image fits the column width; the list keeps the rest
const IMAGE_HEIGHT = {min: 120, sideReserve: 200};

const sdWebUI = useSDWebUIStateStore();
const generatedImagesStore = useGeneratedImagesStore();
const sessionImagesStore = useSessionImagesStore();
const config = useAppConfigStore();
const generationSettings = useGenerationSettingsStore();
const webUI = useWebUIBridge();
const storage = useLocalStorage();
const has = useFeatures("generate", () => sdWebUI.features);

// ---------- Mirrored parameters ----------

// The WebUI parameters as edited here: prompt, negativePrompt, width, height, steps, cfg, shift, seed, subseed,
// subseedStrength, sampler, scheduler, denoising, uiPreset, checkpoint, modules (VAE / Text Encoder file names,
// null without the Forge Neo dropdown); txt2img: hiresFix (the checkbox; null without the ComfyUI ib:hr switch),
// hiresUpscaler, hiresScale, hiresSteps (denoising is that of hires. fix); img2img and inpaint: resizeMode,
// maskMode, inpaintArea, maskedContent.
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

  if ("prompt" in values || "negativePrompt" in values)
    shown.value = null;

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

// A UI preset chosen here counts as switching until WebUI reports it applied (or the time runs out),
// since the first report may come before WebUI starts the switch
const UI_PRESET_REQUEST_TIMEOUT = 30000;
const requestedUiPreset = ref(null);
let uiPresetRequestTimeout = null;
const switchingUiPreset = computed(() => sdWebUI.switchingUiPreset || requestedUiPreset.value !== null);

function selectUiPreset(value) {
  if (value !== sdWebUI.params?.uiPreset) {
    requestedUiPreset.value = value;
    clearTimeout(uiPresetRequestTimeout);
    uiPresetRequestTimeout = setTimeout(() => requestedUiPreset.value = null, UI_PRESET_REQUEST_TIMEOUT);
  }

  setParam("uiPreset", value);
}

watch(() => [sdWebUI.params?.uiPreset, sdWebUI.switchingUiPreset], ([preset, switching]) => {
  if (!switching && preset === requestedUiPreset.value) {
    requestedUiPreset.value = null;
    clearTimeout(uiPresetRequestTimeout);
  }
});

function flushParams() {
  clearTimeout(sendTimeout);

  if (Object.keys(pending).length)
    webUI.setWebUIParams(pending);

  pending = {};
}

let activated = false;

onActivated(() => {
  activated = true;
  webUI.subscribeMirror(true);
});

// A host page loaded again in the iframe of the embedded mode knows nothing of the popup
onHostReady(() => {
  webUI.setEditorTarget(editorTarget.value);

  if (activated)
    webUI.subscribeMirror(true);
});

// ---------- Workflows (ComfyUI) ----------

// The workflow files may change outside of the sidebar
onActivated(() => {
  if (has("workflowSelect"))
    webUI.syncWorkflows();
});

const savingWorkflow = ref(false);
const workflowSaved = computed(() => sdWebUI.workflows.some(item => item.path === sdWebUI.workflow?.path));

// ComfyUI would ask the name of an unsaved workflow in its own window, which the popup hides: it is asked here
async function saveWorkflow() {
  let name = null;

  if (!workflowSaved.value) {
    name = await dialog.prompt("Name of the workflow (folders separated by /):",
      {title: "Save the workflow", defaultValue: sdWebUI.workflow?.name || ""});

    if (!name)
      return;
  }

  savingWorkflow.value = true;

  try {
    const {path} = await requestHost({type: "SAVE_WORKFLOW", name});
    toast(`Workflow saved: ${path.replace(/^workflows\//, "").replace(/\.json$/i, "")}`);
  } catch (error) {
    await dialog.alert(error.message, {title: "Save the workflow"});
  } finally {
    savingWorkflow.value = false;
  }
}


onDeactivated(() => {
  activated = false;
  flushParams();
  webUI.subscribeMirror(false);
});

// ---------- Choices ----------

const checkpoints = ref([]);
const modules = ref([]);
const samplers = ref([]);
const schedulers = ref([]);

const stripHash = title => title.replace(/ \[[^\]]+\]$/, "");

// The host page may send the choices of the workflow widgets (ComfyUI), which replace those of the backend
const checkpointChoices = computed(() => sdWebUI.options.checkpoints ?? checkpoints.value);
const samplerChoices = computed(() => sdWebUI.options.samplers ?? samplers.value);
const schedulerChoices = computed(() => sdWebUI.options.schedulers ?? schedulers.value);

// The VAE / Text Encoder dropdown takes the place of the checkpoint dropdown, switched by the button before them
const modelSlot = ref(storage.getItem(MODEL_SLOT_KEY) === "modules" ? "modules" : "checkpoint");
const hasModules = computed(() => has("modules") && Array.isArray(form.modules));
const shownModelSlot = computed(() => hasModules.value ? modelSlot.value : "checkpoint");

watch(modelSlot, slot => storage.setItem(MODEL_SLOT_KEY, slot));

// The size is a preset dropdown or width and height inputs, switched by the button before them and kept per mode;
// Inpaint shows the inputs by default
const sizeInputModes = ref(readSizeInputModes());
const sizeInputs = computed(() => sizeInputModes.value[mode.value] ?? mode.value === "inpaint");

function readSizeInputModes() {
  try {
    const value = JSON.parse(storage.getItem(SIZE_INPUT_KEY));
    return value && typeof value === "object" ? value : {};
  }
  catch {
    return {};
  }
}

function toggleSizeInputs() {
  sizeInputModes.value = {...sizeInputModes.value, [mode.value]: !sizeInputs.value};
  storage.setItem(SIZE_INPUT_KEY, JSON.stringify(sizeInputModes.value));
}

const checkpointTitle = computed(() => hasModules.value
  ? `${checkpointValue.value}
VAE / Text Encoder: ${modulesSummary(form.modules) || "built-in"}`
  : checkpointValue.value);

// WebUI may report the checkpoint with or without its hash
const checkpointValue = computed(() => {
  const value = form.checkpoint;

  if (!value)
    return "";

  return checkpointChoices.value.find(title => title === value)
    ?? checkpointChoices.value.find(title => stripHash(title) === stripHash(value))
    ?? value;
});

async function loadModules(reload = false) {
  if (has("modules"))
    modules.value = await fetchModules(reload);
}

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
  await Promise.all([loadChoices(), loadLoras(), loadModules()]);
});

const refreshing = ref(false);

// Rescan the checkpoints and LoRAs in the host (its own lists are refreshed by the host page), then list them again
async function refreshModels() {
  refreshing.value = true;

  try {
    webUI.refreshModels();
    await fetch("/image-bench/refresh_models", {method: "post"});
    await Promise.all([loadChoices(), loadLoras(), loadModules(true)]);
  }
  finally {
    refreshing.value = false;
  }
}

// ---------- Prompt history ----------

const promptHistory = usePromptHistoryStore();
// The prompts shown (read-only) instead of the current ones, {variant, index} of a history entry or a prompt variant,
// null for the current prompts
const shown = ref(null);
const historyIndex = computed(() => shown.value && !shown.value.variant ? shown.value.index : null);
const variantIndex = computed(() => shown.value?.variant ? shown.value.index : null);
const historyEntry = computed(() => !shown.value ? null
  : (shown.value.variant ? promptHistory.variants : promptHistory.entries)[shown.value.index] ?? null);
// The entry shown as it is instead of compared with the current prompts
const historyPlain = ref(false);

watch(() => promptHistory.entries, () => shown.value = null);
watch(() => promptHistory.variants, variants => {
  if (variantIndex.value !== null && variantIndex.value >= variants.length)
    shown.value = null;
});

// Clicked again, an entry gives way to the current prompts
function selectHistoryEntry(index) {
  shown.value = index === null || index === historyIndex.value ? null : {variant: false, index};
}

function selectVariant(index) {
  shown.value = index === null ? null : {variant: true, index};
}

function usePrompts(entry) {
  if (entry)
    setParams(has("negativePrompt") ? {prompt: entry.prompt, negativePrompt: entry.negativePrompt}
                                    : {prompt: entry.prompt});
}

// The history entry shown becomes a variant under a name
async function forkHistoryEntry() {
  const entry = historyEntry.value;
  const name = entry && await dialog.prompt("Name of the variant:", {title: "Fork a prompt variant", okText: "Fork"});

  if (name)
    promptHistory.fork(name.trim(), entry);
}

async function renameVariant(index) {
  const variant = promptHistory.variants[index];
  const name = variant && await dialog.prompt("Name of the variant:", {title: "Rename the prompt variant",
                                                                       defaultValue: variant.name, okText: "Rename"});

  if (name)
    promptHistory.renameVariant(index, name.trim());
}

async function removeVariant(index) {
  const variant = promptHistory.variants[index];

  if (!variant || !await dialog.confirm(`Remove the prompt variant "${variant.name}"?`,
                                        {title: "Prompt variants", okText: "Remove", danger: true}))
    return;

  if (variantIndex.value !== null && variantIndex.value >= index)
    shown.value = variantIndex.value === index ? null : {variant: true, index: variantIndex.value - 1};

  promptHistory.removeVariant(index);
}

// The current prompts are generated, whatever is shown
function recordPrompts() {
  shown.value = null;
  promptHistory.record(form.prompt, has("negativePrompt") ? form.negativePrompt : "");
}

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

async function onGenerate() {
  if (!await ensureGenerationIdle())
    return;

  flushParams();
  recordPrompts();

  const nImages = Number(generateImagesNumber.value);

  // More images are a batch: it starts with the separator in the Generated tab, which then is shown
  if (nImages === -1 || nImages > 1) {
    if (config.automaticallyClearGeneratedImages)
      generatedImagesStore.clear();

    batchForever = nImages === -1;
    generatedImagesStore.startingGeneration();
    selectedImage.value = null;
    autoShowStrip();
    webUI.batchGenerate(nImages, {mode: generationMode.value});
  }
  else {
    selectedImage.value = null;
    singleInProgress.value = true;
    webUI.generateImage(generationMode.value);
  }
}

/**
 * Variations of the current seed: a batch that sets the variation seed and strength
 * and restores them afterwards (the batch strategy does it)
 */
async function onGenerateVariations() {
  if (!await ensureGenerationIdle())
    return;

  const strength = await dialog.prompt("Variation strength:",
    {defaultValue: generationSettings.settings.variationStrength, storageKey: "variationStrength"});

  if (!strength)
    return;

  flushParams();
  recordPrompts();

  if (config.automaticallyClearGeneratedImages)
    generatedImagesStore.clear();

  const nImages = Number(generateImagesNumber.value);

  batchForever = nImages === -1;
  generatedImagesStore.startingGeneration();
  selectedImage.value = null;
  autoShowStrip();
  generationSettings.set("variationStrength", strength);
  webUI.generateVariations(strength, nImages, {mode: generationMode.value});
}

function onInterrupt() {
  webUI.stopGeneration();
}

// Ctrl+click or middle click on Stop: stop, then generate again once the host is idle
const ctrlDown = useCtrlKey();
const restarting = ref(false);

async function onRestart() {
  if (restarting.value)
    return;

  restarting.value = true;
  try {
    webUI.stopGeneration();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // There is no event of the stopped generation, so the busy state is polled
    for (let waited = 0; (generating.value || isGenerationActive()) && waited < 30000; waited += 100)
      await new Promise(resolve => setTimeout(resolve, 100));

    await onGenerate();
  }
  finally {
    restarting.value = false;
  }
}

// What the status slot of the toolbar shows, one at a time; null if nothing
const toolbarStatus = computed(() => {
  if (!connected.value)
    return {text: `Waiting for ${HOST_NAME}…`, waiting: true};
  if (restarting.value)
    return {text: "Restarting the generation…"};
  // The restore may switch the UI preset itself
  if (sdWebUI.restoringParams)
    return {text: "Restoring parameters…"};
  if (switchingUiPreset.value)
    return {text: "Switching UI preset…"};
  return null;
});

function onGenerateButton(e) {
  if (restarting.value)
    return;

  if (!generating.value)
    onGenerate();
  else if (e.ctrlKey)
    onRestart();
  else
    onInterrupt();
}

watch(() => sdWebUI.busy, (busy, wasBusy) => {
  if (wasBusy && !busy)
    singleInProgress.value = false;
});

watch(batchInProgress, (inProgress, wasInProgress) => {
  if (wasInProgress && !inProgress)
    autoHideStrip();
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

async function clearPrompts() {
  if ((form.prompt || has("negativePrompt") && form.negativePrompt)
      && !await dialog.confirm("Clear the prompts?", {okText: "Clear", danger: true}))
    return;

  setParams(has("negativePrompt") ? {prompt: "", negativePrompt: ""} : {prompt: ""});
}

// ---------- PNG Info ----------

const pngInfo = ref(null);

// Context of the parameter mapping (src/infotext.js)
const pngInfoContext = computed(() => ({
  has,
  mode: mode.value,
  sliderKind: sdWebUI.sliderKind,
  checkpoints: checkpointChoices.value,
  samplers: samplerChoices.value,
  schedulers: schedulerChoices.value,
  upscalers: sdWebUI.options.upscalers ?? [],
  modules: hasModules.value ? modules.value : null
}));

function openPngInfo(file = null) {
  pngInfo.value = {file};
}

/**
 * Apply the image parameters chosen in PNG Info like edits; the Hires. fix checkbox is not a mirrored
 * parameter, it follows them
 * @param {Object} values - Generate tab parameters
 */
function onPngInfoApply({hiresFix, ...values}) {
  pngInfo.value = null;

  if (values.checkpoint === checkpointValue.value)
    delete values.checkpoint;

  setParams(values);
  flushParams();

  if (hiresFix !== undefined)
    webUI.setWebUIParams({hiresFix});
}

// An image dropped on the prompt (a file or a card of the image lists) opens PNG Info; text is dropped as usual
const isImageDrag = e => e.dataTransfer?.types.includes("Files") || e.dataTransfer?.types.includes("application/x-image-bench");

function onPromptDragOver(e) {
  if (isImageDrag(e))
    e.preventDefault();
}

async function onPromptDrop(e) {
  if (!isImageDrag(e))
    return;

  e.preventDefault();

  const [file] = await imageFilesFromDataTransfer(e.dataTransfer);

  if (file)
    openPngInfo(file);
}

// ---------- Snippets ----------

const router = useRouter();
const snippets = useSnippetsStore();
const snippetsOpen = ref(storage.getItem(SNIPPETS_OPEN_KEY) === "true");
const promptField = ref(null);
const negativeField = ref(null);
// Prompt that receives the snippets: the one last focused
const snippetTarget = ref("prompt");

watch(snippetsOpen, open => storage.setItem(SNIPPETS_OPEN_KEY, String(open)));

const promptTextarea = name => (name === "negativePrompt" ? negativeField : promptField).value?.textarea ?? null;

/**
 * Insert a snippet at the caret of the target prompt; on click its other part is added to the other prompt
 * @param {Object} snippet - {prompt, negative}
 * @param {'click'|'middle'|'wrap'} mode
 */
async function onSnippetInsert(snippet, mode) {
  if (historyEntry.value) {
    shown.value = null;
    await nextTick();
  }

  const target = has("negativePrompt") ? snippetTarget.value : "prompt";
  const other = target === "prompt" ? "negativePrompt" : "prompt";
  const own = target === "prompt" ? snippet.prompt : snippet.negative;
  const rest = target === "prompt" ? snippet.negative : snippet.prompt;
  const textarea = promptTextarea(target);

  if (own && textarea && !textarea.disabled)
    insertIntoTextarea(textarea, own, mode === "wrap");

  if (mode !== "middle" && rest && (other === "prompt" || has("negativePrompt")))
    setParam(other, appendToPrompt(form[other] ?? "", rest));
}

async function onSnippetFromSelection(folderId) {
  const target = has("negativePrompt") ? snippetTarget.value : "prompt";
  const textarea = promptTextarea(target);
  // A prompt of the history is not a textarea: its selection is that of the page
  const text = (textarea ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
                         : historyEntry.value ? String(window.getSelection() ?? "") : "").trim();

  if (!text) {
    await dialog.alert("Select the text of the snippet in a prompt first.", {title: "Snippets"});
    return;
  }

  const name = await dialog.prompt("Name of the snippet:", {title: "New snippet", defaultValue: text.slice(0, 40),
                                                            okText: "Create"});

  if (name)
    snippets.addSnippet(folderId, target === "prompt" ? {name, prompt: text} : {name, negative: text});
}

function onSnippetEdit(id) {
  snippets.revealed = id || true;
  router.push("/library");
}

// ---------- Image ----------

const latestImage = computed(() => {
  const images = generatedImagesStore.images;

  for (let i = images.length - 1; i >= 0; i--)
    if (!images[i].separator)
      return images[i];

  return null;
});

// An image chosen in the filmstrip is shown instead of the latest image and the live preview
const selectedImage = ref(null);
const resultImage = computed(() => selectedImage.value ?? latestImage.value);

const livePreview = computed(() => !selectedImage.value && sdWebUI.live.active ? sdWebUI.live.preview : null);
const shownImageUrl = computed(() => livePreview.value || previewUrl(resultImage.value));
// A video or audio result plays in the cell
const resultMedia = computed(() => !resultImage.value || isStill(resultImage.value) ? null
  : {src: createImageLink(resultImage.value), kind: mediaKind(resultImage.value)});

// Dropped from the session by its image limit
watch(() => sessionImagesStore.images, images => {
  if (selectedImage.value && !images.includes(selectedImage.value))
    selectedImage.value = null;
});

// Input images of the shown mode, as WebUI reports them
const inputs = computed(() => sdWebUI.inputs.mode === mode.value ? sdWebUI.inputs : {image: null, mask: null});

function onInputUpload(kind, file) {
  webUI.setInputImage(kind, file);
}

/**
 * Reuse the (variation) seed of the shown image: set here and mirrored to WebUI like an edit,
 * so that the value is shown at once. As in WebUI, the variation seed of an image without variations is -1.
 * Without an image, the WebUI reuse button is clicked (it uses the last generation of the WebUI session)
 * @param {'seed'|'subseed'} which
 */
function onReuseSeed(which) {
  const parameters = resultImage.value?.parameters;

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
  if (!resultImage.value || livePreview.value)
    return;

  openImageOverlay(resultImage.value);
}

function openImageOverlay(image) {
  overlayImage.value = image;
  showImageOverlay.value = true;
}

// The overlay shows images of the session or of the Generated tab: the marking goes to both copies of the image
function onSetMarking(image) {
  const url = createImageLink(image);

  for (const other of [...generatedImagesStore.images, ...sessionImagesStore.images])
    if (other !== image && !other.separator && createImageLink(other) === url) {
      if (image.marking)
        other.marking = image.marking;
      else
        delete other.marking;
    }
}

const showParamsOverlay = ref(false);
const paramsOverlayImage = ref(null);

function onShowParams(image) {
  paramsOverlayImage.value = image;
  showParamsOverlay.value = true;
}

// The arrow keys move the overlay through the session images; the latest image is found there by its URL
function sessionNeighbour(step) {
  const images = sessionImagesStore.images;
  const url = createImageLink(overlayImage.value);
  const index = images.findIndex(image => image === overlayImage.value || createImageLink(image) === url);

  return index >= 0 ? images[index + step] : null;
}

const overlayHasPrev = computed(() => showImageOverlay.value && !!sessionNeighbour(-1));
const overlayHasNext = computed(() => showImageOverlay.value && !!sessionNeighbour(1));

function showSessionNeighbour(step) {
  const neighbour = sessionNeighbour(step);

  if (neighbour)
    overlayImage.value = neighbour;
}

function onKeydown(e) {
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && showImageOverlay.value && !showParamsOverlay.value
      && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    showSessionNeighbour(e.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (e.key !== "Escape" && e.key !== "Esc")
    return;

  if (pngInfo.value)
    pngInfo.value = null;
  else if (showParamsOverlay.value)
    showParamsOverlay.value = false;
  else if (showImageOverlay.value)
    showImageOverlay.value = false;
  else if (snippetsOpen.value)
    snippetsOpen.value = false;
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

const editorTarget = ref(storage.getItem(EDITOR_TARGET_KEY) === "reference" ? "reference" : "input");

function setEditorTarget(target) {
  editorTarget.value = target;
  storage.setItem(EDITOR_TARGET_KEY, target);
  webUI.setEditorTarget(target);
}

// The host page forgets the target when WebUI is reloaded
onActivated(() => webUI.setEditorTarget(editorTarget.value));

// ---------- ControlNet ----------

// The unit chosen in the ControlNet tab is mirrored while this tab is shown, without the defaults that the
// ControlNet tab applies to a unit used for the first time; a tab beside Hires. fix or img2img shows it
// while any unit is enabled
const cn = useControlNetStore();
const hasControlNet = useFeatures("controlnet", () => cn.features);
const controlNetUnit = computed(() => cn.selectedUnit);
const controlNet = useControlNetUnit({unit: controlNetUnit, tab: computed(() => cn.tab), has: hasControlNet});

// The reported units are those of the generation tab of the mode (ComfyUI has one)
const controlNetTabMatches = computed(() => isComfy || cn.tab === (isTxt2Img.value ? "txt2img" : "img2img"));
const enabledUnits = computed(() => controlNetTabMatches.value
  ? cn.units.flatMap((unit, index) => unit.enabled ? [index] : [])
  : []);

// Without the Hires. fix group (a ComfyUI workflow without ib:smp:1) ControlNet has the place alone
const hasMainGroup = computed(() => !isTxt2Img.value || has("hires"));
const groupTab = ref(storage.getItem(GROUP_TAB_KEY) === "controlnet" ? "controlnet" : "main");
const shownGroupTab = computed(() => !enabledUnits.value.length ? "main"
  : hasMainGroup.value ? groupTab.value : "controlnet");

watch(groupTab, tab => storage.setItem(GROUP_TAB_KEY, tab));

const groupTabs = computed(() => [
  ...hasMainGroup.value
    ? [{value: "main", label: isTxt2Img.value ? "Hires. fix" : mode.value === "inpaint" ? "Inpaint" : "img2img"}]
    : [],
  {value: "controlnet", label: "ControlNet"}
]);

function subscribeControlNet() {
  webUI.subscribeControlNet(true, controlNetUnit.value, {defaults: false});
}

onActivated(subscribeControlNet);
onHostReady(() => activated && subscribeControlNet());

onDeactivated(() => {
  controlNet.flushParams();
  webUI.subscribeControlNet(false, controlNetUnit.value);
});

function selectControlNetUnit(index) {
  if (index === controlNetUnit.value)
    return;

  controlNet.flushParams();
  cn.selectUnit(index);
  subscribeControlNet();
}

// A selected unit that is not enabled gives way to the first enabled one (only here: the ControlNet tab
// shows disabled units too)
watch(enabledUnits, units => {
  if (activated && units.length && !units.includes(controlNetUnit.value))
    selectControlNetUnit(units[0]);
});

// The preview, or the control image without one; in WebUI img2img the unit may use the img2img image
const controlNetImage = computed(() => controlNet.images.value.preview ?? controlNet.images.value.image);
const controlNetImageLabel = computed(() => controlNet.images.value.preview
  ? controlNet.form.preprocessor || "Preview"
  : "Control image");
const controlNetEmptyText = computed(() => !isTxt2Img.value && hasControlNet("independent")
  && !controlNet.form.independent ? "Uses the img2img image" : "No control image");

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

// ---------- Collapsed parameter groups ----------

// Collapsed, the prompts take the height of the parameter groups
const paramsCollapsed = ref(storage.getItem(PARAMS_COLLAPSED_KEY) === "true");

watch(paramsCollapsed, collapsed => storage.setItem(PARAMS_COLLAPSED_KEY, String(collapsed)));

// ---------- Parameters or session filmstrip ----------

// Tabs at the right edge of the parameter groups; the filmstrip is hidden by default
const lowerTab = ref("params");

// Shown for a batch, also over collapsed parameters, the filmstrip is hidden when the batch ends unless
// it has been used meanwhile or the keepSessionStrip setting is on; under the pointer it is hidden when
// the pointer leaves it
const stripAutoShown = ref(false);
const stripHovered = ref(false);
let stripHidePending = false;

const lowerCollapsed = computed(() => paramsCollapsed.value && !stripAutoShown.value);

function showLowerTab(tab) {
  lowerTab.value = tab;
  paramsCollapsed.value = false;
  stripAutoShown.value = false;
  stripHidePending = false;
}

function autoShowStrip() {
  if (lowerTab.value === "session" && !lowerCollapsed.value)
    return;

  lowerTab.value = "session";
  stripAutoShown.value = true;
  // A hidden strip receives no mouseleave
  stripHovered.value = false;
  stripHidePending = false;
}

function autoHideStrip() {
  if (!stripAutoShown.value)
    return;

  // Kept by the setting as if it had been used
  if (config.keepSessionStrip) {
    keepStrip();
    return;
  }

  if (stripHovered.value) {
    stripHidePending = true;
    return;
  }

  stripAutoShown.value = false;
  lowerTab.value = "params";
}

// Used while it is shown automatically, the filmstrip stays
function keepStrip() {
  if (stripAutoShown.value)
    showLowerTab("session");
}

function onStripLeave() {
  stripHovered.value = false;

  if (stripHidePending) {
    stripHidePending = false;
    autoHideStrip();
  }
}

// ---------- Layout ----------

// Content size of the grid; an estimate until it is measured
const gridElement = ref(null);
const gridSize = reactive({width: window.innerWidth - 24, height: window.innerHeight - 120});
let gridObserver = null;

onMounted(() => {
  gridObserver = new ResizeObserver(([entry]) => {
    // A deactivated (kept alive) tab is detached and measures 0
    if (!entry.contentRect.width)
      return;

    gridSize.width = entry.contentRect.width;
    gridSize.height = entry.contentRect.height;
  });

  gridObserver.observe(gridElement.value);
});

onBeforeUnmount(() => gridObserver?.disconnect());

// Wide: prompts | LoRAs | image; else the image is below the LoRAs
const wide = computed(() => gridSize.width >= WIDE_LAYOUT_WIDTH);

// Aspect ratio of the image to generate
const aspect = computed(() => form.width > 0 && form.height > 0 ? form.width / form.height : 1);

// The grips enlarge the negative prompt, the side column, the image column (wide) and the image below
// the LoRAs (default) at the expense of their neighbours; double-clicking one restores the automatic size
const negative = reactive(useDragSize(NEGATIVE_HEIGHT_KEY, {
  min: NEGATIVE_HEIGHT.min, max: NEGATIVE_HEIGHT.max, fallback: NEGATIVE_HEIGHT.default
}));

const sideWidth = reactive(useDragSize(SIDE_WIDTH_KEY, {
  axis: "x",
  min: SIDE_WIDTH.min,
  max: () => gridSize.width - MAIN_MIN_WIDTH - GRID_GAP - (wide.value ? IMAGE_WIDTH.min + GRID_GAP : 0),
  fallback: () => wide.value ? SIDE_WIDTH.wide : Math.min(SIDE_WIDTH.default, gridSize.width * SIDE_WIDTH.defaultShare)
}));

const imageWidth = reactive(useDragSize(IMAGE_WIDTH_KEY, {
  axis: "x",
  min: IMAGE_WIDTH.min,
  max: () => gridSize.width - MAIN_MIN_WIDTH - sideWidth.size - 2 * GRID_GAP,
  fallback: () => Math.min(gridSize.height * aspect.value, gridSize.width * IMAGE_WIDTH.autoShare)
}));

// Natural height of the parameter groups, which the filmstrip takes too unless the area is resized
const groupsElement = ref(null);
const groupsHeight = ref(LOWER_HEIGHT.default);
const groupsObserver = new ResizeObserver(([entry]) => {
  // Hidden behind the filmstrip or in a deactivated tab
  if (entry.target.offsetHeight)
    groupsHeight.value = entry.target.offsetHeight;
});

watch(groupsElement, (element, previous) => {
  if (previous)
    groupsObserver.unobserve(previous);
  if (element)
    groupsObserver.observe(element);
});

onBeforeUnmount(() => groupsObserver.disconnect());

const lowerHeight = reactive(useDragSize(LOWER_HEIGHT_KEY, {
  min: LOWER_HEIGHT.min,
  max: () => Math.max(LOWER_HEIGHT.min, gridSize.height - LOWER_HEIGHT.promptReserve),
  fallback: () => groupsHeight.value
}));

const imageHeight = reactive(useDragSize(IMAGE_HEIGHT_KEY, {
  min: IMAGE_HEIGHT.min,
  max: () => gridSize.height - IMAGE_HEIGHT.sideReserve,
  fallback: () => sideWidth.size / aspect.value
}));

const gridStyle = computed(() => ({
  gridTemplateColumns: wide.value
    ? `minmax(0, 1fr) ${sideWidth.size}px ${imageWidth.size}px`
    : `minmax(0, 1fr) ${sideWidth.size}px`
}));
</script>

<template>
  <ImageOverlay v-if="showImageOverlay" :image="overlayImage" markable @show-params="onShowParams"
                :has-prev="overlayHasPrev" :has-next="overlayHasNext" @navigate="showSessionNeighbour"
                @set-marking="onSetMarking" @hide-overlay="showImageOverlay = false"/>
  <ParametersOverlay v-if="showParamsOverlay" :image="paramsOverlayImage"
                     @hide-overlay="showParamsOverlay = false"/>
  <PngInfoDialog v-if="pngInfo" :context="pngInfoContext" :file="pngInfo.file"
                 @close="pngInfo = null" @apply="onPngInfoApply"/>
  <SnippetsPanel v-if="snippetsOpen" :target="has('negativePrompt') ? snippetTarget : 'prompt'"
                 @insert="onSnippetInsert" @close="snippetsOpen = false"
                 @from-selection="onSnippetFromSelection" @edit="onSnippetEdit"/>

  <div class="view-container generate">
    <div class="toolbar">
      <div class="toolbar-group">
        <button class="btn swap" :class="generating ? 'stop' : 'primary'"
                :disabled="!generating && (!connected || sdWebUI.restoringParams)"
                :title="generating ? 'Stop; Ctrl+click or middle click: stop and generate again' : undefined"
                @click="onGenerateButton" @mousedown.middle.prevent
                @auxclick="e => e.button === 1 && generating && onRestart()">
          <span :class="{off: generating}"><AppIcon name="play" :size="13"/>Generate</span>
          <span :class="{off: !generating || ctrlDown || restarting}"><AppIcon name="stop" :size="13"/>Stop</span>
          <span :class="{off: !generating || !(ctrlDown || restarting)}"><AppIcon name="refresh" :size="13"/>Restart</span>
        </button>
        <button class="btn outline" :disabled="!generating" title="Skip the image being generated"
                @click="webUI.skipGeneration()"><AppIcon name="skip" :size="13"/>Skip</button>
        <label class="toolbar-group-label"><span class="reset-count" title="Reset to 1 image"
              @click.prevent="generateImagesNumber = 1">×</span><NumberStepper v-model="generateImagesNumber" label="Images to generate"/></label>
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

      <!-- The free space of the toolbar, with the status centered in it -->
      <div class="status-slot">
        <Transition name="status" mode="out-in">
          <span v-if="toolbarStatus" :key="toolbarStatus.text" class="status-pill" :class="{waiting: toolbarStatus.waiting}"
                role="status" :title="toolbarStatus.text">
            <span v-if="toolbarStatus.waiting" class="dot"></span><span v-else class="spinner"></span>
            <span class="status-text">{{ toolbarStatus.text }}</span>
          </span>
        </Transition>
      </div>

      <button class="ib" :class="{on: snippetsOpen}" :aria-pressed="snippetsOpen"
              title="Snippets: insert prompt text of the Library at the caret" aria-label="Snippets"
              @mousedown.prevent @click="snippetsOpen = !snippetsOpen"><AppIcon name="snippet" :size="14"/></button>
      <button class="ib" :disabled="!connected" title="PNG Info: apply the generation parameters of an image (or drop an image on the prompt)"
              aria-label="PNG Info" @click="openPngInfo()"><AppIcon name="fileSearch" :size="14"/></button>
      <button class="ib danger" :disabled="!connected" title="Clear the prompts" aria-label="Clear the prompts"
              @click="clearPrompts"><AppIcon name="eraser" :size="14"/></button>
      <button v-if="has('promptLock')" class="ib" :class="{on: sdWebUI.promptsLocked}" :aria-pressed="sdWebUI.promptsLocked"
              :disabled="!connected"
              :title="sdWebUI.promptsLocked ? 'WebUI prompts locked: click to allow editing them in WebUI'
                : 'Lock WebUI prompts: cover them in WebUI, so that they are edited only here'"
              aria-label="Lock WebUI prompts" @click="toggleLock"
        ><AppIcon :name="sdWebUI.promptsLocked ? 'lock' : 'unlock'" :size="14"/></button>
      <span class="toolbar-divider"></span>
      <button class="ib" :class="{on: consoleOpen}" :aria-pressed="consoleOpen"
              :title="`Console: the terminal output of ${HOST_NAME} (Ctrl+\`, in any tab)`" aria-label="Console"
              @click="toggleConsole"><AppIcon name="terminal" :size="14"/></button>
      <template v-if="has('workflowSelect')">
        <span class="toolbar-divider"></span>
        <WorkflowSelect class="workflow-select" :workflows="sdWebUI.workflows" :active="sdWebUI.workflow"
                        :disabled="!connected || generating" @select="path => webUI.loadWorkflow(path)"/>
        <button class="ib" :class="{busy: savingWorkflow}" :disabled="!connected || !sdWebUI.workflow || savingWorkflow"
                :title="workflowSaved ? 'Save the workflow' : 'Save the workflow as…'" aria-label="Save the workflow"
                @click="saveWorkflow"><AppIcon name="save" :size="14"/></button>
      </template>
      <span v-if="has('modeSwitch')" class="toolbar-divider"></span>
      <div v-if="has('modeSwitch')" class="seg modes" role="radiogroup" aria-label="Generation mode">
        <button v-for="item in MODES" :key="item.value" type="button" role="radio" :class="{on: mode === item.value}"
                :aria-checked="mode === item.value" :disabled="!connected || generating" :title="item.title"
                @click="onModeSelect(item.value)">{{ item.label }}</button>
      </div>
    </div>

    <fieldset ref="gridElement" class="generate-grid" :class="{wide}" :style="gridStyle" :disabled="!connected">
      <!-- Model row -->
      <div class="model-row">
        <UiPresetSelect v-if="has('uiPreset') && form.uiPreset !== null && form.uiPreset !== undefined"
                        :model-value="form.uiPreset" :presets="config.generateUiPresets"
                        :choices="sdWebUI.options.uiPresets"
                        @update:model-value="selectUiPreset"/>
        <button v-if="hasModules" type="button" class="ib flat slot-switch"
                :title="shownModelSlot === 'modules'
                  ? 'VAE / Text Encoder. Click to show the checkpoint'
                  : 'Checkpoint. Click to show the VAE / Text Encoder'"
                :aria-label="shownModelSlot === 'modules' ? 'Show the checkpoint' : 'Show the VAE / Text Encoder'"
                @click="modelSlot = shownModelSlot === 'modules' ? 'checkpoint' : 'modules'"
          ><AppIcon :name="shownModelSlot === 'modules' ? 'puzzle' : 'box'" :size="14"/></button>
        <ModulesSelect v-if="shownModelSlot === 'modules'" class="checkpoint" :model-value="form.modules"
                       :choices="modules" @update:model-value="v => setParam('modules', v)"/>
        <div v-else-if="has('checkpoint')" class="select-wrap checkpoint">
          <select :value="checkpointValue" aria-label="Checkpoint" :title="checkpointTitle"
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
          <button type="button" class="ib flat slot-switch"
                  :title="sizeInputs ? 'Width and height. Click to show the size presets'
                    : 'Size presets. Click to show the width and height'"
                  :aria-label="sizeInputs ? 'Show the size presets' : 'Show the width and height inputs'"
                  @click="toggleSizeInputs"
            ><AppIcon :name="sizeInputs ? 'ruler' : 'list'" :size="14"/></button>
          <ResizeToInput v-if="sizeInputs" class="size" :width="form.width" :height="form.height"
                         :label="isTxt2Img ? 'Size' : 'Resize to'"
                         @change="(width, height) => setParams({width, height})"/>
          <SizeSelect v-else class="size" :width="form.width" :height="form.height"
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
        <template v-if="shownSideTab === 'lora'">
          <input v-model="loraFilter" class="filter" type="search" placeholder="Filter…" aria-label="Filter LoRAs">
          <button type="button" class="ib" :class="{busy: refreshing}" :disabled="refreshing"
                  title="Refresh the checkpoints and LoRAs" aria-label="Refresh the checkpoints and LoRAs"
                  @click="refreshModels"
            ><span v-if="refreshing" class="spinner"></span><AppIcon v-else name="refresh" :size="13"/></button>
        </template>
        <template v-else>
          <span class="spacer"></span>
          <button v-if="references.edit !== null" type="button" class="edit-switch" role="switch"
                  :aria-checked="references.edit" title="Edit with the references (the WebUI setting of the current model)"
                  @click="setReferenceParam('edit', 'edit', !references.edit)"><i></i>Edit</button>
        </template>
      </div>

      <!-- Prompt and LoRAs -->
      <!-- The token count is that of the current prompt: hidden while another one is shown, which makes room -->
      <PromptField ref="promptField" class="prompt" label="Prompt"
                   :tokens="has('tokens') && !historyEntry ? sdWebUI.tokens?.prompt : null"
                   :model-value="form.prompt ?? ''" @update:model-value="v => setParam('prompt', v)"
                   @dragover="onPromptDragOver" @drop="onPromptDrop" @focusin="snippetTarget = 'prompt'">
        <template v-if="promptHistory.entries.length || promptHistory.variants.length" #after-label>
          <PromptHistoryBar :entries="promptHistory.entries" :selected="historyIndex"
                            @select="selectHistoryEntry" @use="index => usePrompts(promptHistory.entries[index])"/>
          <PromptVariantsSelect v-if="promptHistory.variants.length" :variants="promptHistory.variants"
                                :selected="variantIndex" @select="selectVariant"
                                @use="index => usePrompts(promptHistory.variants[index])"
                                @rename="renameVariant" @remove="removeVariant"/>
          <template v-if="historyEntry">
            <template v-if="historyIndex !== null">
              <span class="history-info">#{{ historyIndex + 1 }} · {{ formatHistoryTime(historyEntry.time) }}</span>
              <button type="button" class="history-btn icon" title="Fork: keep these prompts as a named variant"
                      aria-label="Fork a prompt variant" @click="forkHistoryEntry"><AppIcon name="fork" :size="11"/></button>
            </template>
            <button type="button" class="history-btn" :class="{on: !historyPlain}" :aria-pressed="!historyPlain"
                    title="Compare with the current prompt" @click="historyPlain = !historyPlain">
              <AppIcon name="compare" :size="11"/>Diff</button>
            <button type="button" class="history-btn use" title="Replace the current prompts with these"
                    @click="usePrompts(historyEntry)"><AppIcon name="check" :size="11"/>Use</button>
          </template>
        </template>
        <template v-if="historyEntry" #view>
          <PromptDiff :text="historyEntry.prompt" :base="form.prompt ?? ''" :plain="historyPlain"/>
        </template>
      </PromptField>

      <!-- LoRAs or references with the image below them; wide, the image is in a column of its own -->
      <div class="side">
        <ReferencesPanel v-if="shownSideTab === 'references'" class="side-panel" :references="references"
                         :editor-target="editorTarget" :has="has"
                         @add="files => webUI.editReferences({add: files})"
                         @remove="index => webUI.editReferences({remove: index})"
                         @clear="webUI.editReferences({clear: true})"
                         @enabled="value => setReferenceParam('enabled', 'referencesEnabled', value)"
                         @max-size="value => setReferenceParam('maxSize', 'referenceMaxSize', value)"
                         @editor-target="setEditorTarget"/>

        <div v-else class="lora-tree side-panel">
          <CheckTree v-if="loraItems.length" :items="loraItems" :selected="selectedLoras"
                     storage-key="imageBench_generateLoraCollapsed"
                     @toggle="(name, checked) => onLoraToggle([name], checked)"
                     @toggle-many="onLoraToggle"
                     @focus="name => onLoraToggle([name], !selectedLoras.has(name))"/>
          <div v-else class="empty">{{ loras.length ? "No matching LoRAs" : "No LoRAs" }}</div>
        </div>

        <div v-if="!wide" class="grip" :class="{active: imageHeight.resizing}" role="separator"
             aria-orientation="horizontal" aria-label="Resize the image" :aria-valuenow="imageHeight.size" tabindex="0"
             title="Drag to resize the image; double-click to fit it to the column width"
             @pointerdown="imageHeight.onPointerDown" @keydown="imageHeight.onKeydown"
             @dblclick="imageHeight.reset"><i></i></div>

        <!-- Latest image or live preview; the input images in img2img and inpaint -->
        <GenerateImageCell class="image-cell" :style="wide ? null : {height: `${imageHeight.size}px`}"
                           :mode="mode" :result-url="shownImageUrl" :result-media="resultMedia"
                           :live-progress="livePreview ? sdWebUI.live.progress : null"
                           :result-clickable="!!resultImage && !livePreview"
                           :input-image="inputs.image" :input-mask="inputs.mask"
                           :action-image="generating || livePreview ? null : resultImage"
                           @result-click="onResultClick" @upload="onInputUpload" @show-params="onShowParams"
                           @set-marking="onSetMarking" @use-size="(width, height) => setParams({width, height})"/>
      </div>

      <div class="column-grip side-grip" :class="{active: sideWidth.resizing}" role="separator"
           aria-orientation="vertical" :aria-label="`Resize the ${shownSideTab === 'lora' ? 'LoRA' : 'references'} column`"
           :aria-valuenow="sideWidth.size" tabindex="0" title="Drag to resize the column; double-click to restore it"
           @pointerdown="sideWidth.onPointerDown" @keydown="sideWidth.onKeydown" @dblclick="sideWidth.reset"><i></i></div>

      <div v-if="wide" class="column-grip image-grip" :class="{active: imageWidth.resizing}" role="separator"
           aria-orientation="vertical" aria-label="Resize the image column" :aria-valuenow="imageWidth.size" tabindex="0"
           title="Drag to resize the image column; double-click to fit it to the image"
           @pointerdown="imageWidth.onPointerDown" @keydown="imageWidth.onKeydown" @dblclick="imageWidth.reset"><i></i></div>

      <!-- Negative prompt and parameters -->
      <div class="lower">
        <template v-if="has('negativePrompt')">
          <div class="grip" :class="{active: negative.resizing}" role="separator" aria-orientation="horizontal"
               aria-label="Resize the negative prompt" :aria-valuenow="negative.size"
               :aria-valuemin="NEGATIVE_HEIGHT.min" :aria-valuemax="NEGATIVE_HEIGHT.max" tabindex="0"
               title="Drag to resize the negative prompt; double-click to restore it"
               @pointerdown="negative.onPointerDown" @keydown="negative.onKeydown" @dblclick="negative.reset"><i></i></div>

          <PromptField ref="negativeField" class="negative" label="Negative prompt"
                       :tokens="has('tokens') ? sdWebUI.tokens?.negativePrompt : null"
                       :style="{height: `${negative.size + 20}px`}"
                       :model-value="form.negativePrompt ?? ''" @update:model-value="v => setParam('negativePrompt', v)"
                       @focusin="snippetTarget = 'negativePrompt'">
            <template v-if="historyEntry" #view>
              <PromptDiff :text="historyEntry.negativePrompt" :base="form.negativePrompt ?? ''" :plain="historyPlain"/>
            </template>
          </PromptField>
        </template>

        <div v-if="lowerCollapsed" class="groups-collapsed">
          <button type="button" class="collapsed-tab label-small" title="Show the generation parameters"
                  @click="showLowerTab('params')">Parameters</button>
          <button type="button" class="collapsed-tab label-small" title="Show the images generated in this session"
                  @click="showLowerTab('session')">Session
            <span v-if="sessionImagesStore.images.length" class="count">{{ sessionImagesStore.images.length }}</span></button>
          <span class="spacer"></span>
          <button type="button" class="params-toggle restore" title="Show the generation parameters"
                  aria-label="Show the generation parameters" :aria-expanded="false"
                  @click="showLowerTab(lowerTab)"><AppIcon name="chevron" :size="14"/></button>
        </div>

        <template v-else>
          <div class="grip" :class="{active: lowerHeight.resizing}" role="separator" aria-orientation="horizontal"
               aria-label="Resize the parameters" :aria-valuenow="lowerHeight.size" tabindex="0"
               title="Drag to resize the parameters and the filmstrip; double-click to fit the parameters"
               @pointerdown="lowerHeight.onPointerDown" @keydown="lowerHeight.onKeydown"
               @dblclick="lowerHeight.reset"><i></i></div>

          <div class="lower-area" :style="{height: `${lowerHeight.size}px`}">
            <div v-show="lowerTab === 'params'" class="lower-pane params-pane">
              <div ref="groupsElement" class="groups">
                <SamplingGroup :form="form" :samplers="samplerChoices" :schedulers="schedulerChoices"
                               :slider-kind="sdWebUI.sliderKind" :has="has" @set="setParam"/>
                <SeedGroup :form="form" :has="has" @set="setParam" @reuse="onReuseSeed"/>
                <ControlNetGroup v-if="shownGroupTab === 'controlnet'" :form="controlNet.form" :units="enabledUnits"
                                 :unit="controlNetUnit" :models="controlNet.modelChoices.value"
                                 :image="controlNetImage" :image-label="controlNetImageLabel"
                                 :empty-text="controlNetEmptyText" :stale="controlNet.previewStale.value"
                                 :disabled="!controlNet.connected.value"
                                 @set="controlNet.setParam" @guidance="controlNet.setGuidance"
                                 @select-unit="selectControlNetUnit" @open="router.push('/controlnet')">
                  <template #tabs>
                    <input v-if="isTxt2Img && has('hires') && has('hiresFix')" type="checkbox" class="group-check"
                           :checked="!!form.hiresFix" aria-label="Hires. fix" title="Hires. fix"
                           @change="e => setParam('hiresFix', e.target.checked)">
                    <GroupTabs v-model="groupTab" :tabs="groupTabs"/>
                  </template>
                </ControlNetGroup>
                <HiresGroup v-else-if="isTxt2Img && has('hires')" :form="form" :upscalers="sdWebUI.options.upscalers ?? []"
                            :has="has" @set="setParam">
                  <template v-if="enabledUnits.length" #title><GroupTabs v-model="groupTab" :tabs="groupTabs"/></template>
                </HiresGroup>
                <Img2ImgGroup v-else-if="!isTxt2Img" :form="form" :options="sdWebUI.options" :has="has"
                              :title="mode === 'inpaint' ? 'Inpaint' : 'img2img'" :inpaint-params="hasInpaintParams"
                              @set="setParam">
                  <template v-if="enabledUnits.length" #title><GroupTabs v-model="groupTab" :tabs="groupTabs"/></template>
                </Img2ImgGroup>
              </div>
            </div>

            <SessionStrip v-show="lowerTab === 'session'" class="lower-pane" :images="sessionImagesStore.images"
                          :selected="selectedImage" :active="lowerTab === 'session'"
                          @select="image => selectedImage = image" @open="openImageOverlay"
                          @show-params="onShowParams" @interact="keepStrip"
                          @mouseenter="stripHovered = true" @mouseleave="onStripLeave"/>

            <div class="lower-tabs" role="tablist" aria-orientation="vertical">
              <button type="button" class="params-toggle" title="Hide the generation parameters"
                      aria-label="Hide the generation parameters" :aria-expanded="true"
                      @click="paramsCollapsed = true; stripAutoShown = false"><AppIcon name="chevron" :size="14"/></button>
              <button type="button" role="tab" class="lower-tab label-small" :class="{on: lowerTab === 'params'}"
                      :aria-selected="lowerTab === 'params'" @click="showLowerTab('params')">Parameters</button>
              <button type="button" role="tab" class="lower-tab label-small" :class="{on: lowerTab === 'session'}"
                      :aria-selected="lowerTab === 'session'" title="Images generated in this session"
                      @click="showLowerTab('session')">Session<span v-if="sessionImagesStore.images.length"
                      class="count">{{ sessionImagesStore.images.length }}</span></button>
              <button v-if="lowerTab === 'session' && sessionImagesStore.images.length" type="button"
                      class="params-toggle clear-session" title="Clear the filmstrip" aria-label="Clear the filmstrip"
                      @click="sessionImagesStore.clear()"><AppIcon name="trash" :size="13"/></button>
            </div>
          </div>
        </template>
      </div>
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
  /* Columns set inline from the grip sizes */
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "model  header"
    "prompt side"
    "lower  side";
  gap: 10px 14px;
}

.generate-grid.wide {
  grid-template-areas:
    "model  header image"
    "prompt side   image"
    "lower  side   image";
}

.model-row {
  grid-area: model;
}

.lora-header {
  grid-area: header;
}

.prompt {
  grid-area: prompt;
}

.lower {
  grid-area: lower;
}

/* The side panel, its grip and the image below it */
.side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.side > .side-panel {
  flex: 1;
}

.side > .image-cell {
  flex: none;
}

/* Wide, the side panel and the image are grid items of their own */
.wide .side {
  display: contents;
}

.wide .side-panel {
  grid-area: side;
}

.wide .image-cell {
  grid-area: image;
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

/* Close to the dropdown it switches, the gap of the row is too wide */
.slot-switch {
  width: 18px;
  margin-right: -4px;
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

/* ---------- Prompt history ---------- */

.history-info {
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 10px;
  white-space: nowrap;
}

.history-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 16px;
  padding: 0 5px;
  border: 1px solid var(--ib-border);
  border-radius: 3px;
  background: var(--ib-surface);
  color: var(--ib-text-2);
  font-size: 10px;
  cursor: pointer;
}

.history-btn:hover {
  border-color: var(--ib-border-2);
  color: var(--ib-text);
}

.history-btn.icon {
  width: 16px;
  padding: 0;
  justify-content: center;
}

.history-btn.on {
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}

.history-btn.use {
  border-color: var(--ib-accent);
  background: var(--ib-accent);
  color: var(--ib-accent-ink);
  font-weight: 600;
}

.history-btn.use:hover {
  border-color: var(--ib-accent-hover);
  background: var(--ib-accent-hover);
  color: var(--ib-accent-ink);
}

/* ---------- UI preset switch ---------- */

/* Shrinks before the buttons around it; the status label then ellipsizes, the spinner stays */
.status-slot {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 11px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  font-size: 11.5px;
  white-space: nowrap;
}

.status-pill.waiting {
  border-color: var(--ib-border-2);
  background: var(--ib-elev-2);
  color: var(--ib-text-2);
}

.status-pill .spinner {
  flex: none;
  width: 10px;
  height: 10px;
}

.status-pill .dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ib-muted);
  animation: status-pulse 1.4s ease-in-out infinite;
}

@keyframes status-pulse {
  50% {
    opacity: 0.45;
  }
}

.status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-enter-active,
.status-leave-active {
  transition: opacity 0.15s;
}

.status-enter-from,
.status-leave-to {
  opacity: 0;
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

/* In the gap at the left of its column, over the whole grid height */
.column-grip {
  grid-row: 1 / -1;
  justify-self: start;
  width: 10px;
  margin-left: -12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: col-resize;
  touch-action: none;
}

.side-grip {
  grid-column: 2;
}

.image-grip {
  grid-column: 3;
}

.column-grip i {
  width: 4px;
  height: 40px;
  border-radius: 2px;
  background: var(--ib-border-2);
}

.grip:hover i,
.grip:focus-visible i,
.grip.active i,
.column-grip:hover i,
.column-grip:focus-visible i,
.column-grip.active i {
  background: var(--ib-accent);
}

.grip:focus-visible,
.column-grip:focus-visible {
  outline: none;
  background: var(--ib-accent-soft);
}

.groups {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

/* Hires. fix checkbox before the tabs of the ControlNet group, as in the Hires. fix group */
.group-check {
  margin: 0;
}

/* Parameters or filmstrip, with their tabs at the right edge */
.lower-area {
  display: flex;
  gap: 8px;
  min-height: 0;
}

.lower-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* Scrolled when the area is resized below the height of the groups */
.params-pane {
  overflow-y: auto;
  overflow-x: hidden;
}

.lower-tabs {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: -3px;
  border-left: 1px solid var(--ib-border);
}

/* Rotated, read from the bottom up */
.lower-tab {
  padding: 6px 2px 6px 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  border: 0;
  border-right: 2px solid transparent;
  margin-left: -1px;
  background: none;
  cursor: pointer;
}

.lower-tab:hover,
.collapsed-tab:hover {
  color: var(--ib-text-2);
}

.lower-tab.on {
  border-right-color: var(--ib-accent);
  color: var(--ib-text);
}

/* The collapsed area leaves a header line with its tabs */
.groups-collapsed {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--ib-border);
}

.collapsed-tab {
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: none;
  cursor: pointer;
}

.params-toggle {
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--ib-text-2);
  cursor: pointer;
}

.params-toggle:hover {
  background: var(--ib-elev-2);
  color: var(--ib-text);
}

/* At the bottom of the tab column */
.clear-session {
  margin-top: auto;
  margin-bottom: 2px;
}

.params-toggle.restore :deep(svg) {
  transform: rotate(180deg);
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

.workflow-select {
  flex: 0 1 260px;
  min-width: 140px;
}

.modes button {
  padding: 0 10px;
}

</style>
