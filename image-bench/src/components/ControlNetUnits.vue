<script setup>
/**
 * ControlNet units an image was generated with (image.controlnet), their images stored by hash
 * (shared_backend/controlnet_inputs.py); shown under the generation parameters of the overlays
 */
import {computed} from "vue";

  const props = defineProps({
    image: {
      type: Object,
      required: true
    }
  });

  const UNIT_IMAGES = [["image", "Image"], ["mask", "Mask"], ["preview", "Preview"]];

  const controlnetUnits = computed(() => props.image.controlnet?.units ?? []);

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
    return UNIT_IMAGES.filter(([kind]) => unit[kind])
      .map(([kind, label]) => ({url: `/image-bench/controlnet/input?hash=${unit[kind]}`, label}));
  }
</script>

<template>
  <div v-if="controlnetUnits.length" class="controlnet-container">
    <div class="controlnet-title">ControlNet</div>
    <section v-for="unit in controlnetUnits" :key="unit.index" class="controlnet-unit">
      <div class="controlnet-unit-header">
        <span class="controlnet-unit-name">Unit {{ unit.index + 1 }}</span>
        <span class="controlnet-unit-summary">{{ unitSummary(unit.params || {}) }}</span>
      </div>
      <div class="controlnet-images">
        <a v-for="item in unitImages(unit)" :key="item.label" :href="item.url" target="_blank"
           class="controlnet-image-link" :title="item.label">
          <img class="controlnet-image" :src="item.url" :alt="item.label">
          <span class="controlnet-image-label">{{ item.label }}</span>
        </a>
        <span v-if="!unit.image && unit.params?.independent === false" class="controlnet-note"
          >Uses the img2img image</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
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
  align-items: flex-start;
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

.controlnet-note {
  color: var(--ib-muted);
  font-size: 12px;
}
</style>
