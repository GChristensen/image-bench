<script setup>
/**
 * ControlNet tab: a unit of Forge "ControlNet Integrated" in the txt2img or img2img tab of WebUI, or a ControlNet
 * apply node marked ib:cn:<unit> in ComfyUI, mirrored both ways like the Generate tab. The host page polls the unit
 * while the tab is shown (CONTROLNET_STATE, CONTROLNET_IMAGES) and applies the edits made here (SET_CONTROLNET_PARAMS).
 * The unit shown here also receives the images sent to ControlNet from Photoshop.
 * In WebUI img2img a unit uses the img2img image unless it has an independent image, which an image set here turns on.
 * ComfyUI reports which parts the workflow has (features, see src/host.js).
 * In WebUI the pose of an openpose preview is edited in sd-webui-openpose-editor (OpenposeEditorModal).
 */
import {computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import ControlNetImagePane from "@/components/ControlNetImagePane.vue";
import OpenposeEditorModal from "@/components/OpenposeEditorModal.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {useControlNetStore} from "@/stores/controlnet.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import {useFeatures} from "@/composables/useFeatures.js";
import {HOST_NAME, isComfy} from "@/host.js";
import {copyImageToClipboard, imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";
import {sendUrlToPhotoshop} from "@/photoshop.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useDragSize} from "@/composables/useDragSize.js";
import {ensureOpenposeEditor} from "@/openposeEditor.js";
import {onHostReady} from "@/hostWindow.js";

// A value edited here is not overwritten by the polled WebUI value for this long,
// which covers the send delay and the next poll
const EDIT_HOLD = 2000;
const SEND_DELAY = 250;
// A tab switch that WebUI does not report within this time is given up
const TAB_SWITCH_TIMEOUT = 3000;
// The models are listed again after WebUI refreshes them
const REFRESH_DELAY = 800;

const TABS = [
  {value: "txt2img", label: "txt2img"},
  {value: "img2img", label: "img2img"}
];

const cn = useControlNetStore();
const webUI = useWebUIBridge();
const has = useFeatures("controlnet", () => cn.features);

const NOT_FOUND_TEXT = isComfy ? 'No ControlNet node is marked "ib:cn"' : "ControlNet is not found in WebUI";

// ---------- Unit and tab ----------

// Unit shown here (0-based, WebUI labels the units from 1)
const unit = computed(() => cn.selectedUnit);
const unitCount = computed(() => Math.max(cn.units.length, unit.value + 1));

// Tab chosen here until WebUI reports it
const requestedTab = ref(null);
let requestTimeout = null;
const tab = computed(() => requestedTab.value ?? cn.tab);

// The state reported by WebUI is that of the unit and tab shown here
const current = computed(() => cn.unit === unit.value && cn.tab === tab.value);
const connected = computed(() => current.value && !!cn.params);

function onUnitSelect(index) {
  if (index === unit.value)
    return;

  flushParams();
  resetForm();
  cn.selectUnit(index);
  webUI.subscribeControlNet(true, index);
}

function onTabSelect(value) {
  if (value === tab.value)
    return;

  flushParams();
  resetForm();
  requestedTab.value = value;
  clearTimeout(requestTimeout);
  requestTimeout = setTimeout(() => requestedTab.value = null, TAB_SWITCH_TIMEOUT);
  webUI.setControlNetTab(value);
}

watch(() => cn.tab, value => {
  if (value === requestedTab.value) {
    requestedTab.value = null;
    clearTimeout(requestTimeout);
  }
});

let activated = false;

onActivated(() => {
  activated = true;
  webUI.subscribeControlNet(true, unit.value);
});

// A host page loaded again in the iframe of the embedded mode knows nothing of the popup
onHostReady(() => activated && webUI.subscribeControlNet(true, unit.value));

onDeactivated(() => {
  activated = false;
  flushParams();
  webUI.subscribeControlNet(false, unit.value);
});

// ---------- Mirrored parameters ----------

const form = reactive({});
const editedAt = {};
let pending = {};
let sendTimeout = null;

watch(() => cn.params, params => {
  if (!current.value)
    return;

  const now = Date.now();

  for (const [name, value] of Object.entries(params || {}))
    if (!(name in pending) && now - (editedAt[name] || 0) > EDIT_HOLD)
      form[name] = value;
}, {immediate: true});

// Another unit or tab: its values are shown as WebUI reports them
function resetForm() {
  for (const name of Object.keys(form))
    delete form[name];

  for (const name of Object.keys(editedAt))
    delete editedAt[name];
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
    webUI.setControlNetParams(unit.value, pending);

  pending = {};
}

// The timestep range keeps its start before its end
function setGuidance(name, value) {
  const number = Number(value);

  if (name === "guidanceStart")
    setParams(number > form.guidanceEnd ? {guidanceStart: number, guidanceEnd: number} : {guidanceStart: number});
  else
    setParams(number < form.guidanceStart ? {guidanceStart: number, guidanceEnd: number} : {guidanceEnd: number});
}

// In img2img, the unit has its own image only with an independent image; WebUI hides its image options otherwise
const ownImage = computed(() => tab.value === "txt2img" || !!form.independent);

// Choices shown shorter, so that they fit in one row; the full choice is their title
const CONTROL_MODE_LABELS = {
  "My prompt is more important": "Prompt",
  "ControlNet is more important": "ControlNet"
};

// ---------- Preprocessor sliders ----------

const PREPROCESSOR_SLIDERS = ["processorRes", "thresholdA", "thresholdB"];

// The sliders WebUI shows for the preprocessor (Resolution only without Pixel Perfect), with its labels and ranges
const preprocessorSliders = computed(() => has("preprocessorParams") && current.value
  ? PREPROCESSOR_SLIDERS.filter(name => cn.sliders[name]?.visible).map(name => ({name, ...cn.sliders[name]}))
  : []);

function setSliderParam(name, value) {
  if (value !== "" && Number.isFinite(Number(value)))
    setParam(name, Number(value));
}

// ---------- Choices ----------

// Preprocessors and models of the control type, as WebUI offers them
const choices = ref({preprocessors: [], models: []});
// WebUI offers the models whose file names match the control type, all of them after they are refreshed
// until the type is changed
const allModels = ref(false);
let choicesRequest = 0;

async function loadChoices(type) {
  const request = ++choicesRequest;
  const query = `type=${encodeURIComponent(type || "All")}&all_models=${allModels.value}`;

  try {
    const response = await fetch(`/image-bench/controlnet/choices?${query}`);
    const data = response.ok ? await response.json() : {preprocessors: [], models: []};

    if (request === choicesRequest)
      choices.value = data;
  } catch (e) {
    console.error("Unable to load the ControlNet choices:", e);
  }
}

// Without control types (ComfyUI) all preprocessors and models are listed
watch(() => form.controlType, (type, oldType) => {
  if (oldType)
    allModels.value = false;

  if (type || !has("controlType"))
    loadChoices(type);
}, {immediate: true});

// ComfyUI reports the models of the unit's loader node, which replace the list of the backend
const modelChoices = computed(() => cn.options.models ?? choices.value.models);

// The current value is offered even if the list does not contain it
function withCurrent(list, value) {
  return value && !list.includes(value) ? [value, ...list] : list;
}

function onRefreshModels() {
  webUI.controlNetAction(unit.value, "refresh");
  allModels.value = true;
  setTimeout(() => loadChoices(form.controlType), REFRESH_DELAY);
}

// ---------- Images ----------

const images = computed(() => cn.images.tab === tab.value && cn.images.unit === unit.value
  ? cn.images : {image: null, mask: null, preview: null, pose: null});

// The preprocessor and its slider values as WebUI reports them, taken when a preview arrives;
// the preview is stale when they change after it was made (WebUI may keep it)
const preprocessorSignature = computed(() => current.value && cn.params
  ? JSON.stringify([cn.params.preprocessor, ...preprocessorSliders.value.map(slider => cn.params[slider.name])])
  : null);
const previewSignature = ref(null);

watch(() => images.value.preview, preview => previewSignature.value = preview ? preprocessorSignature.value : null,
  {immediate: true});

// A preview reported before the parameters is taken as made with them
watch(preprocessorSignature, signature => {
  if (images.value.preview && previewSignature.value === null)
    previewSignature.value = signature;
});

const previewStale = computed(() => !!images.value.preview && previewSignature.value !== null
  && preprocessorSignature.value !== null && previewSignature.value !== preprocessorSignature.value);

// Source pane: the control image or its mask (with Use Mask)
const sourceView = ref("image");
const shownSourceView = computed(() => form.useMask ? sourceView.value : "image");

async function onUpload(kind) {
  const [file] = await pickImageFiles();

  if (file)
    onFile(kind, file);
}

function onFile(kind, file) {
  if (kind === "mask")
    sourceView.value = "mask";

  webUI.setControlNetImage(unit.value, kind, file);
}

// Text fields keep their own clipboard handling
function isTextTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

// An image pasted anywhere in the tab goes to the shown source view (control image or mask)
async function onDocumentPaste(e) {
  if (!connected.value || isTextTarget(e.target))
    return;

  const kind = shownSourceView.value;
  const [file] = await imageFilesFromDataTransfer(e.clipboardData);

  if (file) {
    e.preventDefault();
    onFile(kind, file);
  }
}

// Ctrl+C without a text selection copies the preview
function onDocumentCopy(e) {
  if (!images.value.preview || isTextTarget(e.target) || document.getSelection()?.toString())
    return;

  e.preventDefault();
  onCopyPreview();
}

onActivated(() => {
  document.addEventListener("paste", onDocumentPaste);
  document.addEventListener("copy", onDocumentCopy);
});

onDeactivated(() => {
  document.removeEventListener("paste", onDocumentPaste);
  document.removeEventListener("copy", onDocumentCopy);
});

async function onCopyPreview() {
  try {
    await copyImageToClipboard(images.value.preview);
  } catch (error) {
    await dialog.alert(`Unable to copy the preview: ${error.message}`, {title: "Copy"});
  }
}

function onRun() {
  flushParams();
  webUI.controlNetAction(unit.value, "run");
}

const previewName = computed(() => `ControlNet ${unit.value + 1} ${form.preprocessor || ""} preview`);

const sourceImage = computed(() => shownSourceView.value === "mask" ? images.value.mask : images.value.image);
const sourceName = computed(() => `ControlNet ${unit.value + 1} ${shownSourceView.value === "mask" ? "mask" : "image"}`);

// Left click opens the image as a new document, middle click or Shift+click places it as a layer of the active document
async function onToPhotoshop(e, url, name) {
  if (e.button !== 0 && e.button !== 1)
    return;

  e.preventDefault();

  const newLayer = e.button === 1 || e.shiftKey;
  const error = await sendUrlToPhotoshop(url, name, !newLayer);

  if (error)
    await dialog.alert(error, {title: "Send to Photoshop"});
}

function onSavePreview() {
  const link = document.createElement("a");
  link.href = images.value.preview;
  link.download = `${previewName.value.replace(/\s+/g, "_")}.png`;
  link.click();
}

// ---------- OpenPose editor ----------

// Openpose preprocessors make the pose JSON of their preview, as Forge tells them
const openposePreview = computed(() => has("openposeEditor") && /openpose/i.test(form.preprocessor || "")
  && !!images.value.preview);

// Pose and background of the open editor, taken when it opens; null while it is closed
const poseEdit = ref(null);

async function onEditPose() {
  const {pose, image} = images.value;

  if (pose && await ensureOpenposeEditor())
    poseEdit.value = {unit: unit.value, pose, image};
}

function onPoseEdited(pose) {
  webUI.setControlNetPose(poseEdit.value.unit, pose);
  poseEdit.value = null;
}

// ---------- Layout ----------

const CONTROLS_WIDTH_KEY = "imageBench_controlnetControlsWidth";
const CONTROLS_WIDTH = {min: 280, default: 338};
const IMAGES_MIN_WIDTH = 360;
const GRID_GAP = 14;

// Content width of the grid; an estimate until it is measured
const gridElement = ref(null);
const gridWidth = ref(window.innerWidth - 24);
let gridObserver = null;

onMounted(() => {
  gridObserver = new ResizeObserver(([entry]) => {
    // A deactivated (kept alive) tab is detached and measures 0
    if (entry.contentRect.width)
      gridWidth.value = entry.contentRect.width;
  });

  gridObserver.observe(gridElement.value);
});

onBeforeUnmount(() => gridObserver?.disconnect());

const controlsWidth = reactive(useDragSize(CONTROLS_WIDTH_KEY, {
  axis: "x",
  min: CONTROLS_WIDTH.min,
  max: () => Math.max(CONTROLS_WIDTH.min, gridWidth.value - IMAGES_MIN_WIDTH - GRID_GAP),
  fallback: CONTROLS_WIDTH.default
}));

const gridStyle = computed(() => ({gridTemplateColumns: `minmax(0, 1fr) ${controlsWidth.size}px`}));
</script>

<template>
  <div class="view-container controlnet">
    <div class="toolbar">
      <button v-if="has('preprocessor')" class="btn primary" :disabled="!connected || !ownImage || !images.image || cn.running"
              :title="ownImage ? 'Run the preprocessor on the control image' : 'The unit uses the img2img image'"
              @click="onRun">
        <span v-if="cn.running" class="spinner"></span><AppIcon v-else name="zap" :size="13"/>Run preprocessor</button>
      <button class="btn outline" :disabled="!connected" title="Refresh the list of ControlNet models"
              @click="onRefreshModels"><AppIcon name="refresh" :size="13"/>Refresh models</button>

      <span class="toolbar-divider"></span>
      <div class="seg units" role="radiogroup" aria-label="ControlNet unit">
        <button v-for="index in unitCount" :key="index" type="button" role="radio"
                :class="{on: unit === index - 1}" :aria-checked="unit === index - 1"
                :title="cn.units[index - 1]?.enabled ? 'Enabled' : 'Disabled'"
                @click="onUnitSelect(index - 1)">Unit {{ index }}<i v-if="cn.units[index - 1]?.enabled" class="dot"></i></button>
      </div>

      <div class="toolbar-spacer"></div>

      <span v-if="cn.available === false" class="chip warn">{{ NOT_FOUND_TEXT }}</span>
      <span v-else-if="!connected" class="chip">Waiting for {{ HOST_NAME }}…</span>
      <span v-if="has('tabSwitch')" class="toolbar-divider"></span>
      <div v-if="has('tabSwitch')" class="seg tabs" role="radiogroup" aria-label="Generation tab">
        <button v-for="item in TABS" :key="item.value" type="button" role="radio" :class="{on: tab === item.value}"
                :aria-checked="tab === item.value" :title="`ControlNet of the ${item.label} tab`"
                @click="onTabSelect(item.value)">{{ item.label }}</button>
      </div>
    </div>

    <div ref="gridElement" class="controlnet-grid" :style="gridStyle">
      <div class="images" :class="{single: !has('preprocessor')}">
        <!-- Control image or its mask -->
        <ControlNetImagePane :image="sourceImage"
                             :dark="shownSourceView === 'mask'" :droppable="connected"
                             :empty-text="ownImage
                               ? (shownSourceView === 'mask' ? 'No mask' : 'No control image') + '\nUpload, drop or paste one, or send it from Photoshop'
                               : 'The unit uses the img2img image\nUpload, drop or paste one to use an independent image'"
                             @file="file => onFile(shownSourceView, file)">
          <template #label>
            <div v-if="form.useMask" class="seg views" role="tablist" aria-label="Image shown">
              <button type="button" role="tab" :class="{on: shownSourceView === 'image'}"
                      :aria-selected="shownSourceView === 'image'" @click="sourceView = 'image'">Source</button>
              <button type="button" role="tab" :class="{on: shownSourceView === 'mask'}"
                      :aria-selected="shownSourceView === 'mask'" @click="sourceView = 'mask'"
                >Mask<i v-if="images.mask" class="dot"></i></button>
            </div>
            <span v-else class="label-small">Source</span>
          </template>
          <template #actions>
            <button class="btn outline photoshop" :disabled="!sourceImage"
                    :title="`Left: send the ${shownSourceView === 'mask' ? 'mask' : 'control image'} to Photoshop as a new image, Middle/Shift: send to Photoshop as a new layer`"
                    @click="onToPhotoshop($event, sourceImage, sourceName)"
                    @mousedown.middle.prevent
                    @auxclick="onToPhotoshop($event, sourceImage, sourceName)"
              ><AppIcon name="photoshop" :size="13"/>To Photoshop</button>
            <button class="ib flat" :disabled="!connected"
                    :title="shownSourceView === 'mask' ? 'Upload the mask' : 'Upload the control image'"
                    :aria-label="shownSourceView === 'mask' ? 'Upload the mask' : 'Upload the control image'"
                    @click="onUpload(shownSourceView)"><AppIcon name="upload" :size="14"/></button>
            <button v-if="shownSourceView === 'mask' || has('clearImage')" class="ib flat"
                    :disabled="!connected || !(shownSourceView === 'mask' ? images.mask : images.image)"
                    title="Clear" :aria-label="shownSourceView === 'mask' ? 'Clear the mask' : 'Clear the control image'"
                    @click="webUI.controlNetAction(unit, shownSourceView === 'mask' ? 'clearMask' : 'clearImage')"
              ><AppIcon name="close" :size="14"/></button>
          </template>
          <button v-if="shownSourceView === 'image' && form.useMask && images.mask" type="button" class="pip"
                  title="Mask: ControlNet applies where it is white" aria-label="Show the mask"
                  @click="sourceView = 'mask'"><img :src="images.mask" alt=""></button>
          <button v-if="!ownImage && connected && has('independent')" type="button" class="btn outline independent"
                  @click="setParam('independent', true)">Use an independent image</button>
        </ControlNetImagePane>

        <!-- Preprocessor preview -->
        <ControlNetImagePane v-if="has('preprocessor')" :image="images.preview" dark
                             :empty-text="cn.running ? 'Preprocessing…' : 'Run the preprocessor to see its result'">
          <template #label>
            <span class="label-small">Preview</span>
          </template>
          <template #actions>
            <button v-if="openposePreview" class="btn outline photoshop"
                    :disabled="!connected || !images.pose || cn.running"
                    :title="images.pose ? 'Edit the pose in the OpenPose editor' : 'Run the preprocessor to get the pose'"
                    @click="onEditPose"><AppIcon name="pencil" :size="13"/>Edit pose</button>
            <button class="btn outline photoshop" :disabled="!images.preview"
                    title="Left: send the preview to Photoshop as a new image, Middle/Shift: send to Photoshop as a new layer"
                    @click="onToPhotoshop($event, images.preview, previewName)"
                    @mousedown.middle.prevent
                    @auxclick="onToPhotoshop($event, images.preview, previewName)"
              ><AppIcon name="photoshop" :size="13"/>To Photoshop</button>
            <button class="ib flat" :disabled="!images.preview" title="Copy the preview (Ctrl+C)"
                    aria-label="Copy the preview" @click="onCopyPreview"><AppIcon name="copy" :size="14"/></button>
            <button class="ib flat" :disabled="!images.preview" title="Save the preview" aria-label="Save the preview"
                    @click="onSavePreview"><AppIcon name="download" :size="14"/></button>
            <button class="ib flat" :disabled="!connected || !images.preview" title="Clear"
                    aria-label="Clear the preview" @click="webUI.controlNetAction(unit, 'clearPreview')"
              ><AppIcon name="close" :size="14"/></button>
          </template>
          <button v-if="previewStale" type="button" class="chip stale" :disabled="!connected || !ownImage || cn.running"
                  title="The preprocessor parameters changed after the preview was made; click to run the preprocessor"
                  @click="onRun"><AppIcon name="refresh" :size="12"/>Parameters changed — run again</button>
        </ControlNetImagePane>
      </div>

      <fieldset class="controls" :disabled="!connected">
        <div class="checks">
          <label class="check enable"><input type="checkbox" :checked="!!form.enabled"
                                             @change="e => setParam('enabled', e.target.checked)">Enable</label>
          <label v-if="has('pixelPerfect')" class="check"><input type="checkbox" :checked="!!form.pixelPerfect"
                                      @change="e => setParam('pixelPerfect', e.target.checked)">Pixel Perfect</label>
          <label v-if="has('allowPreview')" class="check" :class="{off: !ownImage}"><input type="checkbox" :checked="!!form.allowPreview"
                 :disabled="!ownImage" @change="e => setParam('allowPreview', e.target.checked)">Allow Preview</label>
          <label v-if="has('mask')" class="check" :class="{off: !ownImage}"><input type="checkbox" :checked="!!form.useMask"
                 :disabled="!ownImage" @change="e => setParam('useMask', e.target.checked)">Use Mask</label>
          <label v-if="tab === 'img2img' && has('independent')" class="check wide"
                 title="The unit uses its own image instead of the img2img image"><input type="checkbox"
                 :checked="!!form.independent" @change="e => setParam('independent', e.target.checked)"
                 >Upload independent control image</label>
        </div>

        <label v-if="has('controlType')" class="field">Control type
          <span class="select-wrap">
            <select :value="form.controlType" @change="e => setParam('controlType', e.target.value)">
              <option v-for="name in withCurrent(cn.options.controlType, form.controlType)" :key="name"
                      :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
        <label v-if="has('preprocessor')" class="field">Preprocessor
          <span class="select-wrap">
            <select :value="form.preprocessor" @change="e => setParam('preprocessor', e.target.value)">
              <option v-for="name in withCurrent(choices.preprocessors, form.preprocessor)" :key="name"
                      :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
        <div v-if="preprocessorSliders.length" class="preprocessor-params">
          <label v-for="slider in preprocessorSliders" :key="slider.name" class="slider">
            <span class="slider-label" :title="slider.label">{{ slider.label }}</span>
            <input type="range" :min="slider.min" :max="slider.max" :step="slider.step"
                   :value="form[slider.name] ?? slider.min"
                   @input="e => setSliderParam(slider.name, e.target.value)">
            <NumberStepper :model-value="form[slider.name] ?? ''" :min="slider.min" :max="slider.max" :step="slider.step"
                           :label="slider.label" @update:model-value="v => setSliderParam(slider.name, v)"/>
          </label>
        </div>
        <label class="field">Model
          <span class="select-wrap">
            <select :value="form.model" :title="form.model" @change="e => setParam('model', e.target.value)">
              <option v-for="name in withCurrent(modelChoices, form.model)" :key="name" :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>

        <label class="slider">Control weight
          <input type="range" min="0" max="2" step="0.05" :value="form.weight ?? 1"
                 @input="e => setParam('weight', Number(e.target.value))">
          <NumberStepper :model-value="form.weight ?? ''" :min="0" :max="2" :step="0.05" label="Control weight"
                         @update:model-value="v => setParam('weight', Number(v))"/>
        </label>
        <label class="slider">Starting step
          <input type="range" min="0" max="1" step="0.01" :value="form.guidanceStart ?? 0"
                 @input="e => setGuidance('guidanceStart', e.target.value)">
          <NumberStepper :model-value="form.guidanceStart ?? ''" :min="0" :max="1" :step="0.01"
                         label="Starting control step" @update:model-value="v => setGuidance('guidanceStart', v)"/>
        </label>
        <label class="slider">Ending step
          <input type="range" min="0" max="1" step="0.01" :value="form.guidanceEnd ?? 1"
                 @input="e => setGuidance('guidanceEnd', e.target.value)">
          <NumberStepper :model-value="form.guidanceEnd ?? ''" :min="0" :max="1" :step="0.01"
                         label="Ending control step" @update:model-value="v => setGuidance('guidanceEnd', v)"/>
        </label>

        <div v-if="has('controlMode') || has('resizeMode')" class="group-header label-small">Mode</div>
        <div v-if="has('controlMode')" class="field">Control mode
          <div class="seg control-mode" role="radiogroup" aria-label="Control mode">
            <button v-for="name in cn.options.controlMode" :key="name" type="button" role="radio"
                    :class="{on: form.controlMode === name}" :aria-checked="form.controlMode === name" :title="name"
                    @click="setParam('controlMode', name)">{{ CONTROL_MODE_LABELS[name] ?? name }}</button>
          </div>
        </div>
        <label v-if="has('resizeMode')" class="field" :class="{off: !ownImage}">Resize mode
          <span class="select-wrap">
            <select :value="form.resizeMode" :disabled="!ownImage" @change="e => setParam('resizeMode', e.target.value)">
              <option v-for="name in withCurrent(cn.options.resizeMode, form.resizeMode)" :key="name"
                      :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
      </fieldset>

      <div class="column-grip" :class="{active: controlsWidth.resizing}" role="separator"
           aria-orientation="vertical" aria-label="Resize the parameters column" :aria-valuenow="controlsWidth.size"
           tabindex="0" title="Drag to resize the column; double-click to restore it"
           @pointerdown="controlsWidth.onPointerDown" @keydown="controlsWidth.onKeydown"
           @dblclick="controlsWidth.reset"><i></i></div>
    </div>

    <OpenposeEditorModal v-if="poseEdit" :pose="poseEdit.pose" :image="poseEdit.image"
                         :title="`OpenPose editor — ControlNet ${poseEdit.unit + 1}`"
                         @apply="onPoseEdited" @close="poseEdit = null"/>
  </div>
</template>

<style scoped>
.controlnet-grid {
  flex: 1;
  min-height: 0;
  padding: 10px 12px 12px;
  display: grid;
  gap: 14px;
}

.images {
  grid-column: 1;
  grid-row: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-height: 0;
}

/* Without a preprocessor there is no preview pane */
.images.single {
  grid-template-columns: minmax(0, 1fr);
}

.controls {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0 2px 0 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* In the gap at the left of the parameters column, over its whole height */
.column-grip {
  grid-column: 2;
  grid-row: 1;
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

/* ---------- Toolbar ---------- */

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--ib-border);
}

.units,
.tabs {
  flex: none;
}

.units button,
.tabs button {
  padding: 0 10px;
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 3px;
  background: var(--ib-accent);
  vertical-align: middle;
}

.chip.warn {
  color: var(--ib-warn);
}

/* ---------- Images ---------- */

.views button {
  height: 22px;
  padding: 0 9px;
  font-size: 11.5px;
}

.pip {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 72px;
  height: 96px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: #000;
  cursor: pointer;
}

.pip img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.independent {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
}

.photoshop {
  height: 26px;
}

.stale {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  height: 24px;
  border: 1px solid var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  cursor: pointer;
}

.stale:disabled {
  cursor: default;
  opacity: 0.6;
}

/* ---------- Controls ---------- */

.checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  padding: 10px;
  border: 1px solid var(--ib-border);
  border-radius: 8px;
  background: var(--ib-surface);
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  color: var(--ib-text);
  cursor: pointer;
}

.check.enable {
  font-weight: 600;
}

.check.wide {
  grid-column: 1 / -1;
}

.check.off,
.field.off {
  opacity: 0.45;
}

/* Labels at the left, in the label column of the sliders, to save height */
.field {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ib-text-2);
  font-size: 11px;
}

.field .select-wrap {
  min-width: 0;
}

.group-header {
  margin-top: 4px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--ib-border);
}

.slider {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 96px;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  font-size: 11px;
}

.slider input[type=range] {
  width: 100%;
  accent-color: var(--ib-accent);
}

.slider :deep(.stepper) {
  display: flex;
  height: 26px;
}

.slider :deep(.stepper input) {
  flex: 1;
  width: auto;
  min-width: 0;
  height: 24px;
}

/* Sliders of the preprocessor, indented under it; the label column is narrower by the indent,
   so that the ranges line up with the other sliders */
.preprocessor-params {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: -4px;
  padding-left: 8px;
  border-left: 2px solid var(--ib-accent-border);
}

.preprocessor-params .slider {
  grid-template-columns: 86px minmax(0, 1fr) 96px;
}

.slider-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-mode {
  display: flex;
  flex-wrap: wrap;
}

.control-mode button {
  flex: 1 1 auto;
  padding: 0 8px;
  font-size: 11.5px;
}
</style>
