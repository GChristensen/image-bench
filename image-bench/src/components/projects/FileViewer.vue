<script setup>
/**
 * Full-size view of the image files of a project, with ← / → through the files and Escape to close.
 * A video or audio file plays at once, with sound.
 * The actions of a file are its action rim, as in the image overlay: a press of the rim button shows it at the
 * pointer (pointerRim.js), released on a sector it runs it, released in the center it stays for clicks (its center
 * closes the viewer); the rim button at the lower right shows it in the middle of the window. The menu button emits
 * menu(event, file)
 */
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import MediaView from "@/components/MediaView.vue";
import {closePointerRim, openPointerRim, pointerRim} from "@/pointerRim.js";
import {buttonName, menuButton, rimButton} from "@/imageButtons.js";
import {KIND_IMAGE, mediaKindOfName} from "@/media.js";

const props = defineProps({
  // [{name, url, kind}] (kind: image, video or audio; by the name if left out)
  files: {
    type: Array,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  // The keys are left to an overlay opened over the viewer
  paused: {
    type: Boolean,
    default: false
  },
  // file => {groups, extras} of its action rim (groups as returned by rimActionGroups()), or null for none
  rim: {
    type: Function,
    default: null
  }
});

// run(file, action, alt), extra(file, id, label), menu(event, file)
const emit = defineEmits(["update:index", "close", "run", "extra", "menu"]);

const file = computed(() => props.files[props.index]);

// ---------- Action rim ----------

const rootElement = ref(null);
const rimContent = computed(() => props.rim?.(file.value) ?? null);
const rimShown = computed(() => !!pointerRim.value);
const rimTitle = computed(() => `Show actions (or ${buttonName(rimButton()).toLowerCase()}-click)`);

// At the point of a press, or of the window center
function openRim(point) {
  const content = rimContent.value;
  const shown = file.value;

  openPointerRim(point, {
    groups: content.groups,
    extras: content.extras,
    hub: "close",
    on: {
      run: (action, alt) => emit("run", shown, action, alt),
      extra: id => emit("extra", shown, id, content.extras.find(extra => extra.id === id)?.label ?? ""),
      close: () => emit("close")
    }
  });
}

watch(() => props.index, closePointerRim);

// A click on the button while the rim is shown only closes it (a press outside the rim does)
function toggleRim() {
  openRim({clientX: window.innerWidth / 2, clientY: window.innerHeight / 2});
}

function inViewer(e) {
  return !props.paused && !!rootElement.value?.contains(e.target);
}

function onMouseDown(e) {
  // The rim button toggles the rim
  if (!inViewer(e) || e.target.closest(".rim-button"))
    return;

  if (e.button === rimButton() && rimContent.value) {
    // No autoscroll
    e.preventDefault();
    openRim(e);
  }
  else if (e.button === 1)
    e.preventDefault();
}

function onAuxClick(e) {
  if (e.button === 1 && menuButton() === 1 && inViewer(e)) {
    e.preventDefault();
    emit("menu", e, file.value);
  }
}

function onContextMenu(e) {
  if (!inViewer(e))
    return;

  e.preventDefault();

  if (menuButton() === 2)
    emit("menu", e, file.value);
}

onBeforeUnmount(closePointerRim);

// ---------- Keys ----------
const kind = computed(() => file.value ? file.value.kind ?? mediaKindOfName(file.value.name) : KIND_IMAGE);

function step(delta) {
  const index = props.index + delta;

  if (index >= 0 && index < props.files.length)
    emit("update:index", index);
}

function onKeydown(e) {
  if (props.paused)
    return;

  if (e.key === "Escape" || e.key === "Esc")
    emit("close");
  else if (e.key === "ArrowLeft")
    step(-1);
  else if (e.key === "ArrowRight")
    step(1);
  else
    return;

  e.preventDefault();
  e.stopPropagation();
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("auxclick", onAuxClick, true);
  window.addEventListener("contextmenu", onContextMenu, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("mousedown", onMouseDown, true);
  window.removeEventListener("auxclick", onAuxClick, true);
  window.removeEventListener("contextmenu", onContextMenu, true);
});
</script>

<template>
  <Teleport to="body">
    <div ref="rootElement" class="file-viewer" @click.self="emit('close')">
      <MediaView v-if="file && kind !== KIND_IMAGE" :key="file.url" class="media" :src="file.url" :kind="kind"/>
      <img v-else-if="file" :src="file.url" :alt="file.name" @click="emit('close')">
      <div class="bar">
        <button class="ib flat" :disabled="index === 0" aria-label="Previous" @click="step(-1)"
          ><AppIcon name="chevron" :size="16" class="prev"/></button>
        <span class="name">{{ file?.name }}</span>
        <span class="position">{{ index + 1 }} / {{ files.length }}</span>
        <button class="ib flat" :disabled="index === files.length - 1" aria-label="Next" @click="step(1)"
          ><AppIcon name="chevron" :size="16" class="next"/></button>
        <a class="ib flat" :href="file?.url" target="_blank" title="Open in a new window" aria-label="Open in a new window"
          ><AppIcon name="external" :size="14"/></a>
        <button class="ib flat" aria-label="Close" @click="emit('close')"><AppIcon name="close" :size="14"/></button>
      </div>
      <button v-if="rimContent" type="button" class="ib rim-button" :class="{on: rimShown}" :aria-pressed="rimShown"
              aria-label="Show actions" :title="rimShown ? 'Hide actions' : rimTitle"
              @click="toggleRim"><AppIcon name="rim" :size="18"/></button>
    </div>
  </Teleport>
</template>

<style scoped>
/* Below the parameters overlay, the dialogs and the context menu */
.file-viewer {
  position: fixed;
  inset: 0;
  z-index: 990;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 16px 56px;
  background: rgba(0, 0, 0, 0.88);
}

img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: zoom-out;
}

.media {
  width: 100%;
  height: 100%;
}

.bar {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 32px);
  padding: 4px 8px;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: var(--ib-elev);
}

.rim-button {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.rim-button.on {
  color: var(--ib-accent);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.position {
  color: var(--ib-muted);
  font-size: 11px;
  white-space: nowrap;
}

.prev {
  transform: rotate(90deg);
}

.next {
  transform: rotate(-90deg);
}
</style>
