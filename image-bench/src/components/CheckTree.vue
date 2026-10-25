<script setup>
/**
 * Checkable folder tree of items whose labels are paths ("a/b/name" or "a\b\name"),
 * scrolling within the space given by the parent. Folders fold and check or uncheck all their items.
 */
import {computed, ref, watch} from "vue";
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
  focusedKey: {
    type: String,
    default: null
  },
  // Items with params get a dot
  params: {
    type: Object,
    default: () => ({})
  },
  // localStorage key of the folded folder paths
  storageKey: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['toggle', 'toggle-many', 'focus']);

const storage = useLocalStorage();

const collapsed = ref(new Set());

watch(() => props.storageKey, key => collapsed.value = new Set(storage.getJsonItem(key, [])), {immediate: true});

function toggleFold(path) {
  const newCollapsed = new Set(collapsed.value);

  if (!newCollapsed.delete(path))
    newCollapsed.add(path);

  collapsed.value = newCollapsed;
  storage.setJsonItem(props.storageKey, [...newCollapsed]);
}

// Folder tree built from the item label paths; folders precede items on each level
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
</script>

<template>
  <div class="check-tree">
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
          <span v-if="$slots['item-actions']" class="item-actions"><slot name="item-actions" :item="row.item"/></span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.check-tree {
  position: relative;
  flex-grow: 1;
  min-height: 0;
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
  background: color-mix(in srgb, var(--ib-accent) 9%, transparent);
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

/* Shown on hover, and while busy, so that a spinner stays visible */
.item-actions {
  display: none;
  align-items: center;
  flex-shrink: 0;
  margin-right: -4px;
}

.item:hover .item-actions,
.item-actions:has(.busy) {
  display: flex;
}

.params-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--ib-info);
  flex-shrink: 0;
}
</style>
