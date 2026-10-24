<script setup>
/**
 * The cube joined to the Generate button while a project is current, in the project color: the generated work goes
 * into that project on the next save. Clicked, it shows the project menu (Save project, New workspace). Armed by
 * projectReminder.js (striped, pulsing), the next generation from the Generate tab asks first through ask(): continue
 * the project, or start a new workspace that keeps the prompts and parameters, then generate
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {PROJECT_TRAYS, useProjectsStore} from "@/stores/projects.js";
import {disarmReminder, muteReminder, reminder} from "@/projectReminder.js";
import {startBlankWorkspace} from "@/workspace.js";

const POPOVER_WIDTH = 300;
const MARGIN = 8;

const RELATIVE_UNITS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600],
  ["minute", 60]];
const relativeFormat = new Intl.RelativeTimeFormat("en", {numeric: "auto"});

const projects = useProjectsStore();

// null, "ask" (the reminder before a generation) or "menu" (the project menu)
const shown = ref(null);
const position = ref({left: 0, top: 0, arrow: 20});
const muted = ref(false);
const cube = ref(null);
const popover = ref(null);
const firstButton = ref(null);
// What the reminder runs once answered; null if it was opened from the cube
let pending = null;

const name = computed(() => projects.current.name);

const changedTrays = computed(() => PROJECT_TRAYS
  .filter(tray => projects.current.trays?.[tray.kind]?.changed).map(tray => tray.label));

const savedAgo = computed(() => {
  const savedAt = projects.current.savedAt;

  if (!savedAt)
    return null;

  const elapsed = Date.now() / 1000 - savedAt;
  const [unit, size] = RELATIVE_UNITS.find(([, size]) => elapsed >= size) ?? ["minute", 60];
  return relativeFormat.format(-Math.floor(elapsed / size), unit);
});

const title = computed(() => reminder.armed
  ? `The workspace is the project ${name.value}: the next generation asks whether to continue it`
  : `Current project: ${name.value}. The trays and parameters are saved into it with Save project (Ctrl+S).\nClick for the project menu`);

function show(kind, anchor) {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN));

  position.value = {left, top: rect.bottom + 8, arrow: rect.left + Math.min(rect.width / 2, 22) - left};
  shown.value = kind;
  nextTick(() => firstButton.value?.focus());
}

function close() {
  shown.value = null;
  pending = null;
}

/**
 * Ask whether to continue the project before a generation
 * @param {Function} handler - The generation, run unless the reminder is dismissed
 * @param {HTMLElement} anchor - The button clicked, under which the reminder is shown
 */
function ask(handler, anchor) {
  muted.value = false;
  show("ask", anchor);
  pending = handler;
}

defineExpose({ask});

function onCubeClick() {
  if (shown.value)
    close();
  else if (reminder.armed)
    ask(null, cube.value);
  else
    show("menu", cube.value);
}

function onContinue() {
  const handler = pending;

  if (muted.value)
    muteReminder();
  else
    disarmReminder();

  close();
  handler?.();
}

// The project is closed meanwhile, which unmounts the cube: the handler is kept before
async function onNewWorkspace({keepParams}) {
  const handler = shown.value === "ask" ? pending : null;
  close();

  if (await startBlankWorkspace({keepParams}))
    handler?.();
}

function onSave() {
  close();
  projects.save();
}

function onDocumentMousedown(e) {
  if (shown.value && !popover.value?.contains(e.target) && !cube.value?.contains(e.target))
    close();
}

function onKeydown(e) {
  if (e.key === "Escape" || e.key === "Esc") {
    e.stopPropagation();
    close();
  }
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <button ref="cube" type="button" class="project-cube" :class="{armed: reminder.armed}" :title="title"
          :aria-label="`Project ${name}`" aria-haspopup="dialog" :aria-expanded="!!shown" @click="onCubeClick"
    ><AppIcon name="box" :size="13"/></button>
  <Teleport to="body">
    <div v-if="shown" ref="popover" class="project-popover" role="dialog" :aria-label="`Project ${name}`"
         :style="{left: `${position.left}px`, top: `${position.top}px`, '--arrow': `${position.arrow}px`}"
         @keydown="onKeydown">
      <template v-if="shown === 'ask'">
        <div class="heading"><AppIcon name="box" :size="14"/>
          <span>{{ reminder.reason === "session" ? "The current project is" : "Still in" }} <b>{{ name }}</b></span></div>
        <p>
          {{ reminder.reason === "session" ? (savedAgo ? `Last saved ${savedAgo}.` : "")
            : "This looks like a new start." }}
          New workspace keeps the prompts.
        </p>
        <div class="actions">
          <button ref="firstButton" type="button" class="primary" :disabled="!!projects.busy" @click="onContinue">
            {{ reminder.reason === "session" ? "Continue project" : "Stay in project" }}<kbd>Enter</kbd></button>
          <button type="button" :disabled="!!projects.busy" @click="onNewWorkspace({keepParams: true})">New workspace</button>
        </div>
        <label class="mute"><input v-model="muted" type="checkbox"> Don't ask again for this project</label>
      </template>
      <template v-else>
        <div class="heading"><AppIcon name="box" :size="14"/><span>{{ name }}</span></div>
        <p v-if="savedAgo || changedTrays.length">
          {{ savedAgo ? `Saved ${savedAgo}.` : "" }}
          {{ changedTrays.length ? `Unsaved: ${changedTrays.join(", ")}.` : "" }}
        </p>
        <div class="actions">
          <button ref="firstButton" type="button" class="primary"
                  :disabled="!!projects.busy || projects.current.exists === false" @click="onSave">
            Save project<kbd>Ctrl+S</kbd></button>
          <button type="button" :disabled="!!projects.busy" @click="onNewWorkspace({keepParams: false})">New workspace…</button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.project-cube {
  width: 24px;
  height: 26px;
  flex-shrink: 0;
  /* 1px from the Generate button, whose right corners are square while the cube shows */
  margin-left: -1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 0 5px 5px 0;
  background: var(--ib-project);
  color: var(--ib-project-ink);
  cursor: pointer;
}

.project-cube:hover {
  background: var(--ib-project-hover);
}

.project-cube.armed {
  background: repeating-linear-gradient(-45deg, var(--ib-project) 0 5px,
                                        color-mix(in srgb, var(--ib-project) 62%, #000) 5px 10px);
  animation: armed 1.6s ease-in-out infinite;
}

@keyframes armed {
  50% {
    box-shadow: 0 0 0 3px var(--ib-project-border);
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-cube.armed {
    animation: none;
    box-shadow: 0 0 0 2px var(--ib-project-border);
  }
}

.project-popover {
  position: fixed;
  z-index: 60;
  width: 300px;
  display: grid;
  gap: 8px;
  padding: 12px 12px 10px;
  border: 1px solid var(--ib-project-border);
  border-radius: 7px;
  background: var(--ib-elev);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: var(--ib-text);
  font-size: 12.5px;
}

.project-popover::before {
  content: "";
  position: absolute;
  top: -6px;
  left: calc(var(--arrow) - 5px);
  width: 10px;
  height: 10px;
  background: var(--ib-elev);
  border-left: 1px solid var(--ib-project-border);
  border-top: 1px solid var(--ib-project-border);
  transform: rotate(45deg);
}

.heading {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-weight: 600;
}

.heading span {
  overflow-wrap: anywhere;
}

/* The reminder's heading: the project name stands out of the sentence */
.heading:has(b) {
  font-weight: 400;
}

.heading b {
  font-weight: 700;
}

.heading .app-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ib-project);
}

p {
  margin: 0;
  color: var(--ib-text-2);
  font-size: 12px;
  line-height: 1.45;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.actions button {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.actions button:hover:not(:disabled) {
  background: var(--ib-hover);
}

.actions button.primary {
  border-color: var(--ib-project);
  background: var(--ib-project);
  color: var(--ib-project-ink);
}

.actions button.primary:hover:not(:disabled) {
  background: var(--ib-project-hover);
}

.actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.actions button:focus-visible {
  outline: 2px solid var(--ib-project);
  outline-offset: 1px;
}

kbd {
  font: 10px var(--ib-mono);
  opacity: 0.7;
}

.mute {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--ib-muted);
  font-size: 11.5px;
  cursor: pointer;
}
</style>
