<script>
import {reactive, watchEffect} from "vue";
import {APP_TITLE} from "@/host.js";

// Labels of the mounted indicators (kept-alive tabs included), the latest one is shown in the window title
const activeLabels = reactive(new Map());

// Off for now: misbehaves, the progress label (e.g. "[100%]") stays in the title after the run has finished
const UPDATE_WINDOW_TITLE = false;

watchEffect(() => {
  if (!UPDATE_WINDOW_TITLE)
    return;

  const labels = [...activeLabels.values()];
  document.title = labels.length ? `[${labels[labels.length - 1]}] ${APP_TITLE}` : APP_TITLE;
});

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
</script>

<script setup>
/**
 * Progress of a run in a toolbar: the text (images done, overall percent, time left) where it is mounted, and lines
 * along the bottom edge of the toolbar, which must be positioned: the run, and in runs of several images a faint one
 * above it for the image being generated
 */
import {computed, onMounted, onUnmounted, ref, watch} from "vue";

const props = defineProps({
  // The run of runState.js:useActiveRun()
  run: {
    type: Object,
    required: true
  },
  // Text shown instead of the percent when the number of images is unknown
  label: {
    type: String,
    default: ""
  }
});

const percent = computed(() => props.run.progress === null ? null : Math.max(0, Math.min(100, props.run.progress)));

// Time left: the average time per finished image times the images left, less the time spent on the current one.
// Mounted in the middle of a run (the popup opened later), timing starts at the first image finished
let startedAt = Date.now();
let startCompleted = props.run.completed;
let timed = startCompleted === 0;
const lastCompletedAt = ref(startedAt);
const now = ref(Date.now());
let tick = null;

watch(() => props.run.completed, (completed, previous) => {
  if (completed <= previous)
    return;

  lastCompletedAt.value = Date.now();

  if (!timed) {
    timed = true;
    startedAt = lastCompletedAt.value;
    startCompleted = completed;
  }
});

onMounted(() => tick = setInterval(() => now.value = Date.now(), 1000));
onUnmounted(() => clearInterval(tick));

const eta = computed(() => {
  const {completed, total, forever} = props.run;
  const timedImages = completed - startCompleted;

  if (forever || !total || !timed || timedImages <= 0 || completed >= total)
    return "";

  const average = (lastCompletedAt.value - startedAt) / timedImages;
  return `~${formatTime((average * (total - completed) - (now.value - lastCompletedAt.value)) / 1000)}`;
});

const text = computed(() => {
  const {completed, total, forever, multi} = props.run;
  const pct = `${Math.floor(percent.value ?? 0)}%`;

  if (forever)
    return `${completed} · ∞`;

  if (multi && total > 0)
    return [`${completed}/${total}`, pct, eta.value].filter(Boolean).join(" · ");

  return multi && props.label || pct;
});

const titleKey = Symbol();
watch(text, label => activeLabels.set(titleKey, label), {immediate: true});
onUnmounted(() => activeLabels.delete(titleKey));
</script>

<template>
  <span class="progress-text" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        :aria-valuenow="percent === null ? undefined : Math.floor(percent)">{{ text }}</span>
  <Transition name="run-edge" appear>
    <div class="run-edge" :class="{forever: run.forever}"><i :style="{width: `${percent ?? 0}%`}"></i></div>
  </Transition>
  <div v-if="run.multi && run.image !== null" class="run-edge image"><i :style="{width: `${run.image}%`}"></i></div>
</template>

<style scoped>
.progress-text {
  min-width: 15ch;
  margin-left: 6px;
  font-family: var(--ib-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ib-text-2);
  white-space: nowrap;
}

/* Over the bottom border of the toolbar, as wide as the toolbar */
.run-edge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  pointer-events: none;
}

.run-edge i {
  display: block;
  height: 100%;
  background: var(--ib-accent);
  transition: width 0.3s linear;
}

/* The image being generated: 1px above the run, in the project color (the accent's pair) */
.run-edge.image {
  bottom: 2px;
  height: 1px;
}

.run-edge.image i {
  background: var(--ib-project);
  transition: width 0.25s linear;
}

/* Until stopped: no proportion, a slow sweep */
.run-edge.forever i {
  width: 100% !important;
  background: linear-gradient(90deg, transparent, var(--ib-accent) 45%, var(--ib-accent) 55%, transparent) no-repeat;
  background-size: 40% 100%;
  animation: run-sweep 2.4s ease-in-out infinite;
}

@keyframes run-sweep {
  from {
    background-position: -40% 0;
  }
  to {
    background-position: 140% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .run-edge.forever i {
    animation: none;
    background: var(--ib-accent);
    opacity: 0.5;
  }
}

.run-edge-enter-active {
  transition: opacity 0.4s;
}

.run-edge-enter-from {
  opacity: 0;
}
</style>
