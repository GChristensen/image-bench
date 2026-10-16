<script setup>
import {computed, ref, watch} from "vue";
import {visibleActionGroups, runImageAction, imageActionHint} from "@/imageActions.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import AppIcon from "@/components/AppIcon.vue";
import ImageActionButtons from "@/components/ImageActionButtons.vue";
import MarkingPicker from "@/components/MarkingPicker.vue";

/**
 * Index badge, image actions, remove button and marking shown over an image of the Compare tab (strip item or crop
 * cell). The root takes no pointer events, so that drags on the image reach the view; its controls do. Their clicks
 * stop here: a control may re-render away before the click bubbles on (the marking and its picker replace each
 * other), so the image could no longer tell it came from the chrome.
 */
const props = defineProps({
  image: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  // Action context (imageActions.js)
  ctx: {
    type: Object,
    required: true
  },
  // The pointer is over the image: Shift shows the alternative actions
  hovered: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["remove", "setMarking", "open"]);

const shiftDown = useShiftKey();
const leftGroups = computed(() => visibleActionGroups(props.image, props.ctx, "left"));
const rightGroups = computed(() => visibleActionGroups(props.image, props.ctx, "right"));
const showAlt = computed(() => props.hovered && shiftDown.value);
const hoveredAction = ref(null);
const hoveredText = ref(null);
const hint = computed(() => hoveredAction.value ? imageActionHint(hoveredAction.value, showAlt.value) : hoveredText.value);

watch(() => props.hovered, hovered => {
  if (!hovered) {
    hoveredAction.value = null;
    hoveredText.value = null;
  }
});

function onAction(action, alt) {
  runImageAction(action, props.image, props.ctx, alt);
}

// The marking and the picker replace each other under the pointer without a mouseleave
function setMarking(marking) {
  hoveredText.value = null;
  emit("setMarking", marking);
}

function onMarkingAuxClick(e) {
  if (e.button === 1)
    setMarking(null);
}
</script>

<template>
  <div class="compare-chrome" :class="{hovered}" @click.stop @auxclick.stop>
    <div class="chrome-top">
      <span class="index-badge"><slot name="lead"/>{{ index + 1 }}</span>
      <ImageActionButtons class="chrome-actions left" :groups="leftGroups" :show-alt="showAlt"
                          @run="onAction" @hover="action => hoveredAction = action"/>
      <div class="chrome-actions right">
        <ImageActionButtons :groups="rightGroups" :show-alt="showAlt"
                            @run="onAction" @hover="action => hoveredAction = action"/>
        <button class="ib sm remove-button" aria-label="Remove from compare"
                @mouseenter="hoveredText = 'Remove from compare (the file stays on disk)'"
                @mouseleave="hoveredText = null"
                @click="emit('remove')"><AppIcon name="close" :size="13"/></button>
      </div>
    </div>

    <!-- Below the button row, always shown; a click opens the image like in the trays -->
    <div v-if="image.comment" class="image-comment" :title="image.comment" @click="emit('open')">{{ image.comment }}</div>

    <div class="chrome-bottom">
      <span v-if="hint" class="action-hint">{{ hint }}</span>
      <span v-if="image.marking" class="image-marking"
            @mouseenter="hoveredText = 'Middle: remove marking'" @mouseleave="hoveredText = null"
            @mousedown.middle.prevent @auxclick="onMarkingAuxClick">{{ image.marking }}</span>
      <MarkingPicker v-else class="chrome-picker" @set="setMarking"
                     @mouseenter="hoveredText = 'Set a marking'" @mouseleave="hoveredText = null"/>
    </div>
  </div>
</template>

<style scoped>
.compare-chrome {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
  line-height: normal;
  pointer-events: none;
}

.chrome-top,
.chrome-bottom {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}

.chrome-bottom {
  align-items: flex-end;
}

.index-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 22px;
  height: 22px;
  box-sizing: border-box;
  justify-content: center;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  pointer-events: auto;
}

.chrome-actions.left {
  flex: 0 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.chrome-actions.right {
  display: flex;
  flex: none;
  gap: 3px;
  margin-left: auto;
}

.chrome-top {
  flex: none;
}

.chrome-bottom {
  margin-top: auto;
}

/* Below the button row, as in the trays */
.image-comment {
  align-self: flex-start;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.6);
  color: var(--ib-text);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  pointer-events: auto;
}

.chrome-actions,
.chrome-picker {
  opacity: 0;
  transition: opacity 0.15s;
}

.compare-chrome.hovered .chrome-actions,
.compare-chrome.hovered .chrome-picker {
  opacity: 1;
}

.compare-chrome.hovered .chrome-actions.left,
.compare-chrome.hovered .chrome-actions.right > *,
.compare-chrome.hovered .chrome-picker,
.image-marking {
  pointer-events: auto;
}

.remove-button {
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.remove-button:hover {
  color: var(--ib-danger-text);
  border-color: #5b2d30;
  background: #2a1a1c;
}

.action-hint {
  flex: 1 1 0;
  min-width: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  color: var(--ib-text);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-marking,
.chrome-picker {
  margin-left: auto;
}

.image-marking {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  font-size: 14px;
  cursor: default;
}
</style>
