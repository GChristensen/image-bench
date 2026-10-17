<script setup>
  import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
  import {syncTrayMarkings} from "@/stores/trayMarkings.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {useShiftKey} from "@/composables/useShiftKey.js";
  import {useCtrlKey} from "@/composables/useCtrlKey.js";
  import {setHoveredImageTarget, clearHoveredImageTarget} from "@/composables/useImageActionKeys.js";
  import {rimActionGroups, runImageAction} from "@/imageActions.js";
  import {openImageMenu} from "@/contextMenu.js";
  import {startImageDrag, endImageDrag} from "@/imageDrag.js";
  import {useAppConfigStore} from "@/stores/appConfig.js";
  import AppIcon from "@/components/AppIcon.vue";
  import ActionRim from "@/components/ActionRim.vue";

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
    },
    // The view removes the image on deleteImage (the rim shows Delete)
    deletable: {
      type: Boolean,
      default: false
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
      // Explore has no marking filter
      get filterMarking() { return props.kind === "explore" ? null : marking => emit("filterMarking", marking); },
      setMarking: (image, marking) => setMarking(marking),
      removeMarking: () => removeMarking(),
      deleteImage: () => emit("deleteImage"),
      activeMarkingFilter: () => props.markingFilter
    }
  };

  const rimGroups = computed(() => rimActionGroups(props.image, actionContext));
  // Explore shows no marking filter
  const filterable = computed(() => props.kind !== "explore");

  // Shift over the card shows the alternative actions of the sectors that have one
  const hovered = ref(false);
  const showAlt = computed(() => hovered.value && shiftDown.value);
  // The card is dragged by its image, so that the rim and the markings do not start drags
  const dragging = ref(false);
  // The rim shows while Ctrl is held over the card or its rim toggle is on. With the rimOnHover setting it opens
  // on hover instead, and Ctrl hides all chrome, so that a click on the bare image opens the overlay
  const config = useAppConfigStore();
  const hoverMode = computed(() => config.rimOnHover);
  const ctrlDown = useCtrlKey();
  const bare = computed(() => hoverMode.value && hovered.value && ctrlDown.value);
  const rimToggled = ref(false);
  // Badges and markings show their description in the same place instead of a tooltip;
  // a function keeps it current while the pointer stays (e.g. after toggling the marking filter)
  const hoveredText = ref(null);
  const hint = computed(() => typeof hoveredText.value === "function" ? hoveredText.value() : hoveredText.value);

  const markingHint = () => !filterable.value ? "Middle: remove marking"
    : props.markingFilter === props.image.marking
    ? "Click: show all images · Middle: remove marking"
    : "Click: show only this marking · Middle: remove marking";

  // On hover the action rim opens after a short delay, so that it does not flash on the cards the pointer crosses
  const RIM_DELAY = 100;
  const frameElement = ref(null);
  const rimOpen = ref(false);
  const rimSize = ref(0);
  let rimTimer = 0;

  const rimShown = computed(() => hoverMode.value ? rimOpen.value && !bare.value
    : hovered.value && !dragging.value && (ctrlDown.value || rimToggled.value));

  watch(rimShown, shown => {
    const frame = frameElement.value;

    if (shown && frame)
      rimSize.value = Math.min(frame.clientWidth, frame.clientHeight);
  });

  const rimToggleText = () => rimToggled.value ? "Hide actions" : "Show actions (or hold Ctrl)";

  function openRim() {
    if (!dragging.value)
      rimOpen.value = true;
  }

  function closeRim() {
    clearTimeout(rimTimer);
    rimOpen.value = false;
  }

  onBeforeUnmount(() => clearTimeout(rimTimer));

  function onFrameEnter() {
    hovered.value = true;
    setHoveredImageTarget({getImage: () => props.image, ctx: actionContext, element: rootElement.value,
      setMarking, view: () => emit("imageClick")});
    clearTimeout(rimTimer);

    if (hoverMode.value)
      rimTimer = setTimeout(openRim, RIM_DELAY);
  }

  function onFrameLeave() {
    hovered.value = false;
    hoveredText.value = null;
    rimToggled.value = false;
    closeRim();
    clearHoveredImageTarget(rootElement.value);
  }

  function onAction(action, alt) {
    runImageAction(action, props.image, actionContext, alt);
  }

  function onDragStart(e) {
    closeRim();
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

  // null removes the marking (the rim's Remove marking, the 0 key)
  function setMarking(marking) {
    if (!marking)
      return removeMarking();

    hoveredText.value = null;
    props.image.marking = marking;
    markingChanged();
  }

  function removeMarking() {
    hoveredText.value = null;
    delete props.image.marking;
    markingChanged();
  }

  function markingChanged() {
    syncTrayMarkings(props.image, props.kind, props.isTray);
    emit("setMarking");
  }
</script>

<template>
<div v-if="displayed" ref="rootElement" class="selectable-image"
     :class="{selected, highlighted, dragging, separator: image.separator}">
  <div class="image-separator" v-if="image.separator"></div>
  <div v-else ref="frameElement" class="image-frame" :class="{bare}" @mouseenter="onFrameEnter" @mouseleave="onFrameLeave"
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

    <!-- Before the other controls, which stay above it where a small card overlaps them -->
    <Transition name="rim">
      <ActionRim v-if="rimShown" :groups="rimGroups" :size="rimSize" :marking="image.marking ?? null"
                 :show-alt="showAlt" :deletable="deletable" :filterable="filterable" :dim-far="hoverMode"
                 :filter-active="!!image.marking && markingFilter === image.marking"
                 @run="onAction" @delete="$emit('deleteImage')" @set-marking="setMarking"
                 @filter-marking="marking => $emit('filterMarking', marking)"/>
    </Transition>

    <label v-if="selectable" class="select-box"
           @mouseenter="hoveredText = () => selected ? 'Unselect' : 'Select'" @mouseleave="hoveredText = null">
      <input type="checkbox" aria-label="Select image" :checked="selected"
             @change="$emit('select', $event.target.checked)">
      <span class="select-circle"><AppIcon name="check" :size="12"/></span>
    </label>

    <!-- Rim on hover: visual anchor for viewing the image; it opens the overlay like a click on the image -->
    <button v-if="hoverMode" type="button" class="corner-button" aria-label="View image"
            @click="$emit('imageClick')" @mousedown.middle.prevent @auxclick="onImageAuxClick"
            @mouseenter="hoveredText = 'View'" @mouseleave="hoveredText = null"
      ><AppIcon name="eye" :size="20"/></button>
    <!-- Otherwise it shows and hides the action rim -->
    <button v-else type="button" class="corner-button" :class="{on: rimToggled}" :aria-pressed="rimToggled"
            aria-label="Show actions" @click="rimToggled = !rimToggled"
            @mouseenter="hoveredText = rimToggleText" @mouseleave="hoveredText = null"
      ><AppIcon name="rim" :size="20"/></button>

    <div v-if="image.comment" class="image-comment" :class="{selectable}" :title="image.comment"
         @click="$emit('imageClick')">{{ image.comment }}</div>

    <!-- One row, so that the hint never covers the badges; it wraps upwards if narrow -->
    <div class="image-bottom-bar">
      <!-- Explore images compare models, so they show no badges (markings set in the overlay are shown) -->
      <div v-if="kind !== 'explore'" class="image-badges">
        <span v-if="image.parameters['hires upscale']" class="badge hr"
              @mouseenter="hoveredText = 'Upscaled'" @mouseleave="hoveredText = null">HR</span>
        <span v-if="image.img2img" class="badge i2i"
              @mouseenter="hoveredText = 'Img2Img image'" @mouseleave="hoveredText = null">I2I</span>
        <span v-if="image.setSteps" class="badge steps"
              @mouseenter="hoveredText = `Upscaled with ${image.parameters['steps']} sampling steps`"
              @mouseleave="hoveredText = null">{{ image.parameters['steps'] }} st</span>
      </div>

      <span v-if="hint" class="action-hint">{{ hint }}</span>

      <span v-if="image.marking" class="image-marking" :class="{active: markingFilter === image.marking}"
            @mouseenter="hoveredText = markingHint"
            @mouseleave="hoveredText = null"
            @click="$emit('filterMarking', image.marking)"
            @mousedown.middle.prevent
            @auxclick="onMarkingAuxClick">{{ image.marking }}</span>
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
}

/* The action rim of a small card reaches over its neighbors */
.image-frame:hover {
  z-index: 2;
}

.rim-enter-from,
.rim-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

/* Ctrl held with the rim on hover: the bare image (but the batch color bar), a click opens the overlay */
.image-frame.bare .select-box,
.image-frame.bare .corner-button,
.image-frame.bare .image-comment,
.image-frame.bare .image-bottom-bar {
  display: none;
}

.image-frame.bare .selectable-image-preview {
  cursor: zoom-in;
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
  border-radius: 4px;
  cursor: pointer;
}

.tag-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  border-radius: 4px 0 0 4px;
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

/* Always shown */
.image-comment {
  position: absolute;
  top: 6px;
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

/* Clear of the corner button at the right */
.image-comment {
  max-width: calc(100% - 46px);
}

.image-comment.selectable {
  left: 40px;
  max-width: calc(100% - 80px);
}

/* View eye or rim toggle. No background: white with a shadow, like the select circle */
.corner-button {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: rgba(255, 255, 255, 0.9);
  line-height: normal;
  cursor: pointer;
  opacity: 0;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  transition: opacity 0.15s, transform 0.15s;
}

.corner-button:hover {
  color: #fff;
  transform: scale(1.1);
}

.corner-button:focus-visible {
  outline: 2px solid var(--ib-accent);
  outline-offset: -2px;
}

.corner-button.on {
  color: var(--ib-accent);
}

.image-frame:hover .corner-button {
  opacity: 1;
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

/* A batch separator spans the height of its row of cards */
.selectable-image.separator {
  align-self: stretch;
  display: flex;
  height: auto;
  min-height: 48px;
}

.image-separator {
  width: 2px;
  margin: 4px 0;
  border-radius: 1px;
  background: var(--ib-muted);
  opacity: .6;
}
</style>
