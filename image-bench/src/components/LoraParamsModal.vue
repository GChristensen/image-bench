<script setup>
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  loraName: {
    type: String,
    default: ''
  },
  params: {
    type: Object,
    default: null
  },
  defaults: {
    type: Object,
    default: () => ({weight: 1, text: ''}),
    validator: value => 'weight' in value && 'text' in value
  }
});

const emit = defineEmits(['confirm', 'cancel']);

const form = reactive({weight: 1, text: ''});
const firstFieldRef = ref(null);

watch(() => props.show, (newVal) => {
  if (newVal) {
    form.weight = props.params?.weight ?? props.defaults.weight;
    form.text = props.params?.text ?? props.defaults.text;

    setTimeout(() => firstFieldRef.value?.select(), 100);
  }
});

function onReset() {
  form.weight = props.defaults.weight;
  form.text = props.defaults.text;
}

function onConfirm() {
  const weight = Number(form.weight);

  emit('confirm', {
    weight: form.weight === '' || Number.isNaN(weight) ? props.defaults.weight : weight,
    text: form.text.trim()
  });
}

function onCancel() {
  emit('cancel');
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    onConfirm();
  }
}

function handleDocumentKeydown(e) {
  if (props.show && e.key === 'Escape') {
    e.preventDefault();
    onCancel();
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
      <div v-if="show" class="params-modal-container">
        <div class="params-modal-overlay" @click="onCancel"></div>
        <Transition name="zoom">
          <div v-if="show" class="params-modal-content" @keydown="onKeydown">
            <div class="params-modal-header">
              <h3 :title="loraName">🧪 {{ loraName }}</h3>
              <button class="close-button" @click="onCancel" title="Cancel (Esc)">✖</button>
            </div>
            <div class="params-modal-body">
              <label>Weight</label>
              <input ref="firstFieldRef" type="number" step="0.05" v-model="form.weight">

              <label>Extra text</label>
              <input type="text" v-model="form.text" placeholder="appended after the LoRA tag">
            </div>
            <div class="params-modal-footer">
              <button class="btn btn-reset" @click="onReset">Reset</button>
              <div class="footer-spacer"></div>
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
.params-modal-container {
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

.params-modal-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 1001;
  cursor: pointer;
}

.params-modal-content {
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

.params-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #444;
}

.params-modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-button:hover {
  color: #fff;
}

.params-modal-body {
  padding: 20px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 14px;
  align-items: center;
}

.params-modal-body select,
.params-modal-body input {
  width: 100%;
  padding: 6px 8px;
  font-size: 14px;
  background: #1a1a1a;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
}

.params-modal-body select:focus,
.params-modal-body input:focus {
  border-color: #007bff;
}

.params-modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #444;
}

.footer-spacer {
  flex-grow: 1;
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

.btn-reset,
.btn-cancel {
  background: #444;
  color: #fff;
}

.btn-reset:hover,
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
