<script setup>
/**
 * The card of a tab (tabHelp.js) shown under it after the pointer has rested on it for a while: never while a button is
 * held or something is dragged, so it does not get in the way of fast clicks and of drops on the tray tabs. It stays
 * while the pointer moves into it; its link opens the tab's chapter of the manual
 */
import {computed, onMounted, onUnmounted, ref} from "vue";
import {TAB_HELP} from "@/tabHelp.js";

const emit = defineEmits(["open-manual"]);

const REST_DELAY = 800;
const LEAVE_DELAY = 200;

const shown = ref(null);  // {id, x, y}
const help = computed(() => shown.value && TAB_HELP[shown.value.id]);

let restTimer = null;
let leaveTimer = null;
let restingOn = null;

function tabOf(target) {
  const tab = target?.closest?.(".tabs .tab[id]");
  return tab && TAB_HELP[tab.id] ? tab : null;
}

function cancelRest() {
  clearTimeout(restTimer);
  restTimer = null;
}

function hide() {
  cancelRest();
  clearTimeout(leaveTimer);
  shown.value = null;
  restingOn = null;
}

function show(tab) {
  const rect = tab.getBoundingClientRect();
  const x = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
  shown.value = {id: tab.id, x, y: rect.bottom + 4};
}

function onPointerOver(e) {
  const tab = tabOf(e.target);

  if (!tab || tab === restingOn)
    return;

  clearTimeout(leaveTimer);
  restingOn = tab;
  cancelRest();

  if (shown.value) {
    // Moving along the tabs keeps the card, for the tab now under the pointer
    show(tab);
    return;
  }

  if (e.buttons)
    return;

  restTimer = setTimeout(() => show(tab), REST_DELAY);
}

// The pointer moves on the tab: the rest starts anew
function onPointerMove(e) {
  if (shown.value || !restingOn || e.buttons || tabOf(e.target) !== restingOn)
    return;

  cancelRest();
  restTimer = setTimeout(() => show(restingOn), REST_DELAY);
}

function onPointerOut(e) {
  if (tabOf(e.relatedTarget) === restingOn && restingOn)
    return;

  cancelRest();
  restingOn = null;
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(hide, LEAVE_DELAY);
}

function onCardEnter() {
  clearTimeout(leaveTimer);
}

function onCardLeave(e) {
  if (!tabOf(e.relatedTarget))
    leaveTimer = setTimeout(hide, LEAVE_DELAY);
}

function openChapter() {
  const chapter = help.value.chapter;
  hide();
  emit("open-manual", chapter);
}

// A press anywhere but in the card ends the rest
function onPointerDown(e) {
  if (!e.target.closest?.(".tab-card"))
    hide();
}

const listeners = {pointerover: onPointerOver, pointermove: onPointerMove, pointerout: onPointerOut,
  pointerdown: onPointerDown};

onMounted(() => {
  for (const [type, listener] of Object.entries(listeners))
    document.addEventListener(type, listener, true);

  // A drag, a key or a scroll ends the rest anywhere
  window.addEventListener("dragstart", hide, true);
  window.addEventListener("keydown", hide, true);
  window.addEventListener("blur", hide);
});

onUnmounted(() => {
  for (const [type, listener] of Object.entries(listeners))
    document.removeEventListener(type, listener, true);

  window.removeEventListener("dragstart", hide, true);
  window.removeEventListener("keydown", hide, true);
  window.removeEventListener("blur", hide);
  hide();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="tab-card">
      <div v-if="help" class="tab-card" role="tooltip" :style="{left: `${shown.x}px`, top: `${shown.y}px`}"
           @pointerenter="onCardEnter" @pointerleave="onCardLeave">
        <div class="card-title">{{ help.title }}</div>
        <div class="card-purpose">{{ help.purpose }}</div>
        <ul v-if="help.ways.length" class="card-ways">
          <li v-for="way in help.ways" :key="way.text">{{ way.text }}<span v-if="way.key" class="key">{{ way.key }}</span></li>
        </ul>
        <a href="#" class="card-link" @click.prevent="openChapter">Read in the manual →</a>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tab-card {
  position: fixed;
  z-index: 60;
  width: 290px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-elev);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: var(--ib-text-2);
  font-size: 12.5px;
  line-height: 1.45;
}

.card-title {
  color: var(--ib-text);
  font-weight: 600;
}

.card-ways {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.key {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--ib-border-2);
  border-radius: 3px;
  background: var(--ib-elev-2);
  color: var(--ib-text-2);
  font: 11px/16px var(--ib-mono);
}

.card-link {
  align-self: flex-start;
  color: var(--ib-accent);
  text-decoration: none;
}

.card-link:hover {
  text-decoration: underline;
}

.tab-card-enter-active,
.tab-card-leave-active {
  transition: opacity 0.12s;
}

.tab-card-enter-from,
.tab-card-leave-to {
  opacity: 0;
}
</style>
