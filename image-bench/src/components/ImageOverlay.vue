<script setup>
  import {computed, ref} from "vue";
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {useConceptTrayStore} from "@/stores/conceptTray.js";
  import {flashTrayTab} from "@/components/utils.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY} from "@/consts.js";

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

  const emit = defineEmits(['hideOverlay', 'imageSelect', 'addToTray']);

  const imageTrayStore = useImageTrayStore();
  const conceptTrayStore = useConceptTrayStore();
  const imageOps = useImageOperations();

  const imageLink = computed(() => imageOps.getImageLink(props.image));
  const isLandscape = ref(true); // Default to landscape

  function onImageLoad(e) {
    const img = e.target;
    isLandscape.value = img.naturalWidth >= img.naturalHeight;
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

  function onImageMouseDown(e) {
    if (e.button === 1)
      window.open(e.target.src, "_blank");
    else if (e.button === 0)
      emit("hideOverlay");
  }
</script>

<template>
  <!-- Using Teleport to render overlay at body level for better z-index control -->
  <Teleport to="body">
    <Transition name="fade">
      <div class="image-overlay-container" >
        <div class="image-overlay" @click="$emit('hideOverlay')">
        </div>
        <div class="close-button" @click="$emit('hideOverlay')">✖</div>
        <Transition name="zoom">
          <div class="overlay-image-container" :class="{ 'landscape': isLandscape, 'portrait': !isLandscape }">
            <img class="overlay-image" :src="imageLink" @load="onImageLoad" @mousedown="onImageMouseDown">
          </div>
        </Transition>
        <div class="overlay-emoji-buttons">
          <span class="emoji-button" title="Place to concept tray"
                @click="onPlaceToConceptTray">💡</span>
          <span class="emoji-button" title="Place to image tray"
                @click="onPlaceToImageTray">🎨</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-overlay-container {
  position: absolute;
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
  cursor: pointer;
  font-size: 24px;
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
  flex-direction: column;
  //justify-content: center;
  align-items: center;
  overflow: auto;
}

.overlay-image-container.landscape {
  max-height: 90%;
  margin: auto 0;
  height: max-content;
}

.overlay-image-container.portrait {
  max-width: 90%;
  margin: 0 auto;
  width: max-content;
}

.overlay-image {
  cursor: pointer;
}

.landscape .overlay-image {

}

.portrait .overlay-image {

}

.overlay-emoji-buttons {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1003;
  display: flex;
  gap: 10px;
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
