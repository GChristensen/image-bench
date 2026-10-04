<script setup>
/**
 * Presentational explore list: presets, preset controls, settings row and checkable item list
 */
defineProps({
  items: {
    type: Array,
    required: true,
    validator: items => items.every(item => 'key' in item && 'label' in item)
  },
  selected: {
    type: Set,
    required: true
  },
  presetNames: {
    type: Array,
    required: true
  },
  currentPreset: {
    type: String,
    default: ""
  },
  focusedKey: {
    type: String,
    default: null
  },
  params: {
    type: Object,
    default: () => ({})
  },
  summary: {
    type: String,
    default: "default"
  },
  itemKind: {
    type: String,
    default: "item"
  }
});

const emit = defineEmits(['toggle', 'focus', 'preset-change', 'create', 'save', 'delete', 'clear', 'edit-settings']);
</script>

<template>
  <div class="explore-list">
    <div>
      Presets&nbsp;
      <select class="presets" :value="currentPreset" @change="e => emit('preset-change', e.target.value)">
        <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>
    <div class="preset-controls">
      <a class="control-link" href="#" @click.prevent="emit('create')">Create</a
      >&nbsp;<a class="control-link" href="#" @click.prevent="emit('save')">Save</a
      >&nbsp;<a class="control-link" href="#" @click.prevent="emit('delete')">Delete</a
      >&nbsp;<a class="control-link" href="#" @click.prevent="emit('clear')">Clear</a>
    </div>
    <div class="item-settings">
      <span class="item-settings-summary" :title="summary">🧪 {{ summary }}</span>
      <button class="item-settings-button" :disabled="!focusedKey"
              :title="focusedKey ? `Set parameters for ${focusedKey}` : `Click a ${itemKind} name first`"
              @click="emit('edit-settings')">⚙</button>
    </div>
    <div class="items-container">
      <div class="items">
        <div v-for="item in items" :key="item.key" class="item"
             :class="{focused: focusedKey === item.key}">
          <input type="checkbox"
                 :checked="selected.has(item.key)"
                 @change="e => emit('toggle', item.key, e.target.checked)"
          >&nbsp;<span class="item-label" @click="emit('focus', item.key)"
            >{{ item.label }}<span v-if="params[item.key]" title="Has custom parameters">&nbsp;🧪</span></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explore-list {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.presets {
  min-width: 100px;
}

.preset-controls {
  margin-top: 2px;
  margin-bottom: 4px;
}

.control-link {
  padding: 2px 5px;
  cursor: pointer;
  text-decoration: none;
  color: white;
  white-space: nowrap;
}

.control-link:hover {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.item-settings {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: solid 1px white;
}

.item-settings-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-settings-button {
  flex-shrink: 0;
  background: none;
  border: 1px solid #888;
  border-radius: 3px;
  color: white;
  cursor: pointer;
  padding: 0 5px;
}

.item-settings-button:hover:not(:disabled) {
  background-color: #f0f0f0;
  color: var(--vt-c-black);
}

.item-settings-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.items-container {
  position: relative;
  flex-grow: 1;
  width: 280px;
}

.items {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: auto;
}

.item {
  white-space: nowrap;
}

.item.focused {
  background-color: rgba(255, 255, 255, 0.15);
}

.item-label {
  cursor: pointer;
}
</style>
