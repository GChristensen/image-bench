<script>
import {reactive, watchEffect} from "vue";

// Labels of the mounted indicators (kept-alive tabs included), the latest one is shown in the window title
const activeLabels = reactive(new Map());
const baseTitle = document.title;

watchEffect(() => {
  const labels = [...activeLabels.values()];
  document.title = labels.length ? `[${labels[labels.length - 1]}] ${baseTitle}` : baseTitle;
});
</script>

<script setup>
/**
 * Compact inline progress bar with a monospace label
 */
import {computed, onUnmounted, watch} from "vue";

const props = defineProps({
  value: {
    type: Number,
    default: 0
  },
  label: {
    type: String,
    default: ""
  },
  // Completed/total images, shown when the total is known
  completed: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  }
});

const defaultLabel = computed(() => {
  const percent = `${Math.round(props.value)}%`;
  return props.total > 0 ? `${props.completed}/${props.total} · ${percent}` : percent;
});

const titleKey = Symbol();
watch(() => props.label || defaultLabel.value, label => activeLabels.set(titleKey, label), {immediate: true});
onUnmounted(() => activeLabels.delete(titleKey));
</script>

<template>
  <div class="progress-indicator" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(value)">
    <div class="bar"><i :style="{width: `${Math.min(100, Math.max(0, value))}%`}"></i></div>
    <span class="label">{{ label || defaultLabel }}</span>
  </div>
</template>

<style scoped>
.progress-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 6px;
}

.bar {
  width: 200px;
  height: 4px;
  border-radius: 2px;
  background: var(--ib-elev-2);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--ib-accent);
  transition: width 0.3s;
}

.label {
  font-family: var(--ib-mono);
  font-size: 12px;
  color: var(--ib-text-2);
  white-space: nowrap;
}
</style>
