<script setup>
import { computed, onMounted, ref } from 'vue';
import { useLocalStorage } from '@/composables/useLocalStorage.js';
import ComboInput from '@/dialogs/ComboInput.vue';
import FilterChecklist from '@/components/FilterChecklist.vue';
import ModelInfoContent from '@/dialogs/ModelInfoContent.vue';
import HostErrorsContent from '@/dialogs/HostErrorsContent.vue';

const props = defineProps({
  entry: {
    type: Object,
    required: true,
    validator: (value) => ['alert', 'confirm', 'prompt', 'checklist', 'modelInfo', 'hostErrors'].includes(value.kind)
  }
});

const emit = defineEmits(['close']);

const storage = useLocalStorage();

const options = computed(() => props.entry.options);
const isPrompt = computed(() => props.entry.kind === 'prompt');
const isChecklist = computed(() => props.entry.kind === 'checklist');
const title = computed(() => options.value.title || (isPrompt.value ? '' : props.entry.kind === 'confirm' ? 'Confirm' : 'Image Bench'));

const inputValue = ref(options.value.defaultValue ?? '');
const inputRef = ref(null);
const textareaRef = ref(null);
const comboRef = ref(null);
const okRef = ref(null);
const checklistRef = ref(null);

const checked = ref([...(options.value.selected ?? [])]);
// Prompt with a checkbox under the input (options.checkbox: {label, checked})
const checkboxChecked = ref(!!options.value.checkbox?.checked);
// Prompt with a switch over the input (options.choices: {items: [{value, label, title?}], value})
const choice = ref(options.value.choices?.value ?? options.value.choices?.items[0]?.value);
const checklistFilter = ref(options.value.filter ?? '');
const okText = computed(() => typeof options.value.okText === 'function'
  ? options.value.okText(checked.value.length)
  : options.value.okText || 'OK');

const historyKey = computed(() => `imageBench_promptHistory_${options.value.storageKey || 'default'}`);
const historySize = computed(() => options.value.historySize || 10);
const datalistId = computed(() => `dialog-history-${props.entry.id}`);
const history = ref(isPrompt.value && !options.value.multiline ? readHistory() : []);

// The default value is usually the last submitted one, which may predate the history
const dropdownItems = computed(() => {
  const defaultValue = String(options.value.defaultValue ?? '').trim();
  const items = defaultValue && !history.value.includes(defaultValue) ? [defaultValue, ...history.value] : history.value;
  return items.slice(0, historySize.value);
});

function readHistory() {
  return storage.getJsonItem(historyKey.value, []).slice(0, historySize.value);
}

function saveToHistory(value) {
  const items = [value, ...readHistory().filter(item => item !== value)].slice(0, historySize.value);
  storage.setJsonItem(historyKey.value, items);
}

function confirm() {
  if (props.entry.kind === 'alert') {
    emit('close', undefined);
  }
  else if (props.entry.kind === 'confirm') {
    emit('close', true);
  }
  else if (props.entry.kind === 'modelInfo') {
    emit('close', 'open');
  }
  else if (props.entry.kind === 'hostErrors') {
    emit('close', null);
  }
  else if (isChecklist.value) {
    if (checked.value.length)
      emit('close', [...checked.value]);
  }
  else {
    const value = String(inputValue.value).trim();

    if (value) {
      if (!options.value.multiline)
        saveToHistory(value);

      if (options.value.checkbox || options.value.choices)
        emit('close', {
          value,
          ...options.value.checkbox && {checked: checkboxChecked.value},
          ...options.value.choices && {choice: choice.value}
        });
      else
        emit('close', value);
    }
    else
      cancel();
  }
}

function cancel() {
  emit('close', props.entry.cancelValue);
}

// Enter/Escape are captured by DialogHost, so an open dropdown gets them first here
function onEnterKey() {
  if (!comboRef.value?.pickHighlighted())
    confirm();
}

function onEscapeKey() {
  if (comboRef.value?.isOpen)
    comboRef.value.close();
  else
    cancel();
}

// Enter in a multiline input is a newline, Ctrl+Enter confirms
function keepsKey(e) {
  return e.key === 'Enter' && e.target === textareaRef.value && !e.ctrlKey && !e.metaKey;
}

// Deferred to a macrotask: dialogs opened from a mousedown handler would otherwise
// lose focus to the button's default mousedown action
onMounted(() => setTimeout(() => {
  if (isPrompt.value) {
    const input = comboRef.value || inputRef.value || textareaRef.value;
    input?.focus();

    if (input !== textareaRef.value)
      input?.select();
  }
  else if (isChecklist.value)
    checklistRef.value?.focus();
  else
    okRef.value?.focus();
}));

defineExpose({onEnterKey, onEscapeKey, keepsKey});
</script>

<template>
  <div class="dialog-container">
    <div class="dialog-backdrop" @click="cancel"></div>
    <div class="dialog-window" :class="{wide: isPrompt && options.multiline}" role="dialog" aria-modal="true" :aria-label="title || entry.message">
      <div v-if="title" class="dialog-header">
        <h3>{{ title }}</h3>
      </div>
      <div class="dialog-body">
        <label v-if="isPrompt" class="dialog-message" :for="`dialog-input-${entry.id}`">{{ entry.message }}</label>
        <ModelInfoContent v-else-if="entry.kind === 'modelInfo'" :info="options.info"/>
        <HostErrorsContent v-else-if="entry.kind === 'hostErrors'" :error="options.error" :problems="options.problems"
                           @show="id => emit('close', id)"/>
        <p v-else-if="entry.message" class="dialog-message">{{ entry.message }}</p>
        <div v-if="isPrompt && options.choices" class="dialog-choices" role="radiogroup">
          <button v-for="item in options.choices.items" :key="item.value" type="button" role="radio"
                  :aria-checked="choice === item.value" :class="{on: choice === item.value}" :title="item.title"
                  @click="choice = item.value"><bdi>{{ item.label }}</bdi></button>
        </div>
        <FilterChecklist v-if="isChecklist" ref="checklistRef" v-model="checked" v-model:filter="checklistFilter"
                         :items="options.items" :groups="options.groups" :empty-text="options.emptyText"/>
        <ComboInput v-if="isPrompt && options.dropdown"
                    :id="`dialog-input-${entry.id}`"
                    ref="comboRef"
                    v-model="inputValue"
                    :items="dropdownItems"
                    :placeholder="options.placeholder || 'Enter value...'"/>
        <textarea v-else-if="isPrompt && options.multiline"
                  :id="`dialog-input-${entry.id}`"
                  ref="textareaRef"
                  v-model="inputValue"
                  class="dialog-input dialog-textarea"
                  :rows="options.rows || 8"
                  spellcheck="false"
                  :placeholder="options.placeholder || 'Enter value...'"></textarea>
        <template v-else-if="isPrompt">
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
        <label v-if="isPrompt && options.checkbox" class="dialog-check">
          <input v-model="checkboxChecked" type="checkbox">{{ options.checkbox.label }}</label>
      </div>
      <div class="dialog-footer">
        <button v-for="action in options.actions || []" :key="action.id" class="btn outline"
                @click="emit('close', action.id)">{{ action.label }}</button>
        <button v-if="entry.kind !== 'alert' && entry.kind !== 'hostErrors'" class="btn outline" @click="cancel">{{ options.cancelText || 'Cancel' }}</button>
        <button ref="okRef" class="btn" :class="options.danger ? 'stop' : 'primary'"
                :disabled="isChecklist && !checked.length" @click="confirm">{{ okText }}</button>
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

.dialog-window.wide {
  width: min(600px, calc(100vw - 32px));
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

.dialog-textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.4;
}

.dialog-input:focus {
  border-color: var(--ib-accent-border);
}

.dialog-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
}

.dialog-check input {
  margin: 0;
}

/* Segmented switch over the input of a prompt */
.dialog-choices {
  display: flex;
  padding: 2px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-bg);
}

.dialog-choices button {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.dialog-choices button:hover {
  color: var(--ib-text);
}

.dialog-choices button.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--ib-border);
}
</style>
