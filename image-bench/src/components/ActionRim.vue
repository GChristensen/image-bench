<script setup>
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {ICON_PATHS} from "@/components/icons.js";
import {MARKINGS} from "@/consts.js";
import {ACTION_GROUP_COLORS as GROUP_COLORS} from "@/imageActions.js";

/**
 * Action rim of an image card: a hollow ring of sectors around the image center, one per image action
 * (imageActions.js) plus Delete at the bottom. The center button switches the ring to the markings and back.
 * The hovered sector or the center shows its label in the hole. Mounted while it is shown on the card,
 * so it starts with the actions each time.
 * In the image overlay (hub "close") the center closes it, and outer arcs hold the markings (top) and the
 * extra actions (bottom, e.g. reuse seed / all), so no mode switch is needed.
 */
const props = defineProps({
  // Visible actions per group in rim order, as returned by rimActionGroups()
  groups: {
    type: Array,
    required: true
  },
  // Smaller side of the image in pixels: the rim fits inside it down to a minimum size
  size: {
    type: Number,
    required: true
  },
  marking: {
    type: String,
    default: null
  },
  showAlt: {
    type: Boolean,
    default: false
  },
  deletable: {
    type: Boolean,
    default: false
  },
  // Label of the Delete sector, e.g. for a view that only references the image
  deleteLabel: {
    type: String,
    default: "Remove"
  },
  // The view filters by markings; filterActive tells that it is filtered by this marking
  filterable: {
    type: Boolean,
    default: false
  },
  filterActive: {
    type: Boolean,
    default: false
  },
  // Faint while the pointer is away from the ring (the rim opened on hover)
  dimFar: {
    type: Boolean,
    default: false
  },
  // What the center button does: "markings" switches the ring to the markings, "close" emits close
  hub: {
    type: String,
    default: "markings"
  },
  // The markings as an arc outside the ring, at the top
  markingArc: {
    type: Boolean,
    default: false
  },
  // Actions as an arc outside the ring, at the bottom: [{id, icon, label}], emitted as extra(id)
  extras: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["run", "delete", "setMarking", "filterMarking", "close", "extra"]);

const DELETE_COLOR = "#ef4444";
const MARKING_COLORS = {"👍": "#4ade80", "👎": "#fb7185", "🔴": "#ef4444", "🟠": "#f97316", "🟡": "#eab308",
  "🟢": "#22c55e", "🔵": "#3b82f6", "🟣": "#a855f7", "🏁": "#e5e7eb"};
const CLEAR_COLOR = "#9ca3af";

const GROUP_GAP = 4;
const ITEM_GAP = 1.2;
// The hit area reaches beyond the outer edge
const HIT_OUTSIDE = 12;
// Outer arcs: distance from the ring, width, and the span of one item in degrees
const ARC_GAP = 5;
const ARC_WIDTH = 26;
const MARKING_SPAN = 15;
const EXTRA_SPAN = 26;

// Two rims may coexist while one fades out; their filters are the same
const shadowId = "action-rim-shadow";

const mode = ref("actions");
const hoveredId = ref(null);
const centerHovered = ref(false);
const far = ref(false);
const root = ref(null);

const hasArcs = computed(() => props.markingArc || props.extras.length > 0);

const geometry = computed(() => {
  const outer = Math.max(58, Math.min(84, Math.floor(props.size / 2) - 8));
  const inner = outer - (outer >= 72 ? 28 : 24);
  const arcInner = outer + ARC_GAP;
  const arcOuter = arcInner + ARC_WIDTH;
  const pad = hasArcs.value ? ARC_GAP + ARC_WIDTH + HIT_OUTSIDE : HIT_OUTSIDE + 4;
  // With arcs the hit areas of the ring end halfway to them
  const hitOuter = hasArcs.value ? outer + ARC_GAP / 2 : outer + HIT_OUTSIDE;
  return {outer, inner, arcInner, arcOuter, hitOuter, pad, center: outer + pad, box: 2 * (outer + pad),
    icon: outer >= 66 ? 16 : 14};
});

const items = computed(() => {
  if (mode.value === "markings")
    return [
      ...MARKINGS.map((marking, index) => ({
        id: "m" + index, group: index < 2 ? "rate" : index < MARKINGS.length - 1 ? "color" : "final",
        color: MARKING_COLORS[marking] ?? CLEAR_COLOR, emoji: marking, label: "Mark " + marking,
        key: String(index + 1), marking})),
      {id: "clear", group: "clear", color: CLEAR_COLOR, icon: "eraser", label: "Remove marking", key: "0", marking: null}
    ];

  const result = [];

  for (const group of props.groups) {
    for (const action of group.actions) {
      const alt = props.showAlt && action.alt;
      result.push({id: action.id, group: "g" + group.index, color: GROUP_COLORS[group.index], action,
        icon: alt ? action.alt.icon : action.icon, label: alt ? action.alt.label : action.label,
        key: alt ? "Shift+" + action.key : action.key,
        note: !alt && action.alt ? `Middle: ${action.alt.label[0].toLowerCase()}${action.alt.label.slice(1)}` : null});
    }

    if (group.index === 3 && props.deletable)
      result.push({id: "delete", group: "delete", color: DELETE_COLOR, icon: "trash", label: props.deleteLabel, key: "Del", strong: true});
  }

  return result;
});

/**
 * Angles of the sectors (degrees clockwise from the top), wider gaps between the groups. Rotated so that
 * Delete (Remove marking) is at the bottom, or else the gap before the generate group
 */
const sectors = computed(() => {
  const list = items.value;
  const count = list.length;

  if (!count)
    return [];

  const isGroupEnd = i => list[i].group !== list[(i + 1) % count].group;
  let groupGaps = 0;

  for (let i = 0; i < count; i++)
    if (isGroupEnd(i))
      groupGaps++;

  const span = (360 - groupGaps * GROUP_GAP) / count;
  let angle = 0;

  const result = list.map((item, i) => {
    const sector = {item, start: angle + ITEM_GAP / 2, end: angle + span - ITEM_GAP / 2};
    angle += span + (isGroupEnd(i) ? GROUP_GAP : 0);
    return sector;
  });

  const bottom = result.find(s => s.item.id === "delete" || s.item.id === "clear");
  let anchor;

  if (bottom)
    anchor = (bottom.start + bottom.end) / 2;
  else {
    const first = result.findIndex(s => s.item.group === "g1");
    const before = result[(first > 0 ? first : count) - 1];
    anchor = before.end + (ITEM_GAP + (first > 0 ? GROUP_GAP : 0)) / 2;
  }

  const shift = 180 - anchor;

  for (const sector of result) {
    sector.start += shift;
    sector.end += shift;
  }

  return result;
});

// The arcs outside the ring: the markings centered at the top, the extras at the bottom
const arcSectors = computed(() => {
  const result = [];

  if (props.markingArc) {
    const first = -MARKINGS.length * MARKING_SPAN / 2;

    MARKINGS.forEach((marking, index) => {
      const active = props.marking === marking;
      const start = first + index * MARKING_SPAN;
      result.push({item: {id: "m" + index, arc: "marking", color: MARKING_COLORS[marking] ?? CLEAR_COLOR, emoji: marking,
        label: active ? "Remove marking" : "Mark " + marking, key: String(index + 1), marking, strong: active},
        start: start + ITEM_GAP / 2, end: start + MARKING_SPAN - ITEM_GAP / 2});
    });
  }

  const first = 180 - props.extras.length * EXTRA_SPAN / 2;

  props.extras.forEach((extra, index) => {
    const start = first + index * EXTRA_SPAN;
    result.push({item: {...extra, arc: "extra", color: GROUP_COLORS[0]},
      start: start + ITEM_GAP / 2, end: start + EXTRA_SPAN - ITEM_GAP / 2});
  });

  return result;
});

function point(radius, angle) {
  const {center} = geometry.value;
  const t = angle * Math.PI / 180;
  return [center + radius * Math.sin(t), center - radius * Math.cos(t)];
}

function sectorPath(inner, outer, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const [x0, y0] = point(outer, start), [x1, y1] = point(outer, end);
  const [x2, y2] = point(inner, end), [x3, y3] = point(inner, start);
  return `M${x0} ${y0}A${outer} ${outer} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 ${large} 0 ${x3} ${y3}Z`;
}

function edgePath(radius, start, end) {
  const [x0, y0] = point(radius, start), [x1, y1] = point(radius, end);
  return `M${x0} ${y0}A${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`;
}

// Dark glass behind the ring, colored edges per group; the hovered sector is brighter and grows outwards
const drawn = computed(() => {
  const {outer, inner, icon, hitOuter} = geometry.value;

  const ring = sectors.value.map(({item, start, end}) => {
    const hovered = hoveredId.value === item.id;
    const radius = outer + (hovered ? 4 : 0);
    const [x, y] = point((outer + inner) / 2 + (hovered ? 2 : 0), (start + end) / 2);

    return {
      item,
      fill: rgba(item.color, hovered ? 0.5 : item.strong ? 0.34 : 0.14),
      shape: sectorPath(inner, radius, start, end),
      edge: edgePath(radius - 1.5, start, end),
      hit: sectorPath(inner - 4, hitOuter, start - 0.6, end + 0.6),
      x, y,
      iconTransform: `translate(${x - icon / 2} ${y - icon / 2}) scale(${icon / 24})`
    };
  });

  return [...ring, ...drawnArcs.value];
});

// The arcs have no glass behind them, so each sector gets a dark underlay of its own
const drawnArcs = computed(() => {
  const {arcInner, arcOuter, icon} = geometry.value;

  return arcSectors.value.map(({item, start, end}) => {
    const hovered = hoveredId.value === item.id;
    const radius = arcOuter + (hovered ? 3 : 0);
    const [x, y] = point((arcInner + arcOuter) / 2 + (hovered ? 1.5 : 0), (start + end) / 2);
    const shape = sectorPath(arcInner, radius, start, end);

    return {
      item,
      under: shape,
      fill: rgba(item.color, hovered ? 0.5 : item.strong ? 0.42 : 0.16),
      shape,
      edge: edgePath(radius - 1.5, start, end),
      hit: sectorPath(arcInner - ARC_GAP / 2, arcOuter + HIT_OUTSIDE, start - 0.6, end + 0.6),
      x, y,
      iconTransform: `translate(${x - icon / 2} ${y - icon / 2}) scale(${icon / 24})`
    };
  });
});

const boxStyle = computed(() => {
  const {box} = geometry.value;
  return {width: box + "px", height: box + "px", margin: `${-box / 2}px 0 0 ${-box / 2}px`};
});

const glassStyle = computed(() => {
  const {outer, inner, center} = geometry.value;
  const mask = `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner}px)`;
  return {left: center - outer + "px", top: center - outer + "px", width: 2 * outer + "px", height: 2 * outer + "px",
    maskImage: mask, webkitMaskImage: mask};
});

const labelStyle = computed(() => {
  const {inner, center} = geometry.value;
  const diameter = 2 * (inner - 5);
  return {left: center - diameter / 2 + "px", top: center - diameter / 2 + "px", width: diameter + "px", height: diameter + "px"};
});

const hoveredItem = computed(() => items.value.find(item => item.id === hoveredId.value)
  ?? arcSectors.value.find(sector => sector.item.id === hoveredId.value)?.item ?? null);

const closeHub = computed(() => props.hub === "close");

const centerText = computed(() => closeHub.value ? "Close" : mode.value === "markings" ? "Back to actions"
  : props.marking ? "Change marking" : "Add marking");

const centerKey = computed(() => closeHub.value ? "Esc" : mode.value === "actions" ? "1–9" : null);

const centerNote = computed(() => closeHub.value || mode.value !== "actions" || !props.marking || !props.filterable ? null
  : props.filterActive ? "Middle: show all images" : "Middle: show only " + props.marking);

function onSectorClick(item, e) {
  activate(item, e.shiftKey);
}

function activate(item, shift) {
  if (item.id === "delete")
    emit("delete");
  else if (item.arc === "marking")
    emit("setMarking", item.marking);
  else if (item.arc === "extra")
    emit("extra", item.id);
  else if (mode.value === "markings") {
    emit("setMarking", item.marking);
    mode.value = "actions";
    hoveredId.value = null;
  }
  else
    emit("run", item.action, shift);
}

/**
 * The center ("center"), the item at a point of the window, or null. Found by the geometry, not by the hover,
 * since a rim that appears under a resting pointer gets no pointerenter until the pointer moves
 */
function itemAt(clientX, clientY) {
  const rect = root.value?.getBoundingClientRect();

  if (!rect)
    return null;

  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  const {inner, hitOuter, arcOuter} = geometry.value;

  if (distance < inner - 4)
    return "center";

  const list = distance <= hitOuter ? sectors.value
    : hasArcs.value && distance <= arcOuter + HIT_OUTSIDE ? arcSectors.value : [];
  const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  const within = ({start, end}) => ((angle - start + 0.6) % 360 + 360) % 360 <= end - start + 1.2;

  return list.find(within)?.item ?? null;
}

/**
 * The end of a press-and-release gesture: runs the item at a point of the window, as a click on it would.
 * The center runs nothing (the gesture is cancelled or the rim stays for clicks)
 * @returns {"center"|"item"|null} what was at the point
 */
function releaseAt(clientX, clientY, shift = false) {
  const target = itemAt(clientX, clientY);

  if (target && target !== "center")
    activate(target, shift);

  return target === "center" ? "center" : target ? "item" : null;
}

defineExpose({releaseAt});

function onSectorAuxClick(item, e) {
  if (e.button === 1 && item.action?.alt)
    emit("run", item.action, true);
}

function onSectorLeave(item) {
  if (hoveredId.value === item.id)
    hoveredId.value = null;
}

function onCenterClick() {
  if (closeHub.value) {
    emit("close");
    return;
  }

  mode.value = mode.value === "actions" ? "markings" : "actions";
  hoveredId.value = null;
}

function onCenterAuxClick(e) {
  if (e.button === 1 && props.marking && props.filterable && mode.value === "actions")
    emit("filterMarking", props.marking);
}

// The ring is faint while the pointer is outside it, near the card edge
function onPointerMove(e) {
  const rect = root.value?.getBoundingClientRect();

  if (!rect)
    return;

  const {outer} = geometry.value;
  const distance = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
  far.value = distance > outer + 22;
}

let pointerSource = null;

onMounted(() => {
  if (!props.dimFar)
    return;

  pointerSource = root.value?.parentElement;
  pointerSource?.addEventListener("pointermove", onPointerMove);
});

onBeforeUnmount(() => pointerSource?.removeEventListener("pointermove", onPointerMove));
</script>

<template>
  <div ref="root" class="action-rim" :class="{far, labelled: !!hoveredItem || centerHovered, 'center-hovered': centerHovered}"
       :style="boxStyle">
    <div class="rim-glass" :style="glassStyle"></div>

    <svg class="rim-ring" :width="geometry.box" :height="geometry.box">
      <defs>
        <filter :id="shadowId" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.7"/>
        </filter>
      </defs>
      <g v-for="sector in drawn" :key="sector.item.id">
        <path v-if="sector.under" :d="sector.under" fill="rgba(10, 12, 18, 0.55)"/>
        <path :d="sector.shape" :fill="sector.fill"/>
        <path :d="sector.edge" :stroke="sector.item.color" stroke-width="3" fill="none"/>
        <text v-if="sector.item.emoji" :x="sector.x" :y="sector.y + 1" text-anchor="middle" dominant-baseline="central"
              :font-size="geometry.icon - 1">{{ sector.item.emoji }}</text>
        <g v-else :transform="sector.iconTransform" fill="none" stroke="#fff" color="#fff" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" :filter="`url(#${shadowId})`"
           v-html="ICON_PATHS[sector.item.icon]"></g>
        <path class="rim-hit" :d="sector.hit" fill="transparent" :aria-label="sector.item.label"
              @pointerenter="hoveredId = sector.item.id"
              @pointerleave="onSectorLeave(sector.item)"
              @click.stop="onSectorClick(sector.item, $event)"
              @mousedown.middle.prevent
              @auxclick="onSectorAuxClick(sector.item, $event)"/>
      </g>
    </svg>

    <div class="rim-label" :style="labelStyle">
      <template v-if="centerHovered">
        <span>{{ centerText }}</span>
        <span class="rim-label-gap"></span>
        <kbd v-if="centerKey">{{ centerKey }}</kbd>
        <span v-if="centerNote" class="rim-label-note">{{ centerNote }}</span>
      </template>
      <template v-else-if="hoveredItem">
        <span>{{ hoveredItem.label }}</span>
        <kbd v-if="hoveredItem.key">{{ hoveredItem.key }}</kbd>
        <span v-if="hoveredItem.note" class="rim-label-note">{{ hoveredItem.note }}</span>
      </template>
    </div>

    <button class="rim-center" :class="{back: mode === 'markings', close: closeHub}"
            :aria-label="centerText"
            @click.stop="onCenterClick"
            @mousedown.middle.prevent
            @auxclick="onCenterAuxClick"
            @pointerenter="centerHovered = true"
            @pointerleave="centerHovered = false">
      <svg v-if="closeHub" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="ICON_PATHS.close"></svg>
      <span v-else-if="mode === 'actions' && marking" class="rim-center-marking">{{ marking }}</span>
      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <g v-if="mode === 'actions'" v-html="ICON_PATHS.tag"></g>
        <template v-else>
          <circle cx="12" cy="12" r="8" stroke-dasharray="5.3 3"/>
          <circle cx="12" cy="12" r="1.5" fill="#fff"/>
        </template>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.action-rim {
  --marking-ring: conic-gradient(#4ade80, #fb7185, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #e5e7eb, #4ade80);
  position: absolute;
  left: 50%;
  top: 50%;
  line-height: normal;
  pointer-events: none;
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .action-rim {
    transition: none;
  }
}

.action-rim.far {
  opacity: 0.42;
}

.rim-ring {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
}

.rim-glass {
  position: absolute;
  border-radius: 50%;
  background: rgba(12, 14, 20, 0.46);
  backdrop-filter: blur(6px) saturate(1.15);
}

.rim-hit {
  pointer-events: all;
  cursor: pointer;
}

.rim-label {
  position: absolute;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 50%;
  background: rgba(10, 12, 18, 0.74);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 10.5px;
  line-height: 1.22;
  text-align: center;
  pointer-events: none;
}

.action-rim.labelled .rim-label {
  display: flex;
}

.rim-label kbd {
  padding: 0 4px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 3px;
  font-family: inherit;
  font-size: 9.5px;
}

.rim-label-note {
  font-size: 9.5px;
  opacity: 0.75;
}

.rim-label-gap {
  flex: none;
  height: 36px;
}

/* Ringed with the marking colors, so that it reads as the markings */
.rim-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  box-sizing: border-box;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: radial-gradient(circle closest-side, rgba(10, 12, 18, 0.6) calc(100% - 3px), transparent calc(100% - 2.5px)),
    var(--marking-ring);
  backdrop-filter: blur(4px);
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 0.1s, transform 0.1s;
}

.rim-center:hover {
  transform: scale(1.12);
  background: radial-gradient(circle closest-side, rgba(10, 12, 18, 0.85) calc(100% - 3px), transparent calc(100% - 2.5px)),
    var(--marking-ring);
}

.rim-center.back {
  border: 1.5px dashed rgba(255, 255, 255, 0.8);
  background: rgba(10, 12, 18, 0.6);
}

.rim-center.back:hover {
  background: rgba(10, 12, 18, 0.85);
}

/* Closes the image overlay: larger, plain */
.rim-center.close {
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border: 1.5px solid rgba(255, 255, 255, 0.75);
  background: rgba(10, 12, 18, 0.7);
}

.rim-center.close:hover {
  background: rgba(10, 12, 18, 0.9);
}

.action-rim.labelled:not(.center-hovered) .rim-center {
  opacity: 0;
}

.rim-center-marking {
  font-size: 15px;
  line-height: 1;
}
</style>
