<script setup>
/**
 * Tabs in the header of a parameter group of the Generate tab (Hires. fix or img2img, and ControlNet),
 * shown as the header title
 */
defineProps({
  // [{value, label, count?}]
  tabs: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <span class="group-tabs" role="tablist">
    <button v-for="tab in tabs" :key="tab.value" type="button" role="tab" class="group-tab"
            :class="{on: modelValue === tab.value}" :aria-selected="modelValue === tab.value"
            @click="emit('update:modelValue', tab.value)">{{ tab.label }}</button>
  </span>
</template>

<style scoped>
.group-tabs {
  display: flex;
  gap: 14px;
  min-width: 0;
}

/* The underline of the shown tab lies on the border of the header */
.group-tab {
  margin: 0 0 -6px;
  padding: 0 0 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ib-muted);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.group-tab:hover {
  color: var(--ib-text-2);
}

.group-tab.on {
  border-bottom-color: var(--ib-accent);
  color: var(--ib-text);
}
</style>
