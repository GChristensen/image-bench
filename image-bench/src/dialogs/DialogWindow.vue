<script setup>
import { computed, onMounted, ref } from 'vue';
import { useLocalStorage } from '@/composables/useLocalStorage.js';

const props = defineProps({
  entry: {
    type: Object,
    required: true,
    validator: (value) => ['alert', 'confirm', 'prompt'].includes(value.kind)
  }
});

const emit = defineEmits(['close']);

const storage = useLocalStorage();

const options = computed(() => props.entry.options);
const isPrompt = computed(() => props.entry.kind === 'prompt');
const title = computed(() => options.value.title || (isPrompt.value ? '' : props.entry.kind === 'confirm' ? 'Confirm' : 'Image Bench'));

const inputValue = ref(options.value.defaultValue ?? '');
const inputRef = ref(null);
const okRef = ref(null);

const historyKey = computed(() => `imageBench_promptHistory_${options.value.storageKey || 'default'}`);
const datalistId = computed(() => `dialog-history-${props.entry.id}`);
const history = ref(isPrompt.value ? storage.getJsonItem(historyKey.value, []) : []);

function saveToHistory(value) {
  const items = [value, ...storage.getJsonItem(historyKey.value, []).filter(item => item !== value)].slice(0, 10);
  storage.setJsonItem(historyKey.value, items);
}

function confirm() {
  if (props.entry.kind === 'alert') {
    emit('close', undefined);
  }
  else if (props.entry.kind === 'confirm') {
    emit('close', true);
  }
  else {
    const value = String(inputValue.value).trim();

    if (value) {
      saveToHistory(value);
      emit('close', value);
    }
    else
      cancel();
  }
}

function cancel() {
  emit('close', props.entry.cancelValue);
}

// Deferred to a macrotask: dialogs opened from a mousedown handler would otherwise
// lose focus to the button's default mousedown action
onMounted(() => setTimeout(() => {
  if (isPrompt.value) {
    inputRef.value?.focus();
    inputRef.value?.select();
  }
  else
    okRef.value?.focus();
}));

defineExpose({confirm, cancel});
</script>

<template>
  <div class="dialog-container">
    <div class="dialog-backdrop" @click="cancel"></div>
    <div class="dialog-window" role="dialog" aria-modal="true" :aria-label="title || entry.message">
      <div v-if="title" class="dialog-header">
        <h3>{{ title }}</h3>
      </div>
      <div class="dialog-body">
        <label v-if="isPrompt" class="dialog-message" :for="`dialog-input-${entry.id}`">{{ entry.message }}</label>
        <p v-else class="dialog-message">{{ entry.message }}</p>
        <template v-if="isPrompt">
          <input :id="`dialog-input-${entry.id}`"
                 ref="inputRef"
                 v-model="inputValue"
                 type="text"
                 class="dialog-input"
                 :list="datalistId"
                 :placeholder="options.placeholder || 'Enter value...'"/>
          <datalist :id="datalistId">
            <option v-for="item in history" :key="item" :value="item"/>
          </datalist>
        </template>
      </div>
      <div class="dialog-footer">
        <button v-if="entry.kind !== 'alert'" class="btn outline" @click="cancel">{{ options.cancelText || 'Cancel' }}</button>
        <button ref="okRef" class="btn" :class="options.danger ? 'stop' : 'primary'" @click="confirm">{{ options.okText || 'OK' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
}

.dialog-window {
  position: relative;
  min-width: 380px;
  max-width: min(600px, calc(100vw - 32px));
  background: var(--ib-elev);
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  color: var(--ib-text);
}

.dialog-header {
  padding: 14px 18px 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.dialog-body {
  padding: 12px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dialog-message {
  margin: 0;
  color: var(--ib-text-2);
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  font: inherit;
  background: var(--ib-bg);
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  color: var(--ib-text);
  outline: none;
}

.dialog-input:focus {
  border-color: var(--ib-accent-border);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--ib-border);
}
</style>
