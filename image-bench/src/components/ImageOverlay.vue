<script setup>
  import {computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {useConceptTrayStore} from "@/stores/conceptTray.js";
  import {useCompareStore} from "@/stores/compare.js";
  import {syncTrayMarkings} from "@/stores/trayMarkings.js";
  import {flashTrayTab} from "@/components/utils.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_COMPARE, MARKINGS} from "@/consts.js";
  import {dialog} from "@/dialogs/useDialog.js";
  import {hostHas} from "@/host.js";
  import {openImageMenu} from "@/contextMenu.js";
  import {INPAINT_LABEL, sendToInpaint} from "@/imageActions.js";
  import {setOverlayImageTarget, clearOverlayImageTarget} from "@/composables/useImageActionKeys.js";
  import AppIcon from "@/components/AppIcon.vue";

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
    }
  });

  const emit = defineEmits(['hideOverlay', 'imageSelect', 'addToTray', 'setMarking', 'deleteImage',
    'showParams', 'upscaleImage', 'addComment', 'filterMarking']);

  const canSendToControlNet = hostHas("images", "sendToControlNet");
  const imageTrayStore = useImageTrayStore();
  const conceptTrayStore = useConceptTrayStore();
  const imageOps = useImageOperations();

  const imageLink = computed(() => imageOps.getImageLink(props.image));
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
    // Middle click opens the image on auxclick; no autoscroll
    if (e.button === 1) {
      e.preventDefault();
      return;
    }

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

  function onAddToCompare(e) {
    e.preventDefault();

    useCompareStore().addImage(props.image);

    flashTrayTab("compare-tab");
  }

  function onPlaceToImageTray(e) {
    e.preventDefault();

    imageTrayStore.addImage(props.image);

    flashTrayTab("image-tray-tab");
  }

  function onPlaceToConceptTray(e) {
    e.preventDefault();

    conceptTrayStore.addImage(props.image);

    flashTrayTab("concept-tray-tab");
  }

  async function onSendToControlNet(e) {
    e.preventDefault();

    const error = await imageOps.sendToControlNet(props.image);

    if (error)
      await dialog.alert(error, {title: "Send to ControlNet"});
    else
      flashTrayTab("controlnet-tab");
  }

  async function onSendToPhotoshop(e, newDocument) {
    e.preventDefault();

    const error = await imageOps.sendToPhotoshop(props.image, newDocument);

    if (error)
      await dialog.alert(error, {title: "Send to Photoshop"});
  }

  function onImageAuxClick(e) {
    if (e.button === 1)
      window.open(e.target.src, "_blank");
  }

  function onPhotoshopAuxClick(e) {
    if (e.button === 1)
      onSendToPhotoshop(e, false);
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

  // The marking bar opens on hover, or on a click on the current marking
  const markingBarOpen = ref(false);

  // The parameters panel is shown over the image, and stays shown while navigating between images
  const showParamsPanel = ref(false);

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  const parameterPrompts = computed(() => {
    const params = props.image.parameters || {};
    return [["Prompt", params["prompt"]], ["Negative prompt", params["negative prompt"]]]
      .filter(([, text]) => text);
  });

  // The other parameters as rows; objects (e.g. lora hashes) as indented sub-rows
  const parameterRows = computed(() => {
    const rows = [];

    for (const [key, value] of Object.entries(props.image.parameters || {})) {
      if (key === "prompt" || key === "negative prompt")
        continue;

      if (value && typeof value === "object") {
        rows.push({key: capitalize(key), value: ""});

        for (const [subKey, subValue] of Object.entries(value))
          rows.push({key: subKey, value: String(subValue), sub: true});
      }
      else
        rows.push({key: capitalize(key), value: String(value)});
    }

    return rows;
  });

  const hasParameters = computed(() => parameterPrompts.value.length > 0 || parameterRows.value.length > 0);

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

  onMounted(() => setOverlayImageTarget(keyTarget));
  onBeforeUnmount(() => clearOverlayImageTarget(keyTarget));

</script>

<template>
  <!-- Using Teleport to render overlay at body level for better z-index control -->
  <Teleport to="body">
    <Transition name="fade">
      <div class="image-overlay-container" >
        <div class="image-overlay" @click="$emit('hideOverlay')">
        </div>
        <button class="ib close-button" title="Close" aria-label="Close"
                @click="$emit('hideOverlay')"><AppIcon name="close" :size="22"/></button>
        <Transition name="zoom">
          <div class="overlay-image-container" ref="containerElement"
               :class="{ 'full-size': isFullSize }"
               @click="onContainerClick">
            <img class="overlay-image" :src="imageLink" draggable="false"
                 :title="isFullSize ? 'Click to fit to screen, drag to pan' : 'Click to view in full size'"
                 @mousedown="onImageMouseDown" @auxclick="onImageAuxClick" @load="onImageLoad"
                 @contextmenu="openImageMenu($event, image, actionContext)">
          </div>
        </Transition>
        <button v-if="hasParameters" class="ib params-button" :class="{on: showParamsPanel}"
                :title="showParamsPanel ? 'Hide generation parameters' : 'Show generation parameters'"
                aria-label="Generation parameters" :aria-pressed="showParamsPanel"
                @click="showParamsPanel = !showParamsPanel"><AppIcon name="params" :size="20"/></button>
        <Transition name="fade">
          <div v-if="showParamsPanel && hasParameters" class="params-panel">
            <button class="ib flat params-close" title="Hide generation parameters" aria-label="Hide generation parameters"
                    @click="showParamsPanel = false"><AppIcon name="close" :size="14"/></button>
            <div class="params-body">
              <section v-for="[label, text] in parameterPrompts" :key="label" class="params-section">
                <div class="params-label">{{ label }}</div>
                <div class="params-prompt">{{ text }}</div>
              </section>
              <dl v-if="parameterRows.length" class="params-grid">
                <template v-for="(row, index) in parameterRows" :key="index">
                  <dt :class="{sub: row.sub}">{{ row.key }}</dt>
                  <dd>{{ row.value }}</dd>
                </template>
              </dl>
            </div>
          </div>
        </Transition>
        <div v-if="isTray || markable" class="overlay-markings" :class="{open: markingBarOpen}"
             @mouseleave="markingBarOpen = false">
          <span class="marking-current" :title="image.marking ? 'Marking (keys 1-9, 0 removes)' : 'Set a marking (keys 1-9)'"
                @click="markingBarOpen = !markingBarOpen">
            <template v-if="image.marking">{{ image.marking }}</template>
            <AppIcon v-else name="tag" :size="20"/>
          </span>
          <div class="marking-bar">
            <span v-for="(marking, index) in MARKINGS" :key="marking" class="emoji-button"
                  :class="{active: image.marking === marking}"
                  :title="(image.marking === marking ? 'Remove marking' : 'Set marking') + ` (${index + 1})`"
                  @click="onMarkingClick(marking)">{{ marking }}</span>
          </div>
        </div>
        <div class="overlay-actions">
          <template v-if="isTray">
            <button class="ib danger" title="Delete" aria-label="Delete"
                    @click="$emit('deleteImage', image)"><AppIcon name="trash" :size="20"/></button>
            <span class="actions-separator"></span>
          </template>
          <button class="ib" :title="INPAINT_LABEL" :aria-label="INPAINT_LABEL"
                  @click="sendToInpaint(image)"><AppIcon name="brush" :size="20"/></button>
          <button v-if="canSendToControlNet" class="ib" title="Send to the control image of the ControlNet tab" aria-label="Send to ControlNet"
                  @click="onSendToControlNet"><AppIcon name="controlnet" :size="20"/></button>
          <button class="ib" title="Left: send to Photoshop as a new image, Middle/Shift: send to Photoshop as a new layer" aria-label="Send to Photoshop"
                  @click="onSendToPhotoshop($event, !$event.shiftKey)" @mousedown.middle.prevent @auxclick="onPhotoshopAuxClick"><AppIcon name="photoshop" :size="20"/></button>
          <span class="actions-separator"></span>
          <button v-if="kind !== KIND_COMPARE" class="ib" title="Add to compare" aria-label="Add to compare"
                  @click="onAddToCompare"><AppIcon name="compare" :size="20"/></button>
          <button v-if="!isTray || kind === KIND_IMAGE_TRAY" class="ib" title="Add to concept tray" aria-label="Add to concept tray"
                  @click="onPlaceToConceptTray"><AppIcon name="concept" :size="20"/></button>
          <button v-if="!isTray || kind === KIND_CONCEPT_TRAY" class="ib" title="Add to image tray" aria-label="Add to image tray"
                  @click="onPlaceToImageTray"><AppIcon name="palette" :size="20"/></button>
        </div>
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

.close-button {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1003;
}

/* Larger variant of the thumbnail action buttons (GeneratedImage.vue) */
.image-overlay-container .ib {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.image-overlay-container .ib:hover {
  background: var(--ib-elev-2);
  border-color: var(--ib-border-2);
  color: #fff;
}

.image-overlay-container .ib.danger:hover {
  color: var(--ib-danger-text);
  border-color: #5b2d30;
  background: #2a1a1c;
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

.params-button {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1004;
}

.image-overlay-container .ib.on {
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}

/* Over the image, between the top buttons and the bottom bars */
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

/* The body scrolls, so the close button stays in the corner */
.params-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 40px 14px 16px;
}

.params-panel .params-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border-color: transparent;
  background: none;
}

.params-section + .params-section,
.params-section + .params-grid {
  margin-top: 12px;
}

.params-label {
  margin-bottom: 3px;
  color: var(--ib-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.params-prompt {
  padding: 6px 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.params-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 3px 14px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--ib-border);
}

.params-grid dt {
  color: var(--ib-text-2);
}

.params-grid dt.sub {
  padding-left: 12px;
  color: var(--ib-muted);
}

.params-grid dd {
  margin: 0;
  font-family: var(--ib-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.overlay-actions {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1003;
  display: flex;
  align-items: center;
  gap: 6px;
}

.actions-separator {
  align-self: stretch;
  margin: 4px 4px;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.overlay-markings {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1003;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(17, 19, 23, 0.6);
}

.marking-current {
  display: flex;
  align-items: center;
  font-size: 20px;
  line-height: 1;
  color: var(--ib-text);
  cursor: pointer;
}

.marking-bar {
  display: none;
  gap: 6px;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.overlay-markings:hover .marking-bar,
.overlay-markings.open .marking-bar {
  display: flex;
}

.overlay-markings .emoji-button {
  font-size: 20px;
  opacity: 0.45;
}

.overlay-markings .emoji-button.active {
  opacity: 1;
  transform: scale(1.2);
}

.emoji-button {
  font-size: 24px;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
  opacity: 0.9;
}

.emoji-button:hover {
  transform: scale(1.2);
  opacity: 1;
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
