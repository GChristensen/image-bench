<script setup>
  import {computed, nextTick, ref, watch} from "vue";
  import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {useShiftKey} from "@/composables/useShiftKey.js";
  import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
  import {visibleActionGroups, runImageAction, imageActionHint} from "@/imageActions.js";
  import {openImageMenu} from "@/contextMenu.js";
  import {startImageDrag, endImageDrag} from "@/imageDrag.js";
  import {isWebUI} from "@/host.js";
  import AppIcon from "@/components/AppIcon.vue";
  import ImageActionButtons from "@/components/ImageActionButtons.vue";
  import MarkingPicker from "@/components/MarkingPicker.vue";

  const emit = defineEmits(['setMarking', 'filterMarking', 'imageClick', 'imageOpen', 'showParams',
    'select', 'upscaleImage', 'addComment', 'deleteImage']);

  const props = defineProps({
    isTray: {
      type: Boolean,
      required: true
    },
    kind: {
      type: String,
      required: true,
      validator: (value) => ['generated', 'image-tray', 'concept-tray', 'upscaled', 'explore'].includes(value)
    },
    image: {
      type: Object,
      required: true
    },
    selectable: {
      type: Boolean,
      default: false
    },
    displayed: {
      type: Boolean,
      default: true
    },
    upscalable: {
      type: Boolean,
      default: false
    },
    selected: {
      type: Boolean,
      default: false
    },
    highlighted: {
      type: Boolean,
      default: false
    },
    // Marking the view is filtered by, if any
    markingFilter: {
      type: String,
      default: null
    }
  });

  const rootElement = ref(null);

  // Bring the thumbnail into view when it gets highlighted (e.g. after its preview overlay is closed)
  watch(() => props.highlighted, async (highlighted) => {
    if (highlighted) {
      await nextTick();
      rootElement.value?.scrollIntoView({block: "nearest", inline: "nearest"});
    }
  });

  const sdWebUIStore = useSDWebUIStateStore();
  const imageOps = useImageOperations();
  const shiftDown = useShiftKey();

  // Context of the image actions (imageActions.js)
  const actionContext = {
    get kind() { return props.kind; },
    get isTray() { return props.isTray; },
    get upscalable() { return props.upscalable; },
    handlers: {
      showParams: () => emit("showParams"),
      upscale: image => emit("upscaleImage", image),
      addComment: image => emit("addComment", image),
      openImage: () => emit("imageOpen"),
      filterMarking: marking => emit("filterMarking", marking),
      removeMarking: () => removeMarking(),
      deleteImage: () => emit("deleteImage"),
      activeMarkingFilter: () => props.markingFilter
    }
  };

  const leftGroups = computed(() => visibleActionGroups(props.image, actionContext, "left"));
  const rightGroups = computed(() => visibleActionGroups(props.image, actionContext, "right"));

  // Shift over the card shows the alternative actions of the buttons that have one
  const hovered = ref(false);
  const hoveredAction = ref(null);
  const showAlt = computed(() => hovered.value && shiftDown.value);
  // Badges and markings show their description in the same place instead of a tooltip;
  // a function keeps it current while the pointer stays (e.g. after toggling the marking filter)
  const hoveredText = ref(null);
  const hint = computed(() => hoveredAction.value
    ? imageActionHint(hoveredAction.value, showAlt.value)
    : typeof hoveredText.value === "function" ? hoveredText.value() : hoveredText.value);

  const markingHint = () => props.markingFilter === props.image.marking
    ? "Click: show all images · Middle: remove marking"
    : "Click: show only this marking · Middle: remove marking";

  function onFrameEnter() {
    hovered.value = true;
    setHoveredImageTarget({getImage: () => props.image, ctx: actionContext, element: rootElement.value});
  }

  function onFrameLeave() {
    hovered.value = false;
    hoveredAction.value = null;
    hoveredText.value = null;
    clearHoveredImageTarget(rootElement.value);
  }

  function onAction(action, alt) {
    runImageAction(action, props.image, actionContext, alt);
  }

  // The card is dragged by its image, so that the buttons and markings do not start drags
  const dragging = ref(false);

  function onDragStart(e) {
    startImageDrag(e, props.image, props.kind);
    dragging.value = true;
  }

  function onDragEnd() {
    endImageDrag();
    dragging.value = false;
  }

  function onImageAuxClick(e) {
    if (e.button === 1)
      emit("imageOpen");
  }

  function onMarkingAuxClick(e) {
    if (e.button === 1)
      removeMarking();
  }

  // The marking and the picker replace each other under the pointer without a mouseleave
  function setMarking(marking) {
    hoveredText.value = null;
    props.image.marking = marking;
    emit("setMarking");
  }

  function removeMarking() {
    hoveredText.value = null;
    delete props.image.marking;
    emit("setMarking");
  }

  // An image without a negative prompt has no "negative prompt" parameter, as WebUI omits it from the infotext
  function samePrompt(imagePrompt, prompt) {
    return (imagePrompt ?? "").trim() === (prompt ?? "").trim();
  }

  // The txt2img prompts are reported by WebUI only
  function needShowPromptWarning(image) {
    return isWebUI && !image.img2img
        && (!samePrompt(image.parameters["prompt"], sdWebUIStore.prompt)
        || !samePrompt(image.parameters["negative prompt"], sdWebUIStore.negativePrompt));
  }

</script>

<template>
<div v-if="displayed" ref="rootElement" class="selectable-image" :class="{selected, highlighted, dragging}">
  <div class="image-separator" v-if="image.separator">◇</div>
  <div v-else class="image-frame" @mouseenter="onFrameEnter" @mouseleave="onFrameLeave"
       @contextmenu="openImageMenu($event, image, actionContext)">
    <img class="selectable-image-preview"
         :src="imageOps.getImageLink(image)"
         :title="imageOps.createImageTooltip(image)"
         @click="$emit('imageClick')"
         @mousedown.middle.prevent
         @auxclick="onImageAuxClick"
         @dragstart="onDragStart"
         @dragend="onDragEnd">

    <span v-if="image.tagColor" class="tag-bar" :style="{background: image.tagColor}"></span>

    <label v-if="selectable" class="select-box"
           @mouseenter="hoveredText = () => selected ? 'Unselect' : 'Select'" @mouseleave="hoveredText = null">
      <input type="checkbox" aria-label="Select image" :checked="selected"
             @change="$emit('select', $event.target.checked)">
      <span class="select-circle"><AppIcon name="check" :size="12"/></span>
    </label>

    <div v-if="image.comment" class="image-comment" :class="{selectable}" :title="image.comment"
         @click="$emit('imageClick')">{{ image.comment }}</div>

    <!-- One shared row, so the left group wraps only when the whole width runs out -->
    <div class="image-actions-bar" :class="{selectable}">
      <ImageActionButtons v-for="(side, sideIndex) in [leftGroups, rightGroups]" :key="sideIndex"
                          :class="sideIndex ? 'right' : 'left'" :groups="side" :show-alt="showAlt"
                          @run="onAction" @hover="action => hoveredAction = action"/>
    </div>

    <!-- One row, so that the hint never covers the badges; it wraps upwards if narrow -->
    <div class="image-bottom-bar">
      <!-- Explore images compare models, so they show no badges or markings -->
      <div v-if="kind !== 'explore'" class="image-badges">
        <span v-if="image.parameters['hires upscale']" class="badge hr"
              @mouseenter="hoveredText = 'Upscaled'" @mouseleave="hoveredText = null">HR</span>
        <span v-if="image.img2img" class="badge i2i"
              @mouseenter="hoveredText = 'Img2Img image'" @mouseleave="hoveredText = null">I2I</span>
        <span v-if="image.setSteps" class="badge steps"
              @mouseenter="hoveredText = `Upscaled with ${image.parameters['steps']} sampling steps`"
              @mouseleave="hoveredText = null">{{ image.parameters['steps'] }} st</span>
        <span v-if="needShowPromptWarning(image)" class="badge warn"
              @mouseenter="hoveredText = 'Image prompt and Txt2Img prompt do not match'"
              @mouseleave="hoveredText = null"
          ><AppIcon name="alert" :size="11"/></span>
      </div>

      <span v-if="hint" class="action-hint">{{ hint }}</span>

      <span v-if="image.marking && kind !== 'explore'" class="image-marking" :class="{active: markingFilter === image.marking}"
            @mouseenter="hoveredText = markingHint"
            @mouseleave="hoveredText = null"
            @click="$emit('filterMarking', image.marking)"
            @mousedown.middle.prevent
            @auxclick="onMarkingAuxClick">{{ image.marking }}</span>

      <!-- Without a marking, the badge opens the markings upwards on hover -->
      <MarkingPicker v-else-if="isTray" class="card-marking-picker" @set="setMarking"
                     @mouseenter="hoveredText = 'Set a marking'" @mouseleave="hoveredText = null"/>
    </div>
  </div>
</div>
</template>

<style scoped>
/* The width cap lives here only: a percentage max-width on the img is ignored when sizing
   this flex item, so a separate vw cap there would leave the frame wider than the image */
.selectable-image {
  max-width: min(30%, 27vw);
  height: max-content;
}

.image-frame {
  position: relative;
  display: inline-block;
  vertical-align: top;
  line-height: 0;
  border-radius: 4px;
  overflow: hidden;
}

.selectable-image.selected .image-frame {
  box-shadow: 0 0 0 2px var(--ib-accent);
}

.selectable-image.dragging .image-frame {
  opacity: 0.5;
}

.selectable-image.highlighted .image-frame {
  outline: 2px solid transparent;
  outline-offset: 2px;
  animation: highlightFade 2.5s ease-in forwards;
}

@keyframes highlightFade {
  0%, 40% { outline-color: var(--ib-info); }
  100%    { outline-color: transparent; }
}

.selectable-image-preview {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 70vh;
  cursor: pointer;
}

.tag-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
}

/* Circular outline check: deliberately unlike the square filled action buttons */
.select-box {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: normal;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.select-box input {
  position: absolute;
  width: 0;
  height: 0;
  margin: 0;
  opacity: 0;
}

.select-circle {
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.5);
  color: transparent;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.select-box:hover .select-circle {
  border-color: #fff;
  transform: scale(1.1);
}

.selectable-image.selected .select-circle {
  background: var(--ib-accent);
  border-color: var(--ib-accent);
  color: #fff;
}

.select-box input:focus-visible + .select-circle {
  outline: 2px solid var(--ib-accent);
  outline-offset: 2px;
}

.selectable-image.selected .select-box,
.image-frame:hover .select-box {
  opacity: 1;
}

/* The bar itself never takes clicks, so gaps between the groups fall through to the image */
.image-actions-bar {
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  align-items: flex-start;
  gap: 3px;
  line-height: normal;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

/* Leave room for the select checkbox */
.image-actions-bar.selectable {
  left: 40px;
}

.image-actions.left {
  flex: 0 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.image-actions.right {
  flex: none;
  margin-left: auto;
}

.image-frame:hover .image-actions-bar {
  opacity: 1;
}

.image-frame:hover .image-actions {
  pointer-events: auto;
}

/* Below the button row, always shown */
.image-comment {
  position: absolute;
  top: 31px;
  left: 6px;
  right: 6px;
  width: fit-content;
  max-width: calc(100% - 12px);
  box-sizing: border-box;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.6);
  color: var(--ib-text);
  font-size: 11px;
  line-height: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.image-comment.selectable {
  left: 40px;
  max-width: calc(100% - 46px);
}

/* The bar itself never takes clicks, so the gaps between its items fall through to the image */
.image-bottom-bar {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: flex-end;
  gap: 3px;
  line-height: normal;
  pointer-events: none;
}

.image-bottom-bar > * {
  pointer-events: auto;
}

.image-badges {
  display: flex;
  gap: 3px;
}

.image-badges .badge {
  cursor: default;
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
  pointer-events: none;
}

.image-marking {
  margin-left: auto;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  font-size: 14px;
  line-height: normal;
  cursor: pointer;
}

.image-marking.active {
  box-shadow: inset 0 0 0 1px var(--ib-accent);
}

.card-marking-picker {
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.image-frame:hover .card-marking-picker {
  opacity: 1;
}

.image-separator {
  color: var(--ib-muted);
  font-size: 120%;
  font-weight: bold;
}
</style>
