<script setup>
/**
 * Layout editor of the Generate tab, in the place of the prompts: bounding boxes of the objects and texts of a JSON
 * layout prompt (src/layoutPrompt.js), drawn on a canvas of the image's aspect, with their captions, texts and
 * palettes, and the global description of the image. Every edit emits the whole layout, which the tab writes into the
 * prompt at once. The negative prompt is a single line at the bottom.
 *
 * Drag on empty space draws a box of the chosen kind, a box drags to move, its handles resize it; Delete removes the
 * selected box, the arrows nudge it (Shift: more), Escape deselects, then closes the editor. The JSON toggle shows the
 * prompt's JSON indented in place of the item list, the selected box's element highlighted.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {KIND_LABELS, LAYOUT_MODELS, MOSS_CANVASES, layoutModel, newItem, normalizeColor, prettyLayout} from "@/layoutPrompt.js";
import {MIN_REGION, containsPoint, moveRegion, resizeRegion, spanRegion} from "@/components/compare/compareGeometry.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {writeClipboard} from "@/infotextClipboard.js";
import {gestureTitle} from "@/gestures.js";
import {toast, toastError} from "@/toast.js";

const UNDERLAY_KEY = "imageBench_layoutUnderlay";
const DRAW_KIND_KEY = "imageBench_layoutDrawKind";
const JSON_VIEW_KEY = "imageBench_layoutJsonView";
const HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
// A drag shorter than this (in pixels) is a click
const DRAG_THRESHOLD = 4;
const NUDGE = 0.005;
const NUDGE_SHIFT = 0.025;

const props = defineProps({
  // The layout read from the prompt; the editor works on a copy (remounted by its key on a reload)
  initial: {
    type: Object,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  // The model detected from the checkpoint, marked in the model select
  detected: {
    type: String,
    default: null
  },
  width: {
    type: Number,
    required: true
  },
  height: {
    type: Number,
    required: true
  },
  // Shown under the boxes if the underlay is on
  imageUrl: {
    type: String,
    default: null
  },
  // null: the host has no negative prompt
  negativePrompt: {
    type: String,
    default: null
  }
});

const emit = defineEmits(["change", "update:model", "update:negativePrompt", "close"]);

const storage = useLocalStorage();
const layout = reactive(structuredClone(toRaw(props.initial)));
const selected = ref(null);
const underlay = ref(storage.getItem(UNDERLAY_KEY) === "true");
const drawKind = ref(storage.getItem(DRAW_KIND_KEY) ?? "obj");

const jsonView = ref(storage.getItem(JSON_VIEW_KEY) === "true");

watch(underlay, value => storage.setItem(UNDERLAY_KEY, String(value)));
watch(jsonView, value => storage.setItem(JSON_VIEW_KEY, String(value)));
watch(drawKind, value => storage.setItem(DRAW_KIND_KEY, value));
watch(layout, value => emit("change", structuredClone(toRaw(value))), {deep: true});

const modelInfo = computed(() => layoutModel(props.model));
const ideogram = computed(() => props.model === "ideogram4");
const kinds = computed(() => modelInfo.value.kinds);
const selectedItem = computed(() => selected.value === null ? null : layout.items[selected.value] ?? null);
const size = computed(() => ({w: props.width, h: props.height}));

// A Character box drawn for MOSS stays an object for Ideogram
watch(kinds, value => {
  if (!value.includes(drawKind.value))
    drawKind.value = "obj";
}, {immediate: true});

// ---------- Canvas size: the image aspect fitted into its area ----------

const area = ref(null);
const canvas = ref(null);
const fitted = reactive({width: 0, height: 0});
let observer = null;

function fit() {
  const element = area.value;

  if (!element || !(props.width > 0) || !(props.height > 0))
    return;

  const scale = Math.min(element.clientWidth / props.width, element.clientHeight / props.height);
  fitted.width = Math.max(1, Math.floor(props.width * scale));
  fitted.height = Math.max(1, Math.floor(props.height * scale));
}

watch(() => [props.width, props.height], fit);

onMounted(() => {
  observer = new ResizeObserver(fit);
  observer.observe(area.value);
  fit();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
});

// ---------- Drawing, moving and resizing ----------

// {type: "draw"|"move"|"resize", start, anchor, region, handle, moved, index}
let drag = null;

function pointOf(e) {
  const rect = canvas.value.getBoundingClientRect();
  return {x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))};
}

function boxAt(point) {
  for (let index = layout.items.length - 1; index >= 0; index--)
    if (containsPoint(layout.items[index].box, point))
      return index;

  return null;
}

function onCanvasPointerDown(e) {
  if (e.button !== 0)
    return;

  e.preventDefault();
  canvas.value.focus({preventScroll: true});

  const point = pointOf(e);
  const handle = e.target.dataset?.handle;
  const index = handle ? selected.value : boxAt(point);

  if (handle && selectedItem.value)
    drag = {type: "resize", handle, index, region: {...selectedItem.value.box}};
  else if (index !== null) {
    selected.value = index;
    drag = {type: "move", index, start: point, region: {...layout.items[index].box}};
  }
  else
    drag = {type: "draw", anchor: point};

  drag.screen = {x: e.clientX, y: e.clientY};
  drag.moved = false;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(e) {
  if (!drag)
    return;

  if (!drag.moved && Math.hypot(e.clientX - drag.screen.x, e.clientY - drag.screen.y) < DRAG_THRESHOLD)
    return;

  drag.moved = true;
  const point = pointOf(e);

  if (drag.type === "draw") {
    const box = spanRegion(drag.anchor, point, null, size.value);

    if (drag.index === undefined) {
      layout.items.push(newItem(drawKind.value, box));
      drag.index = layout.items.length - 1;
      selected.value = drag.index;
    }
    else
      layout.items[drag.index].box = box;
  }
  else if (drag.type === "move")
    layout.items[drag.index].box = moveRegion(drag.region, point.x - drag.start.x, point.y - drag.start.y);
  else
    layout.items[drag.index].box = resizeRegion(drag.region, drag.handle, point, null, size.value);
}

async function onPointerUp() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);

  const ended = drag;
  drag = null;

  if (!ended)
    return;

  if (ended.type === "draw") {
    if (ended.index === undefined) {
      // A click on empty space
      selected.value = null;
      return;
    }

    const box = layout.items[ended.index].box;

    if (box.w < MIN_REGION * 4 || box.h < MIN_REGION * 4) {
      removeItem(ended.index);
      return;
    }

    await nextTick();
    captionInput.value?.focus();
  }
}

function onCanvasKeydown(e) {
  if (e.key === "Escape" || e.key === "Esc") {
    e.stopPropagation();

    if (selected.value !== null)
      selected.value = null;
    else
      emit("close");

    return;
  }

  const item = selectedItem.value;

  if (!item)
    return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeItem(selected.value);
    return;
  }

  const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
  const offsets = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};

  if (item.box && offsets[e.key]) {
    e.preventDefault();
    item.box = moveRegion(item.box, ...offsets[e.key]);
  }
}

// ---------- Items ----------

const captionInput = ref(null);

function removeItem(index) {
  layout.items.splice(index, 1);

  if (selected.value === index)
    selected.value = null;
  else if (selected.value > index)
    selected.value--;
}

// Earlier elements are further back
function moveItem(index, offset) {
  const target = index + offset;

  if (target < 0 || target >= layout.items.length)
    return;

  const [item] = layout.items.splice(index, 1);
  layout.items.splice(target, 0, item);

  if (selected.value === index)
    selected.value = target;
  else if (selected.value === target)
    selected.value = index;
}

// An item without a box (Ideogram allows them) gets one in the middle
function placeItem(item) {
  item.box = {x: 0.35, y: 0.35, w: 0.3, h: 0.3};
}

function setKind(item, kind) {
  item.kind = kind;

  if (kind === "text" && item.text === undefined)
    item.text = "";
}

function itemSummary(item) {
  const text = item.kind === "text" && item.text ? `"${item.text.replace(/\n/g, " ")}"` : "";
  return [text, item.caption].filter(Boolean).join(" · ") || "No caption";
}

const boxStyle = box => ({left: `${box.x * 100}%`, top: `${box.y * 100}%`,
                          width: `${box.w * 100}%`, height: `${box.h * 100}%`});

// ---------- Palettes and lists, edited as comma-separated text ----------

const listText = list => (list ?? []).join(", ");

function setPalette(target, text, max) {
  const colors = text.split(/[\s,;]+/).map(normalizeColor).filter(Boolean);
  target.palette = max ? colors.slice(0, max) : colors;
}

function setMeta(text) {
  layout.meta = text.split(",").map(part => part.trim()).filter(Boolean);
}

// ---------- JSON view ----------

const jsonPieces = computed(() => jsonView.value ? prettyLayout(props.model, layout, {width: props.width, height: props.height}) : []);
const jsonPane = ref(null);

// The selected box's element is scrolled into view
watch([selected, jsonView], async () => {
  await nextTick();
  jsonPane.value?.querySelector(".element.selected")?.scrollIntoView({block: "nearest"});
});

async function copyJson() {
  const text = prettyLayout(props.model, layout, {width: props.width, height: props.height})
    .map(piece => piece.text).join("");

  if (await writeClipboard(text))
    toast("Layout JSON copied");
  else
    toastError("The browser refused to copy the text.", {title: "Layout"});
}

function onJsonButton(e) {
  if (e.shiftKey)
    copyJson();
  else
    jsonView.value = !jsonView.value;
}
</script>

<template>
  <div class="layout-editor">
    <div class="toolbar">
      <div class="select-wrap model">
        <select :value="model" title="The model the layout is written for" aria-label="Layout model"
                @change="e => emit('update:model', e.target.value)">
          <option v-for="option in LAYOUT_MODELS" :key="option.id" :value="option.id">
            {{ option.label }}{{ option.id === detected ? " (detected)" : "" }}</option>
        </select>
        <AppIcon name="chevron" :size="12"/>
      </div>
      <span class="size" :title="ideogram ? 'Boxes are fractions of the image' : 'Boxes are pixels of this size'">
        {{ width }}×{{ height }}</span>
      <div class="kinds" role="radiogroup" aria-label="Kind of the boxes drawn">
        <button v-for="kind in kinds" :key="kind" type="button" class="kind" :class="[kind, {on: drawKind === kind}]"
                role="radio" :aria-checked="drawKind === kind" :title="`Drag on the image to draw a ${KIND_LABELS[kind].toLowerCase()} box`"
                @click="drawKind = kind"><i></i>{{ KIND_LABELS[kind] }}</button>
      </div>
      <button type="button" class="ib sm flat" :class="{on: underlay}" :disabled="!imageUrl"
              title="Show the latest image under the boxes" aria-label="Show the latest image under the boxes"
              :aria-pressed="underlay" @click="underlay = !underlay"><AppIcon name="picture" :size="13"/></button>
      <button type="button" class="kind" :class="{on: jsonView}" :aria-pressed="jsonView"
              :title="gestureTitle(jsonView ? 'Show the boxes and their details' : 'Show the JSON of the prompt, indented',
                                   'copy the JSON, indented')"
              @click="onJsonButton" @auxclick="e => e.button === 1 && copyJson()"
              @mousedown.middle.prevent><AppIcon name="snippet" :size="12"/>JSON</button>
      <button type="button" class="done" title="Show the prompts (Escape)" @click="emit('close')">
        <AppIcon name="check" :size="11"/>Done</button>
    </div>

    <div class="body">
      <div ref="area" class="area">
        <div ref="canvas" class="canvas" tabindex="0" aria-label="Layout boxes"
             :style="{width: `${fitted.width}px`, height: `${fitted.height}px`}"
             @pointerdown="onCanvasPointerDown" @keydown="onCanvasKeydown">
          <img v-if="underlay && imageUrl" class="underlay" :src="imageUrl" alt="" draggable="false">
          <template v-for="(item, index) in layout.items" :key="index">
            <div v-if="item.box" class="box" :class="[item.kind, {selected: index === selected}]" :style="boxStyle(item.box)">
              <span class="box-label">{{ index + 1 }}<template v-if="item.kind === 'text' && item.text"> “{{ item.text }}”</template></span>
              <template v-if="index === selected">
                <span v-for="handle in HANDLES" :key="handle" class="handle" :class="handle" :data-handle="handle"></span>
              </template>
            </div>
          </template>
          <div v-if="!layout.items.length" class="hint">Drag to draw a box</div>
        </div>
      </div>

      <div v-if="jsonView" ref="jsonPane" class="panel json">
        <button type="button" class="ib sm flat copy" title="Copy the JSON, indented" aria-label="Copy the JSON"
                @click="copyJson"><AppIcon name="copy" :size="12"/></button>
        <pre><template v-for="(piece, index) in jsonPieces" :key="index"><span v-if="piece.item !== undefined"
            class="element" :class="{selected: piece.item === selected}"
            @click="selected = piece.item">{{ piece.text }}</span><template v-else>{{ piece.text }}</template></template></pre>
      </div>

      <div v-else class="panel">
        <ol class="items">
          <li :class="{on: selected === null}" @click="selected = null">
            <AppIcon name="picture" :size="12"/><span class="summary">Image: {{ layout.caption || "no description" }}</span>
          </li>
          <li v-for="(item, index) in layout.items" :key="index" :class="[item.kind, {on: index === selected}]"
              @click="selected = index">
            <i class="swatch"></i><span class="number">{{ index + 1 }}</span>
            <span class="summary">{{ itemSummary(item) }}</span>
            <button v-if="!item.box" type="button" class="row-btn" title="Give it a box" @click.stop="placeItem(item)">
              <AppIcon name="region" :size="11"/></button>
            <button type="button" class="row-btn" :disabled="index === 0" title="Further back"
                    aria-label="Further back" @click.stop="moveItem(index, -1)"><AppIcon name="chevron" :size="11" class="up"/></button>
            <button type="button" class="row-btn" :disabled="index === layout.items.length - 1" title="Further forward"
                    aria-label="Further forward" @click.stop="moveItem(index, 1)"><AppIcon name="chevron" :size="11"/></button>
            <button type="button" class="row-btn" title="Remove (Delete)" aria-label="Remove"
                    @click.stop="removeItem(index)"><AppIcon name="close" :size="11"/></button>
          </li>
        </ol>

        <div v-if="selectedItem" class="details">
          <div class="kinds" role="radiogroup" aria-label="Kind">
            <button v-for="kind in kinds" :key="kind" type="button" class="kind" :class="[kind, {on: selectedItem.kind === kind}]"
                    role="radio" :aria-checked="selectedItem.kind === kind"
                    @click="setKind(selectedItem, kind)"><i></i>{{ KIND_LABELS[kind] }}</button>
          </div>
          <label v-if="selectedItem.kind === 'text'" class="field">Text (exact, line breaks kept)
            <textarea v-model="selectedItem.text" rows="2" spellcheck="false"></textarea></label>
          <label class="field">{{ selectedItem.kind === 'text' ? "Typography (font, weight, size, color)" : "Description" }}
            <textarea ref="captionInput" v-model="selectedItem.caption" rows="3" spellcheck="false"></textarea></label>
          <label class="field">Palette{{ modelInfo.maxItemPalette ? ` (up to ${modelInfo.maxItemPalette})` : "" }}
            <span class="palette">
              <input :value="listText(selectedItem.palette)" placeholder="#RRGGBB, ..." spellcheck="false"
                     @change="e => setPalette(selectedItem, e.target.value, modelInfo.maxItemPalette)">
              <i v-for="color in selectedItem.palette" :key="color" :style="{background: color}" :title="color"></i>
            </span></label>
        </div>

        <div v-else class="details">
          <label class="field">{{ ideogram ? "Description (one or two sentences)" : "Caption" }}
            <textarea v-model="layout.caption" rows="3" spellcheck="false"></textarea></label>
          <template v-if="ideogram">
            <label class="field">Background
              <textarea v-model="layout.background" rows="2" spellcheck="false"></textarea></label>
            <div class="kinds" role="radiogroup" aria-label="Style">
              <button type="button" class="kind" :class="{on: layout.style.kind === 'art'}" role="radio"
                      :aria-checked="layout.style.kind === 'art'" @click="layout.style.kind = 'art'">Art</button>
              <button type="button" class="kind" :class="{on: layout.style.kind === 'photo'}" role="radio"
                      :aria-checked="layout.style.kind === 'photo'" @click="layout.style.kind = 'photo'">Photo</button>
            </div>
            <label class="field">Aesthetics<input v-model="layout.style.aesthetics" spellcheck="false"></label>
            <label class="field">Lighting<input v-model="layout.style.lighting" spellcheck="false"></label>
            <label v-if="layout.style.kind === 'photo'" class="field">Camera (lens, aperture, film)
              <input v-model="layout.style.photo" spellcheck="false"></label>
            <template v-else>
              <label class="field">Medium<input v-model="layout.style.medium" spellcheck="false"
                                                placeholder="graphic_design"></label>
              <label class="field">Art style<input v-model="layout.style.artStyle" spellcheck="false"></label>
            </template>
          </template>
          <template v-else>
            <label class="field">Meta (medium, genre)
              <input :value="listText(layout.meta)" placeholder="poster, ..." spellcheck="false"
                     @change="e => setMeta(e.target.value)"></label>
            <label class="field">Canvas
              <span class="select-wrap">
                <select v-model="layout.canvas">
                  <option v-for="canvasKind in MOSS_CANVASES" :key="canvasKind" :value="canvasKind">{{ canvasKind }}</option>
                </select>
                <AppIcon name="chevron" :size="12"/>
              </span></label>
          </template>
          <label class="field">Palette{{ modelInfo.maxPalette ? ` (up to ${modelInfo.maxPalette})` : "" }}
            <span class="palette">
              <input :value="listText(layout.palette)" placeholder="#RRGGBB, ..." spellcheck="false"
                     @change="e => setPalette(layout, e.target.value, modelInfo.maxPalette)">
              <i v-for="color in layout.palette" :key="color" :style="{background: color}" :title="color"></i>
            </span></label>
        </div>
      </div>
    </div>

    <label v-if="negativePrompt !== null" class="negative">Negative
      <input :value="negativePrompt" spellcheck="false"
             @input="e => emit('update:negativePrompt', e.target.value)"></label>
  </div>
</template>

<style scoped>
.layout-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  font-size: 11.5px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.toolbar .model {
  flex: 0 1 170px;
}

.size {
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 10.5px;
}

.kinds {
  display: inline-flex;
  gap: 2px;
}

.kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  cursor: pointer;
}

.kind:hover {
  background: var(--ib-hover);
}

.kind.on {
  border-color: var(--ib-border-2);
  background: var(--ib-elev-2);
  color: var(--ib-text);
}

.kind i,
.swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--kind);
}

.done {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 4px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  font: inherit;
  cursor: pointer;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
}

.area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.canvas {
  position: relative;
  flex: none;
  border: 1px solid var(--ib-border-2);
  background: var(--ib-elev);
  background-image: linear-gradient(var(--ib-border) 1px, transparent 1px),
                    linear-gradient(90deg, var(--ib-border) 1px, transparent 1px);
  background-size: 10% 10%;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.canvas:focus-visible {
  outline: 1px solid var(--ib-accent-border);
}

.underlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  opacity: 0.55;
  pointer-events: none;
}

.obj {
  --kind: var(--ib-accent);
}

.text {
  --kind: var(--ib-info);
}

.character {
  --kind: var(--ib-warn);
}

.box {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid var(--kind);
  background: color-mix(in srgb, var(--kind) 14%, transparent);
  cursor: move;
}

.box.selected {
  background: color-mix(in srgb, var(--kind) 24%, transparent);
  box-shadow: 0 0 0 1px var(--ib-bg);
}

.box-label {
  position: absolute;
  top: 0;
  left: 0;
  max-width: 100%;
  padding: 0 4px;
  overflow: hidden;
  background: var(--kind);
  color: var(--ib-bg);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border: 1px solid var(--ib-bg);
  background: var(--kind);
}

.handle.n, .handle.s { left: 50%; cursor: ns-resize; }
.handle.e, .handle.w { top: 50%; cursor: ew-resize; }
.handle.n, .handle.ne, .handle.nw { top: 0; }
.handle.s, .handle.se, .handle.sw { top: 100%; }
.handle.w, .handle.nw, .handle.sw { left: 0; }
.handle.e, .handle.ne, .handle.se { left: 100%; }
.handle.ne, .handle.sw { cursor: nesw-resize; }
.handle.nw, .handle.se { cursor: nwse-resize; }

.hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ib-muted);
  pointer-events: none;
}

.panel {
  flex: 0 0 270px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.json {
  position: relative;
  flex-basis: 340px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
}

.json pre {
  margin: 0;
  padding: 6px 8px;
  color: var(--ib-text-2);
  font-family: var(--ib-mono);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.json .copy {
  position: sticky;
  top: 4px;
  align-self: flex-end;
  margin: 4px 4px -26px 0;
  z-index: 1;
}

.element {
  border-radius: 3px;
  cursor: pointer;
}

.element:hover {
  background: var(--ib-hover);
}

.element.selected {
  background: var(--ib-accent-soft);
  color: var(--ib-text);
}

.items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.items li {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 4px;
  border-radius: 4px;
  color: var(--ib-text-2);
  cursor: pointer;
}

.items li:hover {
  background: var(--ib-hover);
}

.items li.on {
  background: var(--ib-elev-2);
  color: var(--ib-text);
}

.number {
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 10px;
}

.summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--ib-muted);
  cursor: pointer;
}

.row-btn:hover:not(:disabled) {
  background: var(--ib-elev-2);
  color: var(--ib-text);
}

.row-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.up {
  transform: rotate(180deg);
}

.details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--ib-border);
}

.field,
.negative {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--ib-text-2);
  font-size: 11px;
}

.field textarea,
.field input,
.negative input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 7px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
}

.field textarea:focus,
.field input:focus,
.negative input:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}

.palette {
  display: flex;
  align-items: center;
  gap: 3px;
}

.palette input {
  flex: 1;
  min-width: 0;
  font-family: var(--ib-mono);
}

.palette i {
  flex: none;
  width: 12px;
  height: 12px;
  border: 1px solid var(--ib-border-2);
  border-radius: 3px;
}

.negative {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.negative input {
  flex: 1;
  height: 24px;
}
</style>
