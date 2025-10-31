<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useLocalStorage } from '@/composables/useLocalStorage.js';

const props = defineProps({
  message: {
    type: String,
    required: true
  },
  defaultValue: {
    type: String,
    default: ''
  },
  storageKey: {
    type: String,
    required: true
  },
  show: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['confirm', 'cancel']);

const storage = useLocalStorage();
const inputValue = ref(props.defaultValue);
const inputRef = ref(null);

// Generate unique datalist id based on storage key
const datalistId = computed(() => `prompt-history-${props.storageKey}`);

// Get history from localStorage (using ref for reactivity)
const history = ref([]);

// Watch for show prop changes to reset input and focus
watch(() => props.show, (newVal) => {
  if (newVal) {
    inputValue.value = props.defaultValue;

    // Load history from localStorage
    const historyKey = `imageBench_promptHistory_${props.storageKey}`;
    history.value = storage.getJsonItem(historyKey, []);

    // Focus input after transition
    setTimeout(() => {
      if (inputRef.value) {
        inputRef.value.focus();
        inputRef.value.select();
      }
    }, 100);
  }
});

function saveToHistory(value) {
  if (!value || !value.trim()) return;

  const historyKey = `imageBench_promptHistory_${props.storageKey}`;
  let historyItems = storage.getJsonItem(historyKey, []);

  // Remove if already exists (to move to front)
  historyItems = historyItems.filter(item => item !== value);

  // Add to beginning
  historyItems.unshift(value);

  // Keep only last 10 items
  historyItems = historyItems.slice(0, 10);

  storage.setJsonItem(historyKey, historyItems);

  // Update the reactive ref so datalist updates immediately
  history.value = historyItems;
}

function onConfirm() {
  const value = inputValue.value.trim();
  if (value) {
    saveToHistory(value);
    emit('confirm', value);
  } else {
    emit('cancel');
  }
}

function onCancel() {
  emit('cancel');
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    onConfirm();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  }
}

// Handle keyboard shortcuts at document level
function handleDocumentKeydown(e) {
  if (props.show) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
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
      <div v-if="show" class="prompt-modal-container">
        <div class="prompt-modal-overlay" @click="onCancel"></div>
        <Transition name="zoom">
          <div v-if="show" class="prompt-modal-content">
            <div class="prompt-modal-header">
              <h3>{{ message }}</h3>
              <button class="close-button" @click="onCancel" title="Cancel (Esc)">✖</button>
            </div>
            <div class="prompt-modal-body">
              <input
                ref="inputRef"
                v-model="inputValue"
                type="text"
                class="prompt-input"
                :list="datalistId"
                @keydown="onKeydown"
                placeholder="Enter value..."
              />
              <datalist :id="datalistId">
                <option v-for="item in history" :key="item" :value="item" />
              </datalist>
            </div>
            <div class="prompt-modal-footer">
              <button class="btn btn-cancel" @click="onCancel">Cancel</button>
              <button class="btn btn-confirm" @click="onConfirm">OK</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prompt-modal-container {
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

.prompt-modal-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 1001;
  cursor: pointer;
}

.prompt-modal-content {
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

.prompt-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #444;
}

.prompt-modal-header h3 {
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

.prompt-modal-body {
  padding: 20px;
}

.prompt-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: #1a1a1a;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
}

.prompt-input:focus {
  border-color: #007bff;
}

.prompt-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #444;
}

.btn {
  padding: 8px 16px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-weight: 500;
}

.btn-cancel {
  background: #444;
  color: #fff;
}

.btn-cancel:hover {
  background: #555;
}

.btn-confirm {
  background: #007bff;
  color: #fff;
}

.btn-confirm:hover {
  background: #0056b3;
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
