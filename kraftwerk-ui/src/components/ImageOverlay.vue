<script setup>
  defineProps(["image", "imageIndex"]);
  const emit = defineEmits(["hideOverlay", "imageSelect"]);

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
    <div class="overlay-image-container">
      <img class="overlay-image" :src="image" @mousedown="onImageMouseDown">
      <div class="action-link-container">
        <a class="select-link tool-item" href="#" @click="$emit('imageSelect', $event, imageIndex)">Select image</a>
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