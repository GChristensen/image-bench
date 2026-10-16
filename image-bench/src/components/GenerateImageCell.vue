<script setup>
/**
 * Image area of the Generate tab: the latest result or the live preview, and in img2img and inpaint
 * the input image and mask (Result / Input / Mask views). The input is shown as a thumbnail over the result,
 * marked when a new one arrives (e.g. from Photoshop). Images are uploaded with the buttons, dropped or pasted;
 * WebUI keeps them, the cell shows what it reports.
 */
import {computed, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import ImageActionButtons from "@/components/ImageActionButtons.vue";
import {getImageSize, imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";
import {IMAGE_ACTIONS, imageActionHint, runImageAction, visibleActionGroups} from "@/imageActions.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import {KIND_GENERATED} from "@/consts.js";

const props = defineProps({
  // Generation mode: txt2img, img2img, inpaint or other (another img2img mode, without input)
  mode: {
    type: String,
    required: true
  },
  resultUrl: {
    type: String,
    default: null
  },
  // Progress of the live preview, null if there is none
  liveProgress: {
    type: Number,
    default: null
  },
  resultClickable: {
    type: Boolean,
    default: false
  },
  inputImage: {
    type: String,
    default: null
  },
  inputMask: {
    type: String,
    default: null
  },
  // Image of the result view whose send actions are offered on hover, null while generating
  actionImage: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['result-click', 'upload', 'use-size', 'show-params']);

const hasInput = computed(() => props.mode === "img2img" || props.mode === "inpaint");
const hasMask = computed(() => props.mode === "inpaint");

// Shown view: result, input or mask
const view = ref("result");
const shownView = computed(() => hasInput.value && (view.value !== "mask" || hasMask.value) ? view.value : "result");

const maskOverlay = ref(true);
const newInput = ref(false);
const dragOver = ref(false);

// A generation shows its live preview
watch(() => props.liveProgress !== null, live => {
  if (live)
    view.value = "result";
});

watch(() => [props.inputImage, props.inputMask], ([image, mask], [oldImage, oldMask]) => {
  if ((image && image !== oldImage || mask && mask !== oldMask) && shownView.value === "result")
    newInput.value = true;
});

function show(name) {
  view.value = name;

  if (name !== "result")
    newInput.value = false;
}

async function onUpload(kind) {
  const [file] = await pickImageFiles();

  if (file)
    emit('upload', kind, file);
}

async function onDrop(e) {
  dragOver.value = false;

  if (!hasInput.value)
    return;

  const [file] = await imageFilesFromDataTransfer(e.dataTransfer);

  if (file)
    emit('upload', shownView.value === "mask" ? "mask" : "image", file);
}

async function onPaste(e) {
  if (!hasInput.value)
    return;

  const [file] = await imageFilesFromDataTransfer(e.clipboardData);

  if (file) {
    e.preventDefault();
    emit('upload', shownView.value === "mask" ? "mask" : "image", file);
  }
}

// ---------- Actions of the result: parameters at the top left, send actions (the right side of an image card) ----------

const actionContext = {
  kind: KIND_GENERATED, isTray: false, upscalable: false,
  handlers: {showParams: image => emit('show-params', image)}
};

const actionGroups = computed(() => props.actionImage && shownView.value === "result"
  ? visibleActionGroups(props.actionImage, actionContext, "right") : []);

const paramsGroups = computed(() => {
  const action = props.actionImage && shownView.value === "result"
    && IMAGE_ACTIONS.find(action => action.id === "params");

  return action && action.visible(props.actionImage, actionContext) ? [[action]] : [];
});

const shiftDown = useShiftKey();
const hovered = ref(false);
const hoveredAction = ref(null);
const showAlt = computed(() => hovered.value && shiftDown.value);
const actionHint = computed(() => hoveredAction.value && imageActionHint(hoveredAction.value, showAlt.value));

function onAction(action, alt) {
  runImageAction(action, props.actionImage, actionContext, alt);
}

function onCellLeave() {
  hovered.value = false;
  hoveredAction.value = null;
}

async function onUseSize() {
  const size = await getImageSize(props.inputImage);

  if (size)
    emit('use-size', size.width, size.height);
}
</script>

<template>
  <div class="cell" :class="{dragover: dragOver}" :tabindex="hasInput ? 0 : undefined"
       @dragover.prevent="dragOver = hasInput" @dragleave="dragOver = false" @drop.prevent="onDrop" @paste="onPaste"
       @mouseenter="hovered = true" @mouseleave="onCellLeave">

    <button v-if="shownView === 'result'" type="button" class="view" :class="{clickable: resultClickable}"
            :title="liveProgress !== null ? 'Live preview' : resultClickable ? 'Click to view' : ''"
            @click="emit('result-click')">
      <img v-if="resultUrl" :src="resultUrl" alt="">
      <span v-else class="empty">The generated image appears here</span>
      <span v-if="liveProgress !== null" class="live-progress"><i :style="{width: `${liveProgress}%`}"></i></span>
    </button>

    <div v-else-if="shownView === 'input'" class="view">
      <template v-if="inputImage">
        <img :src="inputImage" alt="Input image">
        <img v-if="hasMask && maskOverlay && inputMask" class="mask-overlay" :src="inputMask" alt="">
      </template>
      <span v-else class="empty">No input image<br><small>Upload, drop or paste one, or send it from Photoshop</small></span>
    </div>

    <div v-else class="view mask">
      <img v-if="inputMask" :src="inputMask" alt="Mask">
      <span v-else class="empty">No mask<br><small>Upload, drop or paste one, or send it from Photoshop</small></span>
    </div>

    <!-- The views of img2img and inpaint, below them the parameters of the result on hover -->
    <div class="top-left">
      <div v-if="hasInput" class="seg views" role="tablist" aria-label="Image shown">
        <button type="button" role="tab" :class="{on: shownView === 'result'}" :aria-selected="shownView === 'result'"
                @click="show('result')">Result</button>
        <button type="button" role="tab" :class="{on: shownView === 'input'}" :aria-selected="shownView === 'input'"
                @click="show('input')">Input</button>
        <button v-if="hasMask" type="button" role="tab" :class="{on: shownView === 'mask'}"
                :aria-selected="shownView === 'mask'" @click="show('mask')">Mask</button>
      </div>
      <ImageActionButtons v-if="paramsGroups.length" class="result-actions" :groups="paramsGroups" :show-alt="showAlt"
                          @run="onAction" @hover="action => hoveredAction = action"/>
    </div>

    <template v-if="hasInput">
      <div v-if="shownView === 'input' && inputImage" class="input-actions">
        <button v-if="hasMask && inputMask" type="button" class="overlay-button" :class="{on: maskOverlay}"
                :aria-pressed="maskOverlay" title="Show the mask over the image"
                @click="maskOverlay = !maskOverlay">Mask overlay</button>
        <span class="spacer"></span>
        <button type="button" class="overlay-button" title="Resize to the size of the input image"
                @click="onUseSize">Use size</button>
      </div>

      <button v-if="shownView === 'result' && inputImage" type="button" class="pip" :class="{new: newInput}"
              :title="newInput ? 'New input image: click to show' : 'Input image: click to show'"
              aria-label="Show the input image" @click="show('input')">
        <img :src="inputImage" alt="">
        <img v-if="hasMask && inputMask" class="mask-overlay" :src="inputMask" alt="">
      </button>
    </template>

    <!-- Uploads of the input, below them the send actions of the result on hover -->
    <div class="top-right">
      <div v-if="hasInput" class="uploads">
        <button type="button" class="overlay-button" title="Upload the input image (or drop or paste it here)"
                @click="onUpload('image')"><AppIcon name="upload" :size="12"/>Image</button>
        <button v-if="hasMask" type="button" class="overlay-button" title="Upload the mask"
                @click="onUpload('mask')"><AppIcon name="upload" :size="12"/>Mask</button>
      </div>
      <template v-if="actionGroups.length">
        <ImageActionButtons class="result-actions" :groups="actionGroups" :show-alt="showAlt"
                            @run="onAction" @hover="action => hoveredAction = action"/>
        <span v-if="actionHint" class="action-hint">{{ actionHint }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cell {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ib-border);
  border-radius: 8px;
  background: var(--ib-surface);
}

.cell:focus-visible,
.cell.dragover {
  outline: none;
  border-color: var(--ib-accent-border);
}

.view {
  position: absolute;
  inset: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: default;
}

.view.clickable {
  cursor: zoom-in;
}

.view.mask {
  background: #000;
}

/* Out of the flow, so that the image does not size the grid row */
.view img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* The white of the mask tints the image, its black leaves it as it is */
.mask-overlay {
  mix-blend-mode: screen;
  opacity: 0.55;
  filter: brightness(0.7) sepia(1) hue-rotate(100deg) saturate(4);
  pointer-events: none;
}

.empty {
  margin: auto;
  padding: 0 16px;
  color: var(--ib-muted);
  font-size: 12px;
  text-align: center;
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

.top-left {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  pointer-events: none;
}

.top-left > * {
  pointer-events: auto;
}

.views {
  background: rgba(17, 19, 23, 0.85);
}

.views button {
  height: 22px;
  padding: 0 9px;
  font-size: 11.5px;
}

.top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
}

.top-right > * {
  pointer-events: auto;
}

.uploads {
  display: flex;
  gap: 4px;
}

/* The send actions show on hover, like on an image card */
.result-actions {
  visibility: hidden;
}

.cell:hover .result-actions {
  visibility: visible;
}

.action-hint {
  max-width: 260px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.85);
  color: var(--ib-text);
  font-size: 11px;
  pointer-events: none;
}

.input-actions {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  gap: 4px;
}

.spacer {
  flex: 1;
}

.overlay-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  background: rgba(17, 19, 23, 0.85);
  color: var(--ib-text);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.overlay-button:hover {
  border-color: var(--ib-accent-border);
}

.overlay-button.on {
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
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
  background: var(--ib-elev);
  cursor: pointer;
}

.pip img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pip.new {
  border: 2px solid var(--ib-accent);
}

.pip.new::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--ib-accent);
  box-shadow: 0 0 0 2px var(--ib-surface);
}
</style>
