<script setup>
import {computed, onBeforeMount, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import GenerationParameters from "@/components/GenerationParameters.vue";
import GenerationParametersHeader from "@/components/GenerationParametersHeader.vue";
import {fetchModelInfo, showModelInfo} from "@/civitai.js";
import {canReuseParameters, reuseParameters} from "@/imageActions.js";
import {HOST_NAME} from "@/host.js";
import {toast} from "@/toast.js";

  const props = defineProps({
    image: {
      type: Object,
      required: true
    }
  });

  const emit = defineEmits(['hideOverlay']);

  // ControlNet units captured when the image was queued, or the detected maps of an older batch (index null)
  const controlnetUnits = ref([]);

  const UNIT_IMAGES = [["image", "Image"], ["mask", "Mask"], ["preview", "Preview"]];

  const isSet = value => value !== null && value !== undefined && value !== "" && String(value).toLowerCase() !== "none";

  function unitSummary(params) {
    const parts = [params.controlType, params.preprocessor, params.model].filter(isSet);

    if (isSet(params.weight))
      parts.push(`weight ${params.weight}`);

    if (isSet(params.guidanceStart) && isSet(params.guidanceEnd)
        && (params.guidanceStart > 0 || params.guidanceEnd < 1))
      parts.push(`steps ${params.guidanceStart}–${params.guidanceEnd}`);

    return parts.filter((part, index) => parts.indexOf(part) === index).join(" · ");
  }

  function unitImages(unit) {
    return unit.files ? unit.files.map(url => ({url, label: ""}))
      : UNIT_IMAGES.filter(([kind]) => unit[kind]).map(([kind, label]) => ({url: unit[kind], label}));
  }

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
    const id = props.image.controlnetId || props.image.generationId;

    if (!id)
      return;

    try {
      const response = await fetch(`/image-bench/controlnet/capture?id=${encodeURIComponent(id)}`);

      if (response.ok)
        controlnetUnits.value = await response.json();
    } catch (error) {
      console.warn("[Image Bench] Unable to read the ControlNet units:", error);
    }
  });
</script>

<template>
  <!-- Using Teleport for overlay to render at body level -->
  <Teleport to="body">
    <Transition name="fade">
      <div class="text-overlay-container">
        <div class="text-overlay" @click="$emit('hideOverlay')"></div>
        <Transition name="slide-down">
          <div class="parameters-panel">
            <GenerationParametersHeader :reusable="canReuse" @reuse="onReuse" @close="$emit('hideOverlay')"/>
            <div class="parameters-body">
              <div v-if="models.length" class="models">
                <button v-for="model in models" :key="`${model.kind}:${model.name}`" class="chip model-chip"
                        :title="`Show the ${model.kind === 'lora' ? 'LoRA' : 'checkpoint'} on Civitai`"
                        @click="onModelClick(model)">
                  <span v-if="busyModel === model" class="spinner"></span><AppIcon v-else name="info" :size="12"/>{{ model.kind === "lora" ? "LoRA: " : "" }}{{ model.name }}
                </button>
              </div>
              <GenerationParameters :parameters="image.parameters || {}"/>
              <div v-if="controlnetUnits.length" class="controlnet-container">
                <div class="controlnet-title">ControlNet</div>
                <section v-for="(unit, unitIndex) in controlnetUnits" :key="unitIndex" class="controlnet-unit">
                  <div v-if="unit.index !== null" class="controlnet-unit-header">
                    <span class="controlnet-unit-name">Unit {{ unit.index }}</span>
                    <span class="controlnet-unit-summary">{{ unitSummary(unit.params || {}) }}</span>
                  </div>
                  <div class="controlnet-images">
                    <a v-for="item in unitImages(unit)" :key="item.url" :href="item.url" target="_blank"
                       class="controlnet-image-link" :title="item.label || null">
                      <img class="controlnet-image" :src="item.url" :alt="item.label">
                      <span v-if="item.label" class="controlnet-image-label">{{ item.label }}</span>
                    </a>
                  </div>
                </section>
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

/* The same look as the parameters panel of the image overlay */
.parameters-panel {
  position: fixed;
  top: 10vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(820px, calc(100vw - 40px));
  max-height: 80vh;
  box-sizing: border-box;
  z-index: 1002;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: rgba(22, 25, 29, 0.96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: var(--ib-text);
}

.parameters-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 14px;
}

.models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
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

.controlnet-container {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--ib-border);
}

.controlnet-title {
  margin-bottom: 6px;
  color: var(--ib-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.controlnet-unit + .controlnet-unit {
  margin-top: 10px;
}

.controlnet-unit-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}

.controlnet-unit-name {
  flex: none;
  color: var(--ib-text-2);
}

.controlnet-unit-summary {
  min-width: 0;
  font-family: var(--ib-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.controlnet-images {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.controlnet-image-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--ib-muted);
  font-size: 11px;
  text-decoration: none;
}

.controlnet-image {
  max-height: 100px;
  border: 1px solid var(--ib-border);
  border-radius: 4px;
  background: #000;
}

.controlnet-image-link:hover .controlnet-image {
  border-color: var(--ib-accent-border);
}

/* Vue 3 Transition animations */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: opacity 0.3s ease;
}

.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
}
</style>
