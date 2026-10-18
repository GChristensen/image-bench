<script setup>
/**
 * Image size picker: preset sizes grouped by megapixels and by model, and a button swapping width and height.
 * The presets are listed in the orientation of the current size, so after a swap they stay selectable;
 * a size that matches no preset is shown as custom. The list is a popover (up to 75% of the viewport high),
 * since a native select is cut to a few rows, in two columns (the `column` of the groups): the megapixel grades,
 * then the model groups. Each size starts with a rectangle of its aspect ratio.
 * The arrow keys move between the neighbouring rows and columns.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {SIZE_PRESET_GROUPS} from "@/consts.js";

const props = defineProps({
  width: {
    type: [Number, String],
    default: null
  },
  height: {
    type: [Number, String],
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['change']);

// Adjacent presets whose aspect ratios differ by at most this fraction are joined by a bracket as nearly the same
// shape (e.g. 7:4 and 16:9, 1.6% apart; 9:7 and 4:3, 3.7% apart, are not)
const SIMILAR_RATIO = 0.03;

// Longer side of the aspect ratio rectangles, px
const RATIO_ICON_SIZE = 14;

// Media of a ratio, shown after its note (in either orientation)
const MEDIA_ICONS = {
  "4:3": {icon: "easel", title: "Painting canvas (e.g. 30×40 cm, 12×16 in)"},
  "3:2":{icon: "photoCamera", title: "35 mm still photography"},
  "16:9": {icon: "tv", title: "Television and video"},
  "12:5": {icon: "cinemaCamera", title: "Anamorphic widescreen cinema (2.39:1)"}
};

const open = ref(false);
const alignRight = ref(false);
const element = ref(null);
const list = ref(null);

const width = computed(() => parseInt(props.width) || 0);
const height = computed(() => parseInt(props.height) || 0);
const isPortrait = computed(() => height.value > width.value);
const currentValue = computed(() => `${width.value}x${height.value}`);

// Ratios of the notes that are not "W:H"
const NOMINAL_RATIOS = {A4: Math.SQRT2};

// The nominal ratio of the note where it has one, so that the pairs are the same in every grade
// (the rounding to multiples of 16 moves the pixel ratios by up to 1%), else that of the pixels
function aspectRatio(size) {
  const match = size.note.match(/^(\d+):(\d+)/);
  const ratio = match ? match[1] / match[2] : NOMINAL_RATIOS[size.note.split(" ")[0]];

  return ratio ?? size.width / size.height;
}

function similarRatios(a, b) {
  const ra = aspectRatio(a);
  const rb = aspectRatio(b);

  return Math.max(ra, rb) / Math.min(ra, rb) - 1 <= SIMILAR_RATIO;
}

// Presets turned to the current orientation, e.g. 1216x832 (19:13) -> 832x1216 (13:19);
// linkNext marks the first of two adjacent presets of nearly the same ratio (pairs only, so brackets never overlap)
const groups = computed(() => SIZE_PRESET_GROUPS.map(group => {
  const sizes = group.sizes.map(({width: w, height: h, note, noBucket}) => {
    const flip = isPortrait.value && w > h;
    const [sw, sh] = flip ? [h, w] : [w, h];
    const shownNote = flip ? note.replace(/^(\d+):(\d+)/, "$2:$1") : note;

    const scale = RATIO_ICON_SIZE / Math.max(sw, sh);
    const icon = {width: `${Math.round(sw * scale)}px`, height: `${Math.round(sh * scale)}px`};

    return {value: `${sw}x${sh}`, width: sw, height: sh, size: `${sw}x${sh}`, note: shownNote, icon, noBucket: !!noBucket,
      media: MEDIA_ICONS[note.split(" ")[0]] ?? null, linkNext: null};
  });

  for (let i = 0; i < sizes.length - 1; i++)
    if (!sizes[i - 1]?.linkNext && similarRatios(sizes[i], sizes[i + 1]))
      sizes[i].linkNext = sizes[i + 1].size;

  return {name: group.name, grade: !!group.grade, column: group.column ?? 0, sizes};
}));

// The cells of the two-column grid, row by row: the grades, then the model groups. The notes of a cell have the
// width of its longest one (in characters of the monospace font), so the brackets follow the text and stay in line
const cells = computed(() => [true, false].flatMap(grade => [0, 1].map(column => {
  const cellGroups = groups.value.filter(group => group.grade === grade && group.column === column);
  const chars = Math.max(0, ...cellGroups.flatMap(group => group.sizes.map(size => size.note.length)));

  return {groups: cellGroups, style: {"--note-width": `${chars}ch`}};
})));

const current = computed(() => {
  for (const group of groups.value) {
    const size = group.sizes.find(size => size.value === currentValue.value);

    if (size)
      return {...size, group: group.name};
  }

  return null;
});

const shownLabel = computed(() => current.value
  ? current.value.size + (current.value.note ? ` (${current.value.note})` : "")
  : `${currentValue.value} (custom)`);

const title = computed(() => current.value ? `Image size: ${shownLabel.value}, ${current.value.group}` : "Image size");

function choose(size) {
  open.value = false;

  if (size.value !== currentValue.value)
    emit('change', size.width, size.height);
}

// Opened at the current size, focused for the arrow keys; the popover is wider than the select,
// so it opens to the left where it would leave the window at the right
watch(open, async value => {
  if (!value)
    return;

  alignRight.value = false;
  await nextTick();

  if (list.value && list.value.getBoundingClientRect().right > window.innerWidth - 4)
    alignRight.value = true;

  const selected = list.value?.querySelector("button.selected") ?? list.value?.querySelector("button");
  selected?.scrollIntoView({block: "center"});
  selected?.focus({preventScroll: true});
});

watch(() => props.disabled, disabled => disabled && (open.value = false));

const ARROW_KEYS = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"];

// The nearest row below or above in the same column, or the nearest row of the column to the left or right
function neighbour(buttons, from, key) {
  const origin = from.getBoundingClientRect();
  const vertical = key === "ArrowDown" || key === "ArrowUp";
  const sign = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
  let best = null, bestScore = Infinity;

  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const dx = (rect.left - origin.left) * sign;
    const dy = (rect.top - origin.top) * sign;
    const score = vertical
      ? (Math.abs(rect.left - origin.left) < 1 && dy > 0 ? dy : Infinity)
      : (dx > 1 ? dx * 10000 + Math.abs(rect.top - origin.top) : Infinity);

    if (score < bestScore) {
      bestScore = score;
      best = button;
    }
  }

  return best;
}

function onListKeydown(e) {
  if (!ARROW_KEYS.includes(e.key) && e.key !== "Home" && e.key !== "End")
    return;

  e.preventDefault();
  const buttons = [...list.value.querySelectorAll("button")];
  const from = buttons.includes(document.activeElement) ? document.activeElement : null;
  const next = e.key === "Home" ? buttons[0]
    : e.key === "End" ? buttons.at(-1)
    : from ? neighbour(buttons, from, e.key)
    : buttons[0];

  next?.focus();
  next?.scrollIntoView({block: "nearest"});
}

function onDocumentMousedown(e) {
  if (open.value && !element.value?.contains(e.target))
    open.value = false;
}

function onKeydown(e) {
  if (open.value && (e.key === "Escape" || e.key === "Esc")) {
    e.stopPropagation();
    open.value = false;
  }
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="size-select">
    <div class="select-wrap" ref="element" @keydown="onKeydown">
      <button type="button" class="value" :disabled="disabled" :title="title" aria-haspopup="listbox"
              :aria-expanded="open" aria-label="Image size" @click="open = !open">{{ shownLabel }}</button>
      <AppIcon name="chevron" :size="14"/>
      <div v-if="open" ref="list" class="menu popover" :class="{'align-right': alignRight}" role="listbox"
           aria-label="Image sizes" @keydown="onListKeydown">
        <div v-for="(cell, index) in cells" :key="index" class="cell" :class="{models: index >= 2}" :style="cell.style">
          <template v-for="group in cell.groups" :key="group.name">
            <div class="group">{{ group.name }}</div>
            <button v-for="size in group.sizes" :key="size.value" type="button" role="option"
                    :class="{selected: size.value === currentValue}" :aria-selected="size.value === currentValue"
                    :title="size.linkNext ? `Nearly the same aspect ratio as ${size.linkNext}` : null"
                    @click="choose(size)"
              ><span class="ratio" aria-hidden="true"><i :style="size.icon"></i></span
              ><span class="dims">{{ size.size }}</span
              ><span class="note">{{ size.note }}</span
              ><span class="link"><span v-if="size.linkNext" class="similar" aria-hidden="true"
                ><span class="sign">≈</span></span></span
              ><span class="marks"><span v-if="size.media" class="mark" :title="size.media.title"
                  ><AppIcon :name="size.media.icon" :size="12"/></span
                ><span v-if="size.noBucket" class="mark" title="Not a training bucket of any model"
                  ><AppIcon name="bucketOff" :size="12"/></span></span></button>
          </template>
        </div>
      </div>
    </div>
    <button class="ib" :disabled="disabled || width === height" title="Swap width and height"
            aria-label="Swap width and height" @click="emit('change', height, width)"><AppIcon name="swap"/></button>
  </div>
</template>

<style scoped>
.size-select {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.value {
  width: 100%;
  height: 26px;
  padding: 0 26px 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.value:hover:not(:disabled) {
  border-color: var(--ib-border-2);
}

.value:disabled {
  opacity: 0.6;
  cursor: default;
}

.popover {
  display: grid;
  grid-template-columns: repeat(2, minmax(max-content, 1fr));
  top: calc(100% + 4px);
  left: 0;
  width: max-content;
  min-width: 100%;
  max-height: 75vh;
  box-sizing: border-box;
  overflow-y: auto;
}

.popover.align-right {
  left: auto;
  right: 0;
}

/* The gap between the columns is the padding of the cells, so the line above the model groups is unbroken */
.cell:nth-child(odd) {
  padding-right: 3px;
}

.cell:nth-child(even) {
  padding-left: 3px;
}

.cell.models {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--ib-border);
}

.group {
  padding: 6px 8px 2px;
  color: var(--ib-muted);
  font-size: 11px;
  font-weight: 600;
}

.group:first-child {
  padding-top: 2px;
}

/* Ratio rectangle, dimensions, note, bracket, then the icons at the right */
.popover button {
  gap: 0;
  height: 22px;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.link {
  position: relative;
  flex: none;
  align-self: stretch;
  width: 14px;
  margin-left: 4px;
}

/* A "]" from the middle of this row to the middle of the next, with the sign at its right */
.similar {
  position: absolute;
  top: 50%;
  left: 0;
  width: 5px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid var(--ib-muted);
  border-left: 0;
  z-index: 1;   /* over the hover background of the next row */
  pointer-events: none;
}

.sign {
  position: absolute;
  top: 50%;
  left: 100%;
  padding-left: 3px;
  transform: translateY(-50%);
  color: var(--ib-muted);
  line-height: 1;
}

.popover button.selected {
  background: var(--ib-hover);
  color: var(--ib-accent);
}

.popover button:focus-visible {
  outline: 1px solid var(--ib-accent-border);
  outline-offset: -1px;
}

/* The rectangle of the aspect ratio, centered in a square slot so the dimensions stay aligned */
.ratio {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 8px;
}

.ratio i {
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-radius: 1px;
  opacity: 0.55;
}

.popover button.selected .ratio i {
  opacity: 1;
}

.dims {
  flex: none;
  min-width: 9ch;
  margin-right: 12px;
}

.note {
  display: flex;
  flex: none;
  align-items: center;
  width: var(--note-width);
  color: var(--ib-muted);
  white-space: nowrap;
}

.marks {
  display: flex;
  flex: none;
  gap: 4px;
  min-width: 12px;
  margin-left: auto;
  padding-left: 4px;
  color: var(--ib-muted);
}

.mark {
  display: flex;
}

/* Not the chevron of the select (main.css places the icons of .select-wrap at its right) */
.mark .app-icon {
  position: static;
}
</style>
