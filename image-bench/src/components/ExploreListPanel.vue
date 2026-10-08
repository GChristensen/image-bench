<script setup>
/**
 * Presentational explore list: presets, preset controls, checkable item list and focused item parameters
 */
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const INDENT = 16;

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

const emit = defineEmits(['toggle', 'toggle-many', 'focus', 'preset-change', 'create', 'save', 'delete', 'clear', 'edit-settings']);

const storage = useLocalStorage();

const menuOpen = ref(false);
const menuElement = ref(null);

// Paths of folded folders, remembered per item kind
const collapsed = ref(new Set());
const collapsedStorageKey = computed(() => `imageBench_exploreCollapsed_${props.itemKind}`);

watch(collapsedStorageKey, key => collapsed.value = new Set(storage.getJsonItem(key, [])), {immediate: true});

function toggleFold(path) {
  const newCollapsed = new Set(collapsed.value);

  if (!newCollapsed.delete(path))
    newCollapsed.add(path);

  collapsed.value = newCollapsed;
  storage.setJsonItem(collapsedStorageKey.value, [...newCollapsed]);
}

// Folder tree built from the item label paths ("a/b/name" or "a\b\name"); folders precede items on each level
const tree = computed(() => {
  const root = {path: "", folders: new Map(), items: [], keys: []};

  for (const item of props.items) {
    const segments = item.label.split(/[\\/]/);
    const name = segments.pop();
    let node = root;

    root.keys.push(item.key);

    for (const segment of segments) {
      if (!node.folders.has(segment)) {
        const path = node.path ? `${node.path}/${segment}` : segment;
        node.folders.set(segment, {path, name: segment, folders: new Map(), items: [], keys: []});
      }

      node = node.folders.get(segment);
      node.keys.push(item.key);
    }

    node.items.push({...item, name});
  }

  return root;
});

// Visible rows of the unfolded part of the tree
const rows = computed(() => {
  const result = [];

  (function walk(node, depth) {
    for (const folder of node.folders.values()) {
      const open = !collapsed.value.has(folder.path);
      const checkedCount = folder.keys.reduce((n, key) => n + props.selected.has(key), 0);

      result.push({type: "folder", id: `folder:${folder.path}`, depth, open, checkedCount, folder});

      if (open)
        walk(folder, depth + 1);
    }

    for (const item of node.items)
      result.push({type: "item", id: `item:${item.key}`, depth, item});
  })(tree.value, 0);

  return result;
});

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
        <template v-for="row in rows" :key="row.id">
          <div v-if="row.type === 'folder'" class="item folder"
               :class="{checked: row.checkedCount > 0}"
               :style="{paddingLeft: `${9 + row.depth * INDENT}px`}"
               :title="row.folder.path"
               @click="toggleFold(row.folder.path)">
            <button class="fold-toggle" :class="{open: row.open}"
                    :aria-label="row.open ? 'Fold' : 'Unfold'" :aria-expanded="row.open"
                    @click.stop="toggleFold(row.folder.path)"><svg viewBox="0 0 8 8" width="8" height="8"><path d="M2 1l4 3-4 3z" fill="currentColor"/></svg></button>
            <input type="checkbox"
                   :checked="row.checkedCount === row.folder.keys.length"
                   :indeterminate="row.checkedCount > 0 && row.checkedCount < row.folder.keys.length"
                   title="Check or uncheck all items in the folder"
                   @click.stop
                   @change="e => emit('toggle-many', row.folder.keys, e.target.checked)">
            <span class="item-label">{{ row.folder.name }}</span>
            <span class="folder-count">{{ row.checkedCount }}/{{ row.folder.keys.length }}</span>
          </div>
          <div v-else class="item"
               :class="{checked: selected.has(row.item.key), focused: focusedKey === row.item.key}"
               :style="{paddingLeft: `${9 + row.depth * INDENT}px`}"
               @click="emit('focus', row.item.key)">
            <span v-if="tree.folders.size" class="fold-spacer"></span>
            <input type="checkbox"
                   :checked="selected.has(row.item.key)"
                   @click.stop
                   @change="e => emit('toggle', row.item.key, e.target.checked)">
            <span class="item-label" :title="row.item.label">{{ row.item.name }}</span>
            <span v-if="params[row.item.key]" class="params-dot" title="Has custom parameters"></span>
          </div>
        </template>
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

.item.folder {
  font-weight: 500;
}

.fold-toggle,
.fold-spacer {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.fold-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 -4px 0 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--ib-muted);
  cursor: pointer;
  transition: transform 0.12s;
}

.fold-toggle:hover {
  color: var(--ib-text);
}

.fold-toggle.open {
  transform: rotate(90deg);
}

.fold-spacer {
  margin-right: -4px;
}

.folder-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--ib-muted);
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
