<script setup>
  defineProps(["text"]);
  const emit = defineEmits(["hideOverlay"]);

  function onCloseClick(e) {
    e.preventDefault();

    emit('hideOverlay');
  }

</script>

<template>
  <div class="text-overlay-container" >
    <div class="text-overlay" @click="$emit('hideOverlay')">
    </div>
    <div class="overlay-text-container">
      <h3 class="parameters-title">Generation parameters</h3>
      <textarea class="overlay-text" autofocus>{{ text }}</textarea>
      <div class="action-link-container">
        <a class="close-link tool-item" href="#"
           @click="onCloseClick">Close</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-overlay-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.text-overlay {
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

.overlay-text-container {
  position: fixed;
  top: 10vh;
  bottom: 10vh;
  left: 10vw;
  right: 10vw;
  max-width: 80vw;
  max-height: 80vh;
  z-index: 1002;
}

.parameters-title {
  font-weight: bold;
}

.overlay-text{
  width: 100%;
  height: 100%;
}

.action-link-container {
  text-align: center;
}
</style>