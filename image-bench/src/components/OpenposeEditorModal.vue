<script setup>
/**
 * OpenPose editor of sd-webui-openpose-editor (/openpose_editor_index of WebUI) in a frame, as sd-webui-controlnet
 * showed it: when the editor reports it is ready, it receives the pose JSON of the preview and the control image as
 * its background; its "Send pose to ControlNet" button sends the edited pose back, which is emitted as `apply`.
 * The editor accepts messages only from a window of its own origin, which the popup is.
 */
import {onBeforeUnmount, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {OPENPOSE_EDITOR_URL} from "@/openposeEditor.js";

// Identifies the editor session in the messages of the editor
const MODAL_ID = "image-bench-openpose";

const props = defineProps({
  // Pose JSON as a data:application/json;base64 URL
  pose: {
    type: String,
    required: true
  },
  // Background image of the editor (the control image), any source the popup can fetch
  image: {
    type: String,
    default: null
  },
  title: {
    type: String,
    default: "OpenPose editor"
  }
});

const emit = defineEmits(['close', 'apply']);

const frame = ref(null);
const loading = ref(true);

// The editor accepts only data URLs as the background
async function toDataURL(source) {
  if (!source || source.startsWith("data:image/"))
    return source;

  const blob = await (await fetch(source)).blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const imageURL = toDataURL(props.image).catch(e => {
  console.error("[Image Bench] Unable to read the OpenPose background image:", e);
  return null;
});

async function onMessage(e) {
  if (e.source !== frame.value?.contentWindow || e.origin !== location.origin || !e.data || typeof e.data !== "object")
    return;

  if (e.data.ready) {
    loading.value = false;

    const message = {modalId: MODAL_ID, poseURL: props.pose};
    const background = await imageURL;

    if (background)
      message.imageURL = background;

    frame.value?.contentWindow.postMessage(message, location.origin);
  }
  else if (e.data.modalId === MODAL_ID && typeof e.data.poseURL === "string")
    emit('apply', e.data.poseURL);
}

// Keys pressed in the editor stay in its frame
function onKeydown(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div class="openpose-container">
      <div class="backdrop" @click="emit('close')"></div>
      <div class="window" role="dialog" aria-modal="true" :aria-label="title">
        <div class="header">
          <h3>{{ title }}</h3>
          <span class="hint">"Send pose to ControlNet" puts the edited pose into the preview of the unit</span>
          <button type="button" class="ib flat" title="Close (Esc)" aria-label="Close" @click="emit('close')">
            <AppIcon name="close" :size="14"/></button>
        </div>
        <div class="body">
          <iframe ref="frame" :src="`${OPENPOSE_EDITOR_URL}?theme=dark`" title="OpenPose editor"></iframe>
          <div v-if="loading" class="status"><span class="spinner"></span>Loading the editor…</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.openpose-container {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
}

.window {
  position: relative;
  width: calc(100vw - 32px);
  height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--ib-elev);
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  color: var(--ib-text);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px 8px 18px;
  border-bottom: 1px solid var(--ib-border);
}

.header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-text-2);
}

.body {
  position: relative;
  flex: 1;
  min-height: 0;
}

iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #141414;
}

.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ib-text-2);
  background: var(--ib-elev);
}
</style>
