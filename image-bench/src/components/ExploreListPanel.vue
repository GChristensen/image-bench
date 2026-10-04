<script setup>
/**
 * Presentational explore list: presets, preset controls, checkable item list and focused item parameters
 */
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
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

const menuOpen = ref(false);
const menuElement = ref(null);

const focusedLabel = computed(() => props.items.find(item => item.key === props.focusedKey)?.label ?? props.focusedKey);

// "Steps: 30, CFG: 5.5" -> [["Steps", "30"], ["CFG", "5.5"]]
const summaryChips = computed(() => props.summary === "default"
  ? []
  : props.summary.split(/, (?=[\w ]+: )/).map(part => {
      const i = part.indexOf(": ");
      return i < 0 ? ["", part] : [part.slice(0, i), part.slice(i + 2)];
    }));

function onMenuAction(event) {
  menuOpen.value = false;
  emit(event);
}

function onDocumentMousedown(e) {
  if (menuOpen.value && !menuElement.value?.contains(e.target))
    menuOpen.value = false;
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="explore-list">
    <div class="preset">
      <span class="label-small">Preset</span>
      <div class="preset-row" ref="menuElement">
        <div class="select-wrap">
          <select :value="currentPreset" aria-label="Preset" @change="e => emit('preset-change', e.target.value)">
            <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </div>
        <button class="ib" title="Save the checked items to the preset" aria-label="Save preset"
                @click="emit('save')"><AppIcon name="save"/></button>
        <button class="ib" :class="{on: menuOpen}" title="More preset actions" aria-label="More preset actions"
                :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><AppIcon name="more"/></button>
        <div v-if="menuOpen" class="menu preset-menu" role="menu">
          <button role="menuitem" @click="onMenuAction('create')"><AppIcon name="plus" :size="14"/>New preset…</button>
          <hr>
          <button role="menuitem" class="danger" :disabled="!currentPreset" @click="onMenuAction('delete')"
            ><AppIcon name="trash" :size="14"/>Delete preset</button>
        </div>
      </div>
    </div>

    <div class="list-header">
      <span>{{ selected.size }} of {{ items.length }} selected</span>
      <div class="toolbar-spacer"></div>
      <button class="btn small" :disabled="!selected.size" title="Uncheck all items" @click="emit('clear')"
        ><AppIcon name="eraser" :size="13"/>Clear</button>
    </div>

    <div class="items-container">
      <div class="items">
        <div v-for="item in items" :key="item.key" class="item"
               :class="{checked: selected.has(item.key), focused: focusedKey === item.key}"
               @click="emit('focus', item.key)">
          <input type="checkbox"
                 :checked="selected.has(item.key)"
                 @click.stop
                 @change="e => emit('toggle', item.key, e.target.checked)">
          <span class="item-label" :title="item.label">{{ item.label }}</span>
          <span v-if="params[item.key]" class="params-dot" title="Has custom parameters"></span>
        </div>
      </div>
    </div>

    <div class="item-settings">
      <div class="item-settings-header">
        <AppIcon name="flask" :size="14" class="item-settings-icon"/>
        <span v-if="focusedKey" class="item-settings-name" :title="focusedLabel">{{ focusedLabel }}</span>
        <span v-else class="item-settings-hint">Click a {{ itemKind }} name to set its parameters</span>
        <button class="ib sm" :disabled="!focusedKey"
                :title="focusedKey ? `Set parameters for ${focusedLabel}` : `Click a ${itemKind} name first`"
                aria-label="Edit parameters" @click="emit('edit-settings')"><AppIcon name="sliders" :size="13"/></button>
      </div>
      <div v-if="focusedKey" class="item-settings-chips" :title="summary">
        <span v-if="!summaryChips.length" class="chip">default parameters</span>
        <span v-for="[label, value] in summaryChips" :key="label" class="chip">{{ label }} <b>{{ value }}</b></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explore-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-grow: 1;
  min-height: 0;
}

.preset {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.preset-menu {
  right: 0;
  top: 30px;
}

.menu button:disabled {
  opacity: 0.4;
  cursor: default;
}

.list-header {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 0 6px 9px;
  border-bottom: 1px solid var(--ib-border);
  color: var(--ib-text-2);
}

.items-container {
  position: relative;
  flex-grow: 1;
}

.items {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 24px;
  padding: 0 8px 0 9px;
  border-radius: 4px;
  color: var(--ib-text-2);
  white-space: nowrap;
  cursor: pointer;
}

.item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--ib-text);
}

.item.checked {
  color: var(--ib-text);
}

.item.focused {
  background: rgba(44, 191, 138, 0.09);
  color: #fff;
  box-shadow: inset 2px 0 0 var(--ib-accent);
}

.item input {
  width: 13px;
  height: 13px;
  margin: 0;
  flex-shrink: 0;
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.params-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--ib-info);
  flex-shrink: 0;
}

.item-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--ib-border);
}

.item-settings-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-settings-icon {
  color: var(--ib-muted);
}

.item-settings-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--ib-text);
}

.item-settings-hint {
  flex: 1;
  color: var(--ib-muted);
  font-size: 12px;
}

.item-settings-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-settings-chips b {
  color: var(--ib-text);
  font-weight: 500;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
