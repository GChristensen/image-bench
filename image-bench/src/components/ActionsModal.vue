<script setup>
import { onMounted, onUnmounted } from 'vue';
import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {dialog} from "@/dialogs/useDialog.js";

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

const exploreImagesStore = useExploreImagesStore();
const generatedImagesStore = useGeneratedImagesStore();
const conceptTrayStore = useConceptTrayStore();
const imageTrayStore = useImageTrayStore();
const upscaledImageStore = useUpscaledImagesStore();

function clearImageStores() {
  exploreImagesStore.clear();
  generatedImagesStore.clear();
  imageTrayStore.clear();
  conceptTrayStore.clear();
  upscaledImageStore.clear();
}

async function onClearImagesClick() {
  if (await dialog.confirm("This will clear all images from the UI. The image files will remain on disk. Do you want to continue?",
      {title: "Clear all images", okText: "Clear", danger: true})) {
    clearImageStores();
    emit('close');
  }
}

async function onClearOutputsClick() {
  if (await dialog.confirm("This will permanently delete all files and folders in the outputs dir. Do you want to continue?",
      {title: "Clear outputs", okText: "Delete files", danger: true})) {
    clearImageStores();
    setTimeout(() => fetch("/image-bench/clear_outputs_dir"), 500);
    emit('close');
  }
}

async function onClearGeneratedImagesClick() {
  if (await dialog.confirm("This will permanently delete all generated images except saved in Image Bench trays. Do you want to continue?",
      {title: "Clear generated images", okText: "Delete", danger: true})) {
    setTimeout(() => fetch("/image-bench/clear_generated_images"), 500);
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
              <h3>Actions</h3>
              <button class="close-button" @click="onClose" title="Close (Esc)">✖</button>
            </div>
            <div class="actions-modal-body">
              <button class="action-button" @click="onClearGeneratedImagesClick">
                ☢️ Clear generated images (UI only)
              </button>
              <button class="action-button" @click="onClearImagesClick">
                ☢️☢️ Clear all images (UI only)
              </button>
              <button class="action-button" @click="onClearOutputsClick">
                ☢️☢️☢️ Clear outputs (remove files)
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
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 1001;
  cursor: pointer;
}

.actions-modal-content {
  position: relative;
  z-index: 1002;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  color: #fff;
}

.actions-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #444;
}

.actions-modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.close-button {
  background: none;
  border: none;
  color: #aaa;
  font-size: 20px;
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
  color: #fff;
}

.actions-modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-button {
  padding: 12px 20px;
  font-size: 14px;
  background: #444;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-weight: 500;
  text-align: left;
}

.action-button:hover {
  background: #555;
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
