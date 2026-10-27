<script setup>
/**
 * Progress ring around the icon of the tab that started the running run (runState.js); it spins while the progress
 * is unknown or the run goes on until stopped. Placed in a positioned icon wrapper of the tab
 */
import {computed} from "vue";

const props = defineProps({
  // {progress: number|null, forever: boolean}
  run: {
    type: Object,
    required: true
  }
});

const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const spinning = computed(() => props.run.forever || props.run.progress === null);
const dash = computed(() => {
  const fraction = spinning.value ? 0.25 : Math.max(0.03, Math.min(1, props.run.progress / 100));
  return `${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`;
});
</script>

<template>
  <svg class="run-ring" :class="{spinning}" viewBox="0 0 24 24" aria-hidden="true">
    <circle class="track" cx="12" cy="12" :r="RADIUS"/>
    <circle class="bar" cx="12" cy="12" :r="RADIUS" :stroke-dasharray="dash"/>
  </svg>
</template>

<style scoped>
.run-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%) rotate(-90deg);
  pointer-events: none;
}

circle {
  fill: none;
  stroke-width: 2;
}

.track {
  stroke: var(--ib-accent-soft);
}

.bar {
  stroke: var(--ib-accent);
  stroke-linecap: round;
  transition: stroke-dasharray 0.3s;
}

.spinning {
  animation: run-ring-spin 1.1s linear infinite;
}

@keyframes run-ring-spin {
  from {
    transform: translate(-50%, -50%) rotate(-90deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(270deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
