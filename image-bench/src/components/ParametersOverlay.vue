<script setup>
import {onBeforeMount, ref} from "vue";

  const props = defineProps({
    image: {
      type: Object,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  });

  const emit = defineEmits(['hideOverlay']);

  const controlnetImages = ref([]);

  onBeforeMount(async () => {
    const response = await fetch(`/image-bench/get_controlnet_images?id=${props.image.generationId}`);

    if (response.ok) {
      const imagePaths = await response.json();

      controlnetImages.value.length = 0;

      for (const imagePath of imagePaths) {
        controlnetImages.value.push(`/file=${imagePath}`);
      }
    }
  });
</script>

<template>
  <div class="text-overlay-container" >
    <div class="text-overlay" @click="$emit('hideOverlay')">
    </div>
    <div class="close-button" @click="$emit('hideOverlay')">✖</div>
    <div class="overlay-text-container">
      <h3 class="parameters-title">Generation parameters</h3>
      <textarea class="overlay-text" autofocus>{{ text }}</textarea>
      <div v-if="controlnetImages.length" class="controlnet-container">
        <h3 class="controlnet-title">ControlNet</h3>
        <div class="controlnet-images">
          <a v-for="imageURL in controlnetImages" :href="imageURL" target="_blank">
            <img class="controlnet-image" :src="imageURL">
          </a>
        </div>
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

.close-button {
  position: fixed;
  top: 10vh;
  right: calc(10vw - 30px);
  z-index: 1003;
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
  display: flex;
  flex-direction: column;
}

.parameters-title, .controlnet-title {
  font-weight: bold;
}

.controlnet-title {
  margin-top: 15px;
}

.controlnet-image {
  max-height: 100px;
  margin-right: 15px;
}

.overlay-text{
  width: 100%;
  flex-grow: 1;
}

.action-link-container {
  text-align: center;
}
</style>
