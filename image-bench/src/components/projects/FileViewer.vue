<script setup>
/**
 * Full-size view of the image files of a project, with ← / → through the files and Escape to close.
 * A video or audio file plays at once, with sound.
 * The actions slot (with the shown file) is placed at the lower right
 */
import {computed, onBeforeUnmount, onMounted} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import MediaView from "@/components/MediaView.vue";
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
  }
});

const emit = defineEmits(["update:index", "close"]);

const file = computed(() => props.files[props.index]);
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

onMounted(() => document.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <Teleport to="body">
    <div class="file-viewer" @click.self="emit('close')">
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
      <div v-if="$slots.actions" class="actions">
        <slot name="actions" :file="file"/>
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

.actions {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.actions:empty {
  display: none;
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
