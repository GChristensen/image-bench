<script setup>
import { ref } from 'vue';

// Editable dropdown: a text input with a list of suggested values that is not filtered by the input text

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
    validator: (value) => value.every(item => typeof item === 'string')
  },
  id: {
    type: String,
    default: undefined
  },
  placeholder: {
    type: String,
    default: ''
  }
});

const model = defineModel({type: [String, Number], default: ''});

const inputRef = ref(null);
const isOpen = ref(false);
const highlighted = ref(-1);

function open() {
  isOpen.value = true;
  highlighted.value = Math.max(props.items.indexOf(String(model.value)), -1);
}

function close() {
  isOpen.value = false;
  highlighted.value = -1;
}

function toggle() {
  isOpen.value ? close() : open();
  inputRef.value?.focus();
}

function pick(item) {
  model.value = item;
  close();
  inputRef.value?.focus();
}

/**
 * Select the highlighted item
 * @returns {boolean} true if an item was picked
 */
function pickHighlighted() {
  if (!isOpen.value || highlighted.value < 0)
    return false;

  pick(props.items[highlighted.value]);
  return true;
}

function moveHighlight(delta) {
  if (!isOpen.value) {
    open();
    return;
  }

  const count = props.items.length;

  if (count)
    highlighted.value = (highlighted.value + delta + count) % count;
}

function onKeydown(e) {
  if (e.key === 'ArrowDown' && e.altKey) {
    e.preventDefault();
    toggle();
  }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
  }
}

defineExpose({
  isOpen,
  close,
  pickHighlighted,
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select()
});
</script>

<template>
  <div class="combo">
    <input :id="id"
           ref="inputRef"
           v-model="model"
           type="text"
           class="combo-input"
           role="combobox"
           :aria-expanded="isOpen"
           autocomplete="off"
           :placeholder="placeholder"
           @keydown="onKeydown"
           @blur="close"/>
    <button type="button"
            class="combo-toggle"
            tabindex="-1"
            aria-label="Show recent values"
            @mousedown.prevent="toggle">▾</button>
    <ul v-if="isOpen" class="combo-list" role="listbox">
      <li v-for="(item, index) in items"
          :key="item"
          role="option"
          class="combo-item"
          :class="{highlighted: index === highlighted}"
          :aria-selected="index === highlighted"
          @mouseenter="highlighted = index"
          @mousedown.prevent="pick(item)">{{ item }}</li>
      <li v-if="!items.length" class="combo-empty">No recent values</li>
    </ul>
  </div>
</template>

<style scoped>
.combo {
  position: relative;
}

.combo-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 34px 7px 10px;
  font: inherit;
  background: var(--ib-bg);
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  color: var(--ib-text);
  outline: none;
}

.combo-input:focus {
  border-color: var(--ib-accent-border);
}

.combo-toggle {
  position: absolute;
  top: 1px;
  right: 1px;
  bottom: 1px;
  width: 32px;
  padding: 0;
  border: none;
  border-radius: 0 4px 4px 0;
  background: transparent;
  color: var(--ib-text-2);
  font-size: 18px;
  cursor: pointer;
}

.combo-toggle:hover {
  color: var(--ib-text);
}

.combo-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 1;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
  background: var(--ib-elev);
  border: 1px solid var(--ib-border-2);
  border-radius: 5px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.combo-item {
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.combo-empty {
  padding: 5px 10px;
  color: var(--ib-muted);
  font-style: italic;
}

.combo-item.highlighted {
  background: var(--ib-hover);
}
</style>
