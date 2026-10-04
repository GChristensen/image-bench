<script setup>
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  modelName: {
    type: String,
    default: ''
  },
  params: {
    type: Object,
    default: null
  },
  samplers: {
    type: Array,
    default: () => []
  },
  schedulers: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['confirm', 'cancel']);

const PARAM_KEYS = ['sampler', 'scheduler', 'steps', 'shift', 'cfg', 'distilledCfg'];
const NUMERIC_KEYS = ['steps', 'shift', 'cfg', 'distilledCfg'];

const form = reactive(Object.fromEntries(PARAM_KEYS.map(k => [k, ''])));
const firstFieldRef = ref(null);

watch(() => props.show, (newVal) => {
  if (newVal) {
    for (const key of PARAM_KEYS)
      form[key] = props.params?.[key] ?? '';

    setTimeout(() => firstFieldRef.value?.focus(), 100);
  }
});

function onReset() {
  for (const key of PARAM_KEYS)
    form[key] = '';
}

function onConfirm() {
  const params = {};

  for (const key of PARAM_KEYS) {
    const value = form[key];

    if (value === '' || value === null || value === undefined)
      continue;

    if (NUMERIC_KEYS.includes(key)) {
      const number = Number(value);
      if (!Number.isNaN(number))
        params[key] = number;
    }
    else
      params[key] = value;
  }

  emit('confirm', params);
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
              <h3 :title="modelName">🧪 {{ modelName }}</h3>
              <button class="close-button" @click="onCancel" title="Cancel (Esc)">✖</button>
            </div>
            <div class="params-modal-body">
              <label>Sampling method</label>
              <select ref="firstFieldRef" v-model="form.sampler">
                <option value="">— default —</option>
                <option v-for="name in samplers" :key="name" :value="name">{{ name }}</option>
              </select>

              <label>Schedule type</label>
              <select v-model="form.scheduler">
                <option value="">— default —</option>
                <option v-for="name in schedulers" :key="name" :value="name">{{ name }}</option>
              </select>

              <label>Sampling steps</label>
              <input type="number" min="1" step="1" v-model="form.steps" placeholder="default">

              <label>Shift</label>
              <input type="number" min="1" step="0.5" v-model="form.shift" placeholder="default">

              <label>CFG scale</label>
              <input type="number" min="1" step="0.5" v-model="form.cfg" placeholder="default">

              <label>Distilled CFG scale</label>
              <input type="number" min="1" step="0.5" v-model="form.distilledCfg" placeholder="default">
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
