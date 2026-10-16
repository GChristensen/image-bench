<script setup>
import AppIcon from "@/components/AppIcon.vue";

  defineProps({
    // Show the buttons that reuse the seed or all parameters
    reusable: {
      type: Boolean,
      default: false
    },
    closeTitle: {
      type: String,
      default: "Close"
    }
  });

  defineEmits(["reuse", "close"]);
</script>

<template>
  <div class="parameters-header">
    <h3 class="parameters-title">Generation parameters</h3>
    <template v-if="reusable">
      <button class="ib flat" title="Reuse seed" aria-label="Reuse seed" @click="$emit('reuse', false)"
        ><AppIcon name="seed" :size="14"/></button>
      <button class="ib flat" title="Reuse all parameters (prompts, sampler, size, ...)"
              aria-label="Reuse all parameters" @click="$emit('reuse', true)"
        ><AppIcon name="sliders" :size="14"/></button>
    </template>
    <button class="ib flat parameters-close" :title="closeTitle" :aria-label="closeTitle"
            @click="$emit('close')"><AppIcon name="close" :size="14"/></button>
  </div>
</template>

<style scoped>
.parameters-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 4px 16px;
}

.parameters-title {
  margin: 0 8px 0 0;
  color: var(--ib-text);
  font-size: 14px;
  font-weight: bold;
}

.parameters-header .ib {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border-color: transparent;
  background: none;
}

.parameters-header .ib:hover {
  border-color: var(--ib-accent-border);
}

.parameters-close {
  margin-left: auto;
}
</style>
