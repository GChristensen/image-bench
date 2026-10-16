<script setup>
import {computed, onBeforeMount, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {fetchModelInfo, showModelInfo} from "@/civitai.js";
import {canReuseParameters, reuseParameters} from "@/imageActions.js";
import {HOST_NAME} from "@/host.js";
import {toast} from "@/toast.js";

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

  // Checkpoint and LoRAs of the image that can be looked up on Civitai by their hashes
  // ("lora hashes" is parsed into {name: hash}, or left as "name: hash, ..." if unquoted)
  const models = computed(() => {
    const params = props.image.parameters || {};
    const result = [];

    if (params["model hash"])
      result.push({kind: "checkpoint", name: params["model"] || params["model hash"], hash: params["model hash"]});

    let loraHashes = params["lora hashes"];

    if (typeof loraHashes === "string")
      loraHashes = Object.fromEntries(loraHashes.split(",").map(part => part.split(":").map(s => s.trim())));

    for (const [name, hash] of Object.entries(loraHashes || {}))
      if (name && hash)
        result.push({kind: "lora", name, hash});

    return result;
  });

  const busyModel = ref(null);

  async function onModelClick(model) {
    if (busyModel.value)
      return;

    busyModel.value = model;
    const info = await fetchModelInfo(model);
    busyModel.value = null;

    await showModelInfo(model, {info});
  }

  const canReuse = computed(() => canReuseParameters(props.image));

  async function onReuse(all) {
    await reuseParameters(props.image, all);
    toast(all ? `Parameters set in ${HOST_NAME}` : `Seed set in ${HOST_NAME}`);
    emit("hideOverlay");
  }

  onBeforeMount(async () => {
    const response = await fetch(`/image-bench/get_controlnet_images?id=${props.image.generationId}`);

    if (response.ok) {
      const imageUrls = await response.json();

      controlnetImages.value.length = 0;

      for (const imageUrl of imageUrls) {
        controlnetImages.value.push(imageUrl);
      }
    }
  });
</script>

<template>
  <!-- Using Teleport for overlay to render at body level -->\
  <Teleport to="body">
    <Transition name="fade">
      <div class="text-overlay-container" >
        <div class="text-overlay" @click="$emit('hideOverlay')">
        </div>
        <div class="close-button" @click="$emit('hideOverlay')">✖</div>
        <Transition name="slide-down">
          <div class="overlay-text-container">
            <div class="parameters-header">
              <h3 class="parameters-title">Generation parameters</h3>
              <template v-if="canReuse">
                <button class="ib sm" title="Reuse seed" aria-label="Reuse seed" @click="onReuse(false)"
                  ><AppIcon name="seed" :size="13"/></button>
                <button class="ib sm" title="Reuse all parameters (prompts, sampler, size, ...)"
                        aria-label="Reuse all parameters" @click="onReuse(true)"
                  ><AppIcon name="sliders" :size="13"/></button>
              </template>
            </div>
            <div v-if="models.length" class="models">
              <button v-for="model in models" :key="`${model.kind}:${model.name}`" class="chip model-chip"
                      :title="`Show the ${model.kind === 'lora' ? 'LoRA' : 'checkpoint'} on Civitai`"
                      @click="onModelClick(model)">
                <span v-if="busyModel === model" class="spinner"></span><AppIcon v-else name="info" :size="12"/>{{ model.kind === "lora" ? "LoRA: " : "" }}{{ model.name }}
              </button>
            </div>
            <textarea class="overlay-text" autofocus>{{ text }}</textarea>
            <div v-if="controlnetImages.length" class="controlnet-container">
              <h3 class="controlnet-title">ControlNet</h3>
              <div class="controlnet-images">
                <a v-for="imageURL in controlnetImages" :key="imageURL" :href="imageURL" target="_blank">
                  <img class="controlnet-image" :src="imageURL">
                </a>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
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

.parameters-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.parameters-title {
  margin-right: 6px;
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

.models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.model-chip {
  border: 1px solid transparent;
  font-family: inherit;
  cursor: pointer;
}

.model-chip:hover {
  color: var(--ib-text);
  border-color: var(--ib-accent-border);
}

.overlay-text{
  width: 100%;
  flex-grow: 1;
}

.action-link-container {
  text-align: center;
}

/* Vue 3 Transition animations */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
