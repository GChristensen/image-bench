<script setup>
import { onMounted, onUnmounted } from 'vue';
import {clearViews, clearViewsAndTrays, startBlankWorkspace, VIEWS} from "@/workspace.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {HOST_NAME, isWebUI} from "@/host.js";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

// Key used by webui-extension/javascript/persistence.js; the popup shares the WebUI origin
const GENERATION_PARAMS_KEY = "image-bench-generation-params";
const storage = useLocalStorage();

async function onClearViewsClick() {
  if (await dialog.confirm(`Removes all images from the ${VIEWS}. The image and concept trays, the Compare tab, `
      + "the prompts and the parameters are kept, and no files are deleted from disk.",
      {title: "Clear generated images", okText: "Clear"})) {
    clearViews();
    emit('close');
  }
}

async function onClearAllClick() {
  if (await startBlankWorkspace())
    emit('close');
}

async function onDeleteOutputsClick() {
  if (await dialog.confirm(`Permanently deletes every file and folder in the ${HOST_NAME} outputs directory, `
      + `including the images of the trays, the Compare tab and the Upscaled tab, and empties all tabs and trays. `
      + "This cannot be undone.", {title: "Delete all output files", okText: "Delete files", danger: true})) {
    clearViewsAndTrays();
    setTimeout(() => fetch("/image-bench/clear_outputs_dir", {method: "POST"}), 500);
    emit('close');
  }
}

async function onResetParamsClick() {
  if (await dialog.confirm("Forgets the prompts and parameters Image Bench saved after each generation, so they are "
      + "not restored when the WebUI page is reloaded. Images and settings are not affected.",
      {title: "Reset saved parameters", okText: "Reset"})) {
    storage.removeItem(GENERATION_PARAMS_KEY);
    emit('close');
  }
}

function onClose() {
  emit('close');
}

// Handle keyboard shortcuts at document level
function handleDocumentKeydown(e) {
  if (props.show) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleDocumentKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="actions-modal-container">
        <div class="actions-modal-overlay" @click="onClose"></div>
        <Transition name="zoom">
          <div v-if="show" class="actions-modal-content">
            <div class="actions-modal-header">
              <h3>Clean up</h3>
              <button class="close-button" @click="onClose" title="Close (Esc)">✖</button>
            </div>
            <div class="actions-modal-body">
              <button class="action-button" @click="onClearViewsClick">
                <span class="action-icons"><AppIcon name="nuke" :size="16"/></span>
                <span class="action-text">Clear generated images<small>Trays, prompts and parameters are kept, files stay on disk</small></span>
              </button>
              <button class="action-button" @click="onClearAllClick">
                <span class="action-icons"><AppIcon v-for="n in 2" :key="n" name="nuke" :size="16"/></span>
                <span class="action-text">Start a blank workspace<small>Clears all images, trays and prompts, randomizes the seed, closes the project; files stay on disk</small></span>
              </button>
              <button class="action-button danger" @click="onDeleteOutputsClick">
                <span class="action-icons"><AppIcon v-for="n in 3" :key="n" name="nuke" :size="16"/></span>
                <span class="action-text">Delete all output files<small>Deletes the outputs directory, cannot be undone</small></span>
              </button>
              <button v-if="isWebUI" class="action-button" @click="onResetParamsClick">
                <span class="action-icons"><AppIcon name="reset" :size="16"/></span>
                <span class="action-text">Reset saved generation parameters<small>Prompts and parameters restored on page reload</small></span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.actions-modal-container {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.actions-modal-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 1001;
  cursor: pointer;
}

.actions-modal-content {
  position: relative;
  z-index: 1002;
  background: var(--ib-elev);
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  min-width: 400px;
  max-width: min(600px, calc(100vw - 32px));
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  color: var(--ib-text);
}

.actions-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ib-border);
}

.actions-modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  color: var(--ib-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-button:hover {
  color: var(--ib-text);
}

.actions-modal-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-button {
  display: grid;
  grid-template-columns: 60px 1fr;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  font-size: 14px;
  background: var(--ib-elev-2);
  color: var(--ib-text);
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
  font-weight: 500;
  text-align: left;
}

.action-button:hover {
  background: var(--ib-hover);
}

.action-button.danger:hover {
  border-color: var(--ib-danger);
  color: var(--ib-danger-text);
}

/* Right-aligned, so that the labels of all rows start in one column */
.action-icons {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.action-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-text small {
  font-size: 12px;
  font-weight: 400;
  color: var(--ib-muted);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.zoom-enter-active,
.zoom-leave-active {
  transition: transform 0.2s, opacity 0.2s;
}

.zoom-enter-from,
.zoom-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
