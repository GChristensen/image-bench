<script setup>
  import {computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
  import {syncTrayMarkings} from "@/stores/trayMarkings.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {HOST_NAME} from "@/host.js";
  import {openImageMenu} from "@/contextMenu.js";
  import {canReuseParameters, reuseParameters, rimActionGroups, runImageAction} from "@/imageActions.js";
  import {setOverlayImageTarget, clearOverlayImageTarget} from "@/composables/useImageActionKeys.js";
  import {useCtrlKey} from "@/composables/useCtrlKey.js";
  import {useShiftKey} from "@/composables/useShiftKey.js";
  import {toast} from "@/toast.js";
  import AppIcon from "@/components/AppIcon.vue";
  import ActionRim from "@/components/ActionRim.vue";
  import GenerationParameters from "@/components/GenerationParameters.vue";
  import GenerationParametersHeader from "@/components/GenerationParametersHeader.vue";
  import ControlNetUnits from "@/components/ControlNetUnits.vue";
  import MediaView from "@/components/MediaView.vue";
  import {isStill, mediaKind} from "@/media.js";

  const props = defineProps({
    image: {
      type: Object,
      required: true
    },
    isTray: {
      type: Boolean,
      default: false
    },
    kind: {
      type: String,
      default: 'generated'
    },
    upscalable: {
      type: Boolean,
      default: false
    },
    // Markings can be set outside the trays too (the Compare tab)
    markable: {
      type: Boolean,
      default: false
    },
    // Marking the view is filtered by, if any
    markingFilter: {
      type: String,
      default: null
    },
    // Show the chevrons that emit navigate(-1 / 1), as the arrow keys of the view do
    hasPrev: {
      type: Boolean,
      default: false
    },
    hasNext: {
      type: Boolean,
      default: false
    },
    // Show the chevrons that emit navigateVertical(-1 / 1), as the up/down keys of the view do (a matrix)
    hasUp: {
      type: Boolean,
      default: false
    },
    hasDown: {
      type: Boolean,
      default: false
    }
  });

  const emit = defineEmits(['hideOverlay', 'imageSelect', 'addToTray', 'setMarking', 'deleteImage',
    'showParams', 'upscaleImage', 'addComment', 'filterMarking', 'navigate', 'navigateVertical']);

  const imageOps = useImageOperations();

  const imageLink = computed(() => imageOps.getImageLink(props.image));
  // A video or audio file plays in the overlay; it has no full size and is not sent where pixels are needed
  const fileKind = computed(() => mediaKind(props.image));
  const still = computed(() => isStill(props.image));

  watch(still, value => {
    if (!value)
      isFullSize.value = false;
  });
  const isFullSize = ref(false);
  const containerElement = ref(null);

  // A newly displayed image (e.g. navigated with arrow keys) keeps the full size and shows the same detail:
  // the relative scroll position is taken before the update and restored when the new image has loaded
  let pendingScroll = null;

  watch(imageLink, () => {
    const container = containerElement.value;

    if (!isFullSize.value || !container)
      return;

    const fraction = (scroll, client, total) => total > client ? scroll / (total - client) : 0.5;
    pendingScroll = {
      x: fraction(container.scrollLeft, container.clientWidth, container.scrollWidth),
      y: fraction(container.scrollTop, container.clientHeight, container.scrollHeight)
    };
  });

  function onImageLoad() {
    const container = containerElement.value;

    if (!pendingScroll || !container)
      return;

    container.scrollLeft = pendingScroll.x * (container.scrollWidth - container.clientWidth);
    container.scrollTop = pendingScroll.y * (container.scrollHeight - container.clientHeight);
    pendingScroll = null;
  }

  // A click on the image toggles full size, a click on the dimmed background around it closes the overlay
  function onContainerClick(e) {
    // The controls of a video or audio file
    if (e.target.closest(".overlay-media"))
      return;

    if (e.target.classList.contains("overlay-image")) {
      if (!dragged)
        toggleFullSize(e);
    }
    else
      emit("hideOverlay");
  }

  // In full size the image is panned by dragging; a drag does not count as a click
  const DRAG_THRESHOLD = 4;
  let dragStart = null;
  let dragged = false;

  function onImageMouseDown(e) {
    dragged = false;

    if (e.button !== 0 || !isFullSize.value)
      return;

    e.preventDefault();
    const container = containerElement.value;
    dragStart = {x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop};
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (!dragged && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
      return;

    dragged = true;
    const container = containerElement.value;
    container.scrollLeft = dragStart.left - dx;
    container.scrollTop = dragStart.top - dy;
  }

  function onDragEnd() {
    dragStart = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  onBeforeUnmount(onDragEnd);

  // The wheel steps through the images as ←/→ do, at fit and in full size alike (full size pans by dragging).
  // Deltas add up to a step, so that a high-resolution wheel does not skip images; a step at most every WHEEL_GAP ms
  const WHEEL_STEP = 40;
  const WHEEL_LINE = 16;
  const WHEEL_GAP = 60;
  let wheelDelta = 0;
  let lastWheelStep = 0;

  function onWheel(e) {
    // The parameters panel scrolls
    if (e.target.closest(".params-panel"))
      return;

    e.preventDefault();

    // Shift+wheel arrives as a horizontal delta
    const delta = (e.deltaY || e.deltaX) * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE : 1);

    if (Math.sign(delta) !== Math.sign(wheelDelta))
      wheelDelta = 0;

    wheelDelta += delta;

    if (Math.abs(wheelDelta) < WHEEL_STEP || e.timeStamp - lastWheelStep < WHEEL_GAP)
      return;

    const direction = Math.sign(wheelDelta);
    wheelDelta = 0;
    lastWheelStep = e.timeStamp;

    if (direction > 0 ? props.hasNext : props.hasPrev)
      emit("navigate", direction);
  }

  async function toggleFullSize(e) {
    const container = containerElement.value;
    const img = e.target;

    if (isFullSize.value) {
      isFullSize.value = false;
      return;
    }

    // Keep the clicked point of the image under the cursor after zooming in
    const rect = img.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;

    isFullSize.value = true;
    await nextTick();

    const fullRect = img.getBoundingClientRect();
    container.scrollLeft += fullRect.left + fx * fullRect.width - e.clientX;
    container.scrollTop += fullRect.top + fy * fullRect.height - e.clientY;
  }

  // Clicking the current marking removes it
  function onMarkingClick(marking) {
    if (props.image.marking === marking)
      delete props.image.marking;
    else
      props.image.marking = marking;

    markingChanged(props.image);
  }

  function markingChanged(image) {
    syncTrayMarkings(image, props.kind, props.isTray);
    emit("setMarking", image);
  }

  // The parameters panel is shown over the image, and stays shown while navigating between images
  const showParamsPanel = ref(false);

  const hasParameters = computed(() => Object.keys(props.image.parameters || {}).length > 0);

  const canReuse = computed(() => canReuseParameters(props.image));

  // Unlike the parameters overlay, the image overlay stays open
  async function onReuse(all) {
    if (await reuseParameters(props.image, all))
      toast(all ? `Parameters set in ${HOST_NAME}` : `Seed set in ${HOST_NAME}`);
  }

  // Only the views that listen to filterMarking filter by markings
  const filters = !!getCurrentInstance()?.vnode.props?.onFilterMarking;

  // Context of the image actions (imageActions.js) for the context menu and the keys
  const actionContext = {
    get kind() { return props.kind; },
    get isTray() { return props.isTray; },
    get upscalable() { return props.upscalable; },
    handlers: {
      showParams: image => emit("showParams", image),
      upscale: image => emit("upscaleImage", image),
      addComment: image => emit("addComment", image),
      openImage: image => imageOps.openImageInNewWindow(image),
      filterMarking: filters ? marking => emit("filterMarking", marking) : null,
      removeMarking: image => {
        delete image.marking;
        markingChanged(image);
      },
      // Where the overlay sets markings (its marking bar, the digit keys)
      get setMarking() {
        return props.isTray || props.markable ? (image, marking) => setMarkingByKey(marking) : null;
      },
      // As the Delete button of the overlay, shown in the trays
      get deleteImage() { return props.isTray ? image => emit("deleteImage", image) : null; },
      activeMarkingFilter: () => props.markingFilter
    }
  };

  // Digits set the markings of tray images: 1-9 as in MARKINGS, 0 removes the marking
  const keyTarget = {
    getImage: () => props.image,
    ctx: actionContext,
    get element() {
      return containerElement.value;
    },
    get setMarking() {
      return props.isTray || props.markable ? setMarkingByKey : null;
    }
  };

  function setMarkingByKey(marking) {
    if (marking)
      onMarkingClick(marking);
    else if (props.image.marking) {
      delete props.image.marking;
      markingChanged(props.image);
    }
  }

  // The overlay has no fixed chrome, the image gets all the space. A middle press shows the action rim at the
  // pointer: released on a sector it runs it, released in the center the rim stays for clicks (its center closes
  // the overlay). Holding Ctrl hides everything but the image
  const ctrlDown = useCtrlKey();
  const shiftDown = useShiftKey();
  const rootElement = ref(null);
  const rimElement = ref(null);
  // {x, y, sticky} while the rim is shown; sticky once the middle button was released in its center
  const rim = ref(null);
  const rimGroups = computed(() => rimActionGroups(props.image, actionContext));
  const rimExtras = computed(() => canReuse.value ? [
    {id: "reuseSeed", icon: "seed", label: "Reuse seed"},
    {id: "reuseAll", icon: "sliders", label: "Reuse all parameters"}
  ] : []);

  // Half the extent of the rim with its arcs (ActionRim at its largest), kept inside the window
  const RIM_EXTENT = 132;

  function showRim(x, y) {
    rim.value = {
      sticky: false,
      x: Math.min(Math.max(x, RIM_EXTENT), window.innerWidth - RIM_EXTENT),
      y: Math.min(Math.max(y, RIM_EXTENT), window.innerHeight - RIM_EXTENT)
    };
    hintShown.value = false;

    try {
      localStorage.setItem(HINT_KEY, "1");
    }
    catch {
      // The hint shows again next time
    }
  }

  function hideRim() {
    rim.value = null;
  }

  // The middle button is held since it showed the rim
  let gesture = false;
  // A left press that only dismissed the rim: its click neither zooms nor closes
  let suppressClick = false;
  // A middle release that ran a sector: its auxclick (on the sector, where a browser targets the release)
  // does not run the alternative as well
  let suppressAuxClick = false;

  function onMouseDown(e) {
    suppressClick = false;
    suppressAuxClick = false;

    if (!rootElement.value?.contains(e.target))
      return;

    // Clicks on the shown rim are its own (a middle click runs the alternative of a sector)
    if (rim.value && rimElement.value?.$el.contains(e.target))
      return;

    if (rim.value) {
      hideRim();

      if (e.button === 0) {
        suppressClick = true;
        e.preventDefault();
        return;
      }
    }

    if (e.button !== 1)
      return;

    // No autoscroll
    e.preventDefault();
    gesture = true;
    showRim(e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (e.button !== 1 || !gesture)
      return;

    gesture = false;
    const target = rimElement.value?.releaseAt(e.clientX, e.clientY, e.shiftKey);

    if (target === "center" && rim.value)
      rim.value.sticky = true;
    else
      hideRim();

    suppressAuxClick = target === "item";
  }

  function onAuxClick(e) {
    if (!suppressAuxClick)
      return;

    suppressAuxClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onClick(e) {
    if (!suppressClick)
      return;

    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  // Escape closes the rim before the overlay
  function onKeyDown(e) {
    if (e.key !== "Escape" || !rim.value)
      return;

    e.preventDefault();
    e.stopImmediatePropagation();
    hideRim();
  }

  function onWindowBlur() {
    gesture = false;

    if (rim.value && !rim.value.sticky)
      hideRim();
  }

  // The parameters sector shows the panel of the overlay; the trays flash their tabs, which the overlay covers.
  // The rim closes after each action
  function onRimRun(action, alt) {
    hideRim();

    if (action.id === "params") {
      showParamsPanel.value = !showParamsPanel.value;
      return;
    }

    runImageAction(action, props.image, actionContext, alt);

    if (action.group === 3)
      toast(action.label.replace(/^Add to/, "Added to"));
  }

  function onRimExtra(id) {
    hideRim();
    onReuse(id === "reuseAll");
  }

  function onRimMarking(marking) {
    hideRim();
    setMarkingByKey(marking);
  }

  function onRimDelete() {
    hideRim();
    emit("deleteImage", props.image);
  }

  // How to reach the actions, on each opening until the rim was shown once
  const HINT_KEY = "imageBench_overlayRimUsed";
  const HINT_DURATION = 6000;
  const hintShown = ref(false);
  let hintTimer = 0;

  function showHint() {
    try {
      if (localStorage.getItem(HINT_KEY))
        return;
    }
    catch {
      return;
    }

    hintShown.value = true;
    hintTimer = setTimeout(() => hintShown.value = false, HINT_DURATION);
  }

  onMounted(() => {
    setOverlayImageTarget(keyTarget);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("auxclick", onAuxClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
    showHint();
  });

  onBeforeUnmount(() => {
    clearOverlayImageTarget(keyTarget);
    window.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("auxclick", onAuxClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onWindowBlur);
    clearTimeout(hintTimer);
  });

</script>

<template>
  <!-- Using Teleport to render overlay at body level for better z-index control -->
  <Teleport to="body">
    <Transition name="fade">
      <div ref="rootElement" class="image-overlay-container" :class="{'chrome-hidden': ctrlDown}" @wheel="onWheel">
        <div class="image-overlay" @click="$emit('hideOverlay')">
        </div>
        <Transition name="zoom">
          <div class="overlay-image-container" ref="containerElement"
               :class="{ 'full-size': isFullSize }"
               @click="onContainerClick">
            <MediaView v-if="!still" class="overlay-media" :src="imageLink" :kind="fileKind"
                       @contextmenu="openImageMenu($event, image, actionContext)"/>
            <img v-else class="overlay-image" :src="imageLink" draggable="false"
                 :title="isFullSize ? 'Click to fit to screen, drag to pan' : 'Click to view in full size'"
                 @mousedown="onImageMouseDown" @load="onImageLoad"
                 @contextmenu="openImageMenu($event, image, actionContext)">
          </div>
        </Transition>
        <button v-if="hasPrev" class="nav-button prev" title="Previous image (←)" aria-label="Previous image"
                @click="$emit('navigate', -1)"><AppIcon name="chevronLeft" :size="36"/></button>
        <button v-if="hasNext" class="nav-button next" title="Next image (→)" aria-label="Next image"
                @click="$emit('navigate', 1)"><AppIcon name="chevronRight" :size="36"/></button>
        <button v-if="hasUp" class="nav-button up" title="Image above (↑)" aria-label="Image above"
                @click="$emit('navigateVertical', -1)"><AppIcon name="chevron" :size="36"/></button>
        <button v-if="hasDown" class="nav-button down" title="Image below (↓)" aria-label="Image below"
                @click="$emit('navigateVertical', 1)"><AppIcon name="chevron" :size="36"/></button>
        <!-- What the view tells about the image, at the top center (e.g. the values of a sweep cell) -->
        <div v-if="$slots.info" class="overlay-info"><slot name="info"/></div>
        <Transition name="fade">
          <div v-if="showParamsPanel && hasParameters" class="params-panel">
            <GenerationParametersHeader :reusable="canReuse" close-title="Hide generation parameters"
                                        @reuse="onReuse" @close="showParamsPanel = false"/>
            <div class="params-body">
              <GenerationParameters :parameters="image.parameters"/>
              <ControlNetUnits :image="image"/>
            </div>
          </div>
        </Transition>
        <!-- A box without size at the pointer: the rim centers itself on it -->
        <div v-if="rim" class="overlay-rim" :style="{left: rim.x + 'px', top: rim.y + 'px'}">
          <ActionRim ref="rimElement" :groups="rimGroups" :size="1000" hub="close" :marking="image.marking ?? null"
                     :marking-arc="isTray || markable" :extras="rimExtras" :show-alt="shiftDown" :deletable="isTray"
                     @run="onRimRun" @delete="onRimDelete" @set-marking="onRimMarking"
                     @extra="onRimExtra" @close="$emit('hideOverlay')"/>
        </div>
        <!-- The marking of the image; a click removes it -->
        <button v-if="image.marking && (isTray || markable)" type="button" class="overlay-marking"
                title="Remove marking (0)" aria-label="Remove marking"
                @click="setMarkingByKey(null)">{{ image.marking }}</button>
        <Transition name="fade">
          <div v-if="hintShown" class="overlay-hint">
            Middle click for the actions, their center closes the image · hold Ctrl to see only the image
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-overlay-container {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

/* Ctrl: everything but the dimmed background and the image */
.chrome-hidden > :not(.image-overlay):not(.overlay-image-container) {
  visibility: hidden;
}

.image-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 70%;
  background-color: #444;
  z-index: 1001;
  cursor: pointer;
}

.overlay-image-container {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  display: flex;
  overflow: hidden;
  overscroll-behavior: contain;
  cursor: pointer;
}

/* Auto margins center the image while it fits, and collapse to zero when it overflows,
   so the whole image stays reachable by scrolling (unlike justify-content/align-items: center) */
.overlay-image {
  margin: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: zoom-in;
  user-select: none;
}

.overlay-image-container.full-size {
  overflow: auto;
}

.full-size .overlay-image {
  max-width: none;
  max-height: none;
  flex-shrink: 0;
  cursor: grab;
}

.full-size .overlay-image:active {
  cursor: grabbing;
}

/* A video or audio file, centered by the auto margins like the image */
.overlay-media {
  margin: auto;
  padding: 64px 72px;
  box-sizing: border-box;
}

/* Transparent over the image, dark only on hover */
.nav-button {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1003;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 84px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

/* Keeps the chevron visible over light images */
.nav-button > svg {
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.8));
}

.nav-button:hover {
  background: rgba(17, 19, 23, 0.75);
  color: #fff;
}

.nav-button.prev {
  left: 12px;
}

.nav-button.next {
  right: 12px;
}

.nav-button.up,
.nav-button.down {
  left: 50%;
  top: auto;
  width: 84px;
  height: 44px;
  transform: translateX(-50%);
}

.nav-button.up {
  top: 64px;
}

.nav-button.up > svg {
  transform: rotate(180deg);
}

.nav-button.down {
  bottom: 76px;
}

.overlay-info {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1004;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(17, 19, 23, 0.75);
  color: #fff;
  white-space: nowrap;
}

/* Over the image, below the top center info */
.params-panel {
  position: fixed;
  top: 68px;
  bottom: 68px;
  left: 50%;
  transform: translateX(-50%);
  width: min(820px, calc(100vw - 40px));
  box-sizing: border-box;
  z-index: 1003;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: rgba(22, 25, 29, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: var(--ib-text);
  font-size: 13px;
  line-height: 1.45;
  cursor: auto;
}

.params-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 14px;
}

/* A box without size at the pointer, which the rim centers itself on */
.overlay-rim {
  position: fixed;
  width: 0;
  height: 0;
  z-index: 1005;
}

.overlay-marking {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1003;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(17, 19, 23, 0.6);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.overlay-marking:hover {
  background: rgba(17, 19, 23, 0.9);
  transform: scale(1.08);
}

.overlay-hint {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 1004;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(17, 19, 23, 0.85);
  color: var(--ib-text);
  font-size: 13px;
  white-space: nowrap;
  pointer-events: none;
}

/* Vue 3 Transition animations */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: all 0.3s ease;
}

.zoom-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.zoom-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style>
