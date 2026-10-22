<script setup>
/**
 * The terminal output of the host over the lower part of the tab content (any tab, the host tab included), resized
 * by its top edge. The socket is open while the drawer is mounted (consoleDrawer.js).
 */
import {nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {useDragSize} from "@/composables/useDragSize.js";
import {createConsoleText} from "@/consoleText.js";
import {openConsoleSocket} from "@/consoleSocket.js";
import {copyText} from "@/clipboard.js";
import {toast} from "@/toast.js";
import {HOST_NAME} from "@/host.js";
import {addonMissing, canRestart, restartHost, restarting} from "@/hostRestart.js";

const HEIGHT_KEY = "imageBench_consoleHeight";
const HEIGHT = {min: 80, default: 260, topReserve: 40};
// Distance from the end within which the view keeps following new output
const FOLLOW_SLACK = 8;

const emit = defineEmits(["close"]);

const root = ref(null);
const body = ref(null);
const connected = ref(false);
const containerHeight = ref(0);

const text = createConsoleText();
const lines = shallowRef(text.lines);
let follow = true;
let renderFrame = 0;
let closeSocket = null;

const height = reactive(useDragSize(HEIGHT_KEY, {
  min: HEIGHT.min,
  max: () => Math.max(HEIGHT.min, containerHeight.value - HEIGHT.topReserve),
  fallback: HEIGHT.default
}));

// The drawer may take the height of the tab content but a strip at the top
const containerObserver = new ResizeObserver(([entry]) => {
  if (entry.contentRect.height)
    containerHeight.value = entry.contentRect.height;
});

/** Render the written output once per frame, so that a burst of progress updates is drawn once */
function scheduleRender() {
  if (renderFrame)
    return;

  renderFrame = requestAnimationFrame(async () => {
    renderFrame = 0;
    triggerRef(lines);
    await nextTick();

    if (follow && body.value)
      body.value.scrollTop = body.value.scrollHeight;
  });
}

function onScroll() {
  const element = body.value;
  follow = element.scrollTop + element.clientHeight >= element.scrollHeight - FOLLOW_SLACK;
}

function start() {
  if (closeSocket)
    return;

  closeSocket = openConsoleSocket({
    onBacklog(backlog) {
      text.reset();
      text.write(backlog);
      follow = true;
      scheduleRender();
    },
    onAppend(output) {
      text.write(output);
      scheduleRender();
    },
    onState: state => connected.value = state
  });
}

function stop() {
  closeSocket?.();
  closeSocket = null;
  connected.value = false;
}

function clear() {
  text.reset();
  scheduleRender();
}

async function copy() {
  if (await copyText(text.plainText()))
    toast("The console output is copied");
}

onMounted(() => {
  const container = root.value.offsetParent;

  if (container)
    containerObserver.observe(container);

  start();
});

onBeforeUnmount(() => {
  stop();
  containerObserver.disconnect();
  cancelAnimationFrame(renderFrame);
});
</script>

<template>
  <section ref="root" class="console-drawer" :style="{height: `${height.size}px`}" aria-label="Console">
    <div class="grip" :class="{active: height.resizing}" role="separator" aria-orientation="horizontal"
         aria-label="Resize the console" :aria-valuenow="height.size" tabindex="0"
         title="Drag to resize the console; double-click to restore it"
         @pointerdown="height.onPointerDown" @keydown="height.onKeydown" @dblclick="height.reset"><i></i></div>

    <header>
      <AppIcon name="terminal" :size="14"/>
      <span class="title">Console</span>
      <span class="state" :class="{on: connected}"
            :title="connected ? `Connected to ${HOST_NAME}` : `Waiting for ${HOST_NAME}…`"></span>
      <span class="spacer"></span>
      <button type="button" class="ib sm flat restart" :class="{off: !canRestart}" :disabled="restarting"
              :title="restarting ? `${HOST_NAME} is restarting…` : canRestart
                ? `Restart ${HOST_NAME}: kill its process with its console window and run its start script`
                : addonMissing ? `Restart ${HOST_NAME}: needs the Host Restart addon; click to see how`
                : `Restart ${HOST_NAME}: not set up yet; click to see how`"
              :aria-label="`Restart ${HOST_NAME}`" @click="restartHost"><AppIcon name="power" :size="13"/></button>
      <button type="button" class="ib sm flat" title="Copy the output" aria-label="Copy the output"
              @click="copy"><AppIcon name="copy" :size="13"/></button>
      <button type="button" class="ib sm flat" title="Clear the shown output (the host keeps its output)"
              aria-label="Clear the output" @click="clear"><AppIcon name="eraser" :size="13"/></button>
      <button type="button" class="ib sm flat" title="Close the console (Ctrl+`)" aria-label="Close the console"
              @click="emit('close')"><AppIcon name="close" :size="13"/></button>
    </header>

    <div ref="body" class="output" @scroll.passive="onScroll">
      <div v-for="line in lines" :key="line.id" v-memo="[line.version]" class="line"
        ><span v-for="(segment, index) in line.segments" :key="index" :class="segment.cls"
               :style="segment.css || null">{{ segment.text }}</span></div>
    </div>
  </section>
</template>

<style scoped>
.console-drawer {
  /* The ANSI palette (Windows Terminal "Campbell", lightened for the dark background) */
  --ansi-0: #4b5058;
  --ansi-1: #e5484d;
  --ansi-2: #4fc26a;
  --ansi-3: #e2b93d;
  --ansi-4: #5aa9ff;
  --ansi-5: #c678dd;
  --ansi-6: #3fc1c9;
  --ansi-7: #c8ccd2;
  --ansi-8: #7d8590;
  --ansi-9: #ff7a7d;
  --ansi-10: #7ee08f;
  --ansi-11: #f5d76e;
  --ansi-12: #8cc4ff;
  --ansi-13: #e09cf0;
  --ansi-14: #7fdde3;
  --ansi-15: #ffffff;

  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--ib-border-2);
  background: var(--ib-bg);
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.35);
}

.grip {
  position: absolute;
  top: -6px;
  left: 0;
  right: 0;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  touch-action: none;
  z-index: 1;
}

.grip i {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--ib-border-2);
}

.grip:hover i,
.grip:focus-visible i,
.grip.active i {
  background: var(--ib-accent);
}

.grip:focus-visible {
  outline: none;
  background: var(--ib-accent-soft);
}

header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--ib-border);
  background: var(--ib-surface);
  color: var(--ib-text-2);
  user-select: none;
}

.title {
  font-weight: 600;
  color: var(--ib-text);
}

.state {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ib-muted);
}

.state.on {
  background: var(--ansi-2);
}

.spacer {
  flex: 1;
}

.restart.off {
  opacity: 0.5;
}

.output {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 12px 8px;
  font-family: var(--ib-mono);
  font-size: 12px;
  line-height: 1.4;
  color: var(--ansi-7);
  white-space: pre;
  user-select: text;
}

.line {
  min-height: 1.4em;
}

.bold { font-weight: 700; }
.dim { opacity: 0.6; }
.italic { font-style: italic; }
.underline { text-decoration: underline; }

.fg0 { color: var(--ansi-0); }
.fg1 { color: var(--ansi-1); }
.fg2 { color: var(--ansi-2); }
.fg3 { color: var(--ansi-3); }
.fg4 { color: var(--ansi-4); }
.fg5 { color: var(--ansi-5); }
.fg6 { color: var(--ansi-6); }
.fg7 { color: var(--ansi-7); }
.fg8 { color: var(--ansi-8); }
.fg9 { color: var(--ansi-9); }
.fg10 { color: var(--ansi-10); }
.fg11 { color: var(--ansi-11); }
.fg12 { color: var(--ansi-12); }
.fg13 { color: var(--ansi-13); }
.fg14 { color: var(--ansi-14); }
.fg15 { color: var(--ansi-15); }

.bg0 { background: var(--ansi-0); }
.bg1 { background: var(--ansi-1); }
.bg2 { background: var(--ansi-2); }
.bg3 { background: var(--ansi-3); }
.bg4 { background: var(--ansi-4); }
.bg5 { background: var(--ansi-5); }
.bg6 { background: var(--ansi-6); }
.bg7 { background: var(--ansi-7); }
.bg8 { background: var(--ansi-8); }
.bg9 { background: var(--ansi-9); }
.bg10 { background: var(--ansi-10); }
.bg11 { background: var(--ansi-11); }
.bg12 { background: var(--ansi-12); }
.bg13 { background: var(--ansi-13); }
.bg14 { background: var(--ansi-14); }
.bg15 { background: var(--ansi-15); }
</style>
