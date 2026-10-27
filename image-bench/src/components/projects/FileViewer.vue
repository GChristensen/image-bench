<script setup>
/**
 * Full-size view of the image files of a project, with ← / → through the files and Escape to close.
 * A video or audio file plays at once, with sound.
 * The actions of a file are its action rim (ActionRim.vue), as in the image overlay: a middle press shows it at the
 * pointer, released on a sector it runs it, released in the center it stays for clicks (its center closes the
 * viewer); the rim button at the lower right shows it in the middle of the window
 */
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import MediaView from "@/components/MediaView.vue";
import ActionRim from "@/components/ActionRim.vue";
import {useShiftKey} from "@/composables/useShiftKey.js";
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

// run(file, action, alt), extra(file, id, label)
const emit = defineEmits(["update:index", "close", "run", "extra"]);

const file = computed(() => props.files[props.index]);

// ---------- Action rim ----------

const shiftDown = useShiftKey();
const rootElement = ref(null);
const rimElement = ref(null);
const rimContent = computed(() => props.rim?.(file.value) ?? null);
// {x, y} while the rim is shown
const rimAt = ref(null);
// Half the extent of the rim with its arcs (ActionRim at its largest), kept inside the window
const RIM_EXTENT = 132;

function showRim(x, y) {
  rimAt.value = {
    x: Math.min(Math.max(x, RIM_EXTENT), window.innerWidth - RIM_EXTENT),
    y: Math.min(Math.max(y, RIM_EXTENT), window.innerHeight - RIM_EXTENT)
  };
}

function hideRim() {
  rimAt.value = null;
}

watch(() => props.index, hideRim);

function toggleRim() {
  if (rimAt.value)
    hideRim();
  else
    showRim(window.innerWidth / 2, window.innerHeight / 2);
}

function onRimRun(action, alt) {
  hideRim();
  emit("run", file.value, action, alt);
}

function onRimExtra(id) {
  const label = rimContent.value?.extras.find(extra => extra.id === id)?.label ?? "";
  hideRim();
  emit("extra", file.value, id, label);
}

// The middle button is held since it showed the rim
let gesture = false;
// A left press that only dismissed the rim: its click does not close the viewer
let suppressClick = false;
// A middle release that ran a sector: its auxclick does not run the alternative as well
let suppressAuxClick = false;

function onMouseDown(e) {
  suppressClick = false;
  suppressAuxClick = false;

  if (props.paused || !rimContent.value || !rootElement.value?.contains(e.target))
    return;

  // Clicks on the shown rim are its own, the rim button toggles it
  if (rimAt.value && rimElement.value?.$el.contains(e.target) || e.target.closest(".rim-button"))
    return;

  if (rimAt.value) {
    hideRim();

    if (e.button === 0) {
      suppressClick = true;
      e.preventDefault();
      return;
    }
  }

  if (e.button !== 1)
    return;

  // No autoscroll
  e.preventDefault();
  gesture = true;
  showRim(e.clientX, e.clientY);
}

function onMouseUp(e) {
  if (e.button !== 1 || !gesture)
    return;

  gesture = false;
  const target = rimElement.value?.releaseAt(e.clientX, e.clientY, e.shiftKey);

  if (target !== "center")
    hideRim();

  suppressAuxClick = target === "item";
}

function onClick(e) {
  if (!suppressClick)
    return;

  suppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}

function onAuxClick(e) {
  if (!suppressAuxClick)
    return;

  suppressAuxClick = false;
  e.preventDefault();
  e.stopPropagation();
}

function onWindowBlur() {
  gesture = false;
}

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

  if ((e.key === "Escape" || e.key === "Esc") && rimAt.value)
    hideRim();
  else if (e.key === "Escape" || e.key === "Esc")
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
  window.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onAuxClick, true);
  window.addEventListener("blur", onWindowBlur);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("mousedown", onMouseDown, true);
  window.removeEventListener("mouseup", onMouseUp, true);
  window.removeEventListener("click", onClick, true);
  window.removeEventListener("auxclick", onAuxClick, true);
  window.removeEventListener("blur", onWindowBlur);
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
      <button v-if="rimContent" type="button" class="ib rim-button" :class="{on: rimAt}" :aria-pressed="!!rimAt"
              aria-label="Show actions" :title="rimAt ? 'Hide actions' : 'Show actions (or middle-click)'"
              @click="toggleRim"><AppIcon name="rim" :size="18"/></button>
      <!-- A box without size at the pointer: the rim centers itself on it -->
      <div v-if="rimAt && rimContent" class="viewer-rim" :style="{left: rimAt.x + 'px', top: rimAt.y + 'px'}">
        <ActionRim ref="rimElement" :groups="rimContent.groups" :extras="rimContent.extras" :size="1000" hub="close"
                   :show-alt="shiftDown" @run="onRimRun" @extra="onRimExtra" @close="emit('close')"/>
      </div>
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

.viewer-rim {
  position: fixed;
  width: 0;
  height: 0;
  z-index: 1;
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
