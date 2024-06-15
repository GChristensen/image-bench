<script setup>
  import {computed} from "vue";
  import {createImageLink} from "@/sdwebui.js";
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {flashTrayTab} from "@/components/utils.js";

  const props = defineProps(["image", "isTray"]);
  const emit = defineEmits(["hideOverlay", "imageSelect", "addToTray"]);

  const imageTrayStore = useImageTrayStore();

  const imageLink = computed(() => createImageLink(props.image));

  function onAddToTrayClick(e) {
    e.preventDefault();

    imageTrayStore.addImage(props.image);

    flashTrayTab();
  }

  function onImageMouseDown(e) {
    if (e.button === 1)
      window.open(e.target.src, "_blank");
    else if (e.button === 0)
      emit("hideOverlay");
  }
</script>

<template>
  <div class="image-overlay-container" >
    <div class="image-overlay" @click="$emit('hideOverlay')">
    </div>
    <div class="close-button" @click="$emit('hideOverlay')">✖</div>
    <div class="overlay-image-container">
      <img class="overlay-image" :src="imageLink" @mousedown="onImageMouseDown">
      <div class="action-link-container">
        <a v-if="isTray" class="select-link tool-item" href="#"
           @click="$emit('imageSelect', $event, props.image)">Select image</a>
        &nbsp;
        <a v-if="!isTray" class="close-link tool-item" href="#" @click="onAddToTrayClick">Add to Tray</a>
      </div>
    </div>
  </div>
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
  top: 10vh;
  right: calc(10vw - 30px);
  z-index: 1003;
  cursor: pointer;
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
  top: 10vh;
  bottom: 10vh;
  left: 10vw;
  right: 10vw;
  max-width: 80vw;
  max-height: 80vh;
  z-index: 1002;
}

.overlay-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.action-link-container {
  text-align: center;
}
</style>