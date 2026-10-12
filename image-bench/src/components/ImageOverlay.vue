<script setup>
  import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {useConceptTrayStore} from "@/stores/conceptTray.js";
  import {flashTrayTab} from "@/components/utils.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, MARKINGS} from "@/consts.js";
  import {dialog} from "@/dialogs/useDialog.js";
  import {hostHas} from "@/host.js";
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
    }
  });

  const emit = defineEmits(['hideOverlay', 'imageSelect', 'addToTray', 'setMarking', 'deleteImage']);

  const canSendToControlNet = hostHas("images", "sendToControlNet");
  const imageTrayStore = useImageTrayStore();
  const conceptTrayStore = useConceptTrayStore();
  const imageOps = useImageOperations();

  const imageLink = computed(() => imageOps.getImageLink(props.image));
  const isFullSize = ref(false);
  const containerElement = ref(null);

  // Each newly displayed image (e.g. navigated with arrow keys) starts scaled
  watch(imageLink, () => {
    isFullSize.value = false;
  });

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
    if (e.button === 1) {
      window.open(e.target.src, "_blank");
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

  // Clicking the current marking removes it
  function onMarkingClick(marking) {
    if (props.image.marking === marking)
      delete props.image.marking;
    else
      props.image.marking = marking;

    emit("setMarking", props.image);
  }

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
                 @mousedown="onImageMouseDown">
          </div>
        </Transition>
        <div v-if="isTray" class="overlay-markings">
          <span v-for="marking in MARKINGS" :key="marking" class="emoji-button"
                :class="{active: image.marking === marking}"
                :title="image.marking === marking ? 'Remove marking' : 'Set marking'"
                @click="onMarkingClick(marking)">{{ marking }}</span>
        </div>
        <div class="overlay-actions">
          <template v-if="isTray">
            <button class="ib danger" title="Delete" aria-label="Delete"
                    @click="$emit('deleteImage', image)"><AppIcon name="trash" :size="20"/></button>
            <span class="actions-separator"></span>
          </template>
          <button v-if="canSendToControlNet" class="ib" title="Send to the control image of the ControlNet tab" aria-label="Send to ControlNet"
                  @click="onSendToControlNet"><AppIcon name="controlnet" :size="20"/></button>
          <button class="ib" title="Left: send to Photoshop, Middle: send to Photoshop as a new image" aria-label="Send to Photoshop"
                  @click="onSendToPhotoshop($event, false)" @mousedown.middle="onSendToPhotoshop($event, true)"><AppIcon name="external" :size="20"/></button>
          <span class="actions-separator"></span>
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
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(17, 19, 23, 0.6);
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
