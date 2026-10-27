<script setup>
/**
 * Folder tree of the Library (projects and snippets) and the Snippets panel of the Generate tab.
 * Nodes are {key, name, children?}: a node with children (an array, possibly empty) is a folder.
 * The unfolded folders are kept in localStorage. Rows are rendered by the row slot after the fold toggle.
 * Rows may be dragged onto folders (inside) or other rows (before), as canDrop() allows; the move is emitted.
 * With keepFocus, clicks do not take the focus (the Snippets panel inserts at the caret of a prompt).
 */
import {computed, nextTick, ref, watch} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const INDENT = 16;
const DRAG_TYPE = "application/x-image-bench-tree";

const props = defineProps({
  nodes: {
    type: Array,
    required: true
  },
  selectedKey: {
    type: String,
    default: null
  },
  // localStorage key of the folded or unfolded folder keys
  storageKey: {
    type: String,
    required: true
  },
  // Folders are open unless folded; else closed unless unfolded
  defaultOpen: {
    type: Boolean,
    default: false
  },
  // Shows only the leaves matching it (and their folders, open)
  filter: {
    type: Function,
    default: null
  },
  // (sourceNode, targetNode) => 'inside' | 'before' | null; no function: no dragging
  canDrop: {
    type: Function,
    default: null
  },
  keepFocus: {
    type: Boolean,
    default: false
  },
  // A click on a folder folds or unfolds it; else only on its toggle or when it is selected
  clickToggles: {
    type: Boolean,
    default: false
  },
  emptyText: {
    type: String,
    default: "Empty"
  }
});

const emit = defineEmits(["select", "activate", "middle", "menu", "move", "rename", "delete"]);

const storage = useLocalStorage();
const toggled = ref(new Set());

watch(() => props.storageKey, key => toggled.value = new Set(storage.getJsonItem(key, [])), {immediate: true});

const isFolder = node => Array.isArray(node.children);
const isOpen = node => props.defaultOpen !== toggled.value.has(node.key);

function setOpen(node, open) {
  if (!isFolder(node) || isOpen(node) === open)
    return;

  const keys = new Set(toggled.value);

  if (!keys.delete(node.key))
    keys.add(node.key);

  toggled.value = keys;
  storage.setJsonItem(props.storageKey, [...keys]);
}

const toggle = node => setOpen(node, !isOpen(node));

const treeElement = ref(null);

/**
 * Unfold the folders above a node, so that it is shown
 * @param {string} key
 * @param {{scroll?: boolean}} options - scroll: also scroll its row into view
 */
async function reveal(key, {scroll = false} = {}) {
  const path = findPath(props.nodes, key);
  path?.slice(0, -1).forEach(node => setOpen(node, true));

  if (!path || !scroll)
    return;

  await nextTick();
  const index = rows.value.findIndex(row => row.node.key === key);
  treeElement.value?.querySelectorAll(":scope > .row")[index]?.scrollIntoView({block: "nearest"});
}

function findPath(nodes, key) {
  for (const node of nodes) {
    if (node.key === key)
      return [node];

    const path = isFolder(node) ? findPath(node.children, key) : null;

    if (path)
      return [node, ...path];
  }

  return null;
}

// Visible rows; with a filter, the matching leaves and their folders, which are shown open
const rows = computed(() => {
  const result = [];

  function walk(nodes, depth) {
    let matched = false;

    for (const node of nodes) {
      if (isFolder(node)) {
        if (props.filter) {
          const start = result.length;
          result.push({node, depth, open: true});

          if (!walk(node.children, depth + 1))
            result.length = start;
          else
            matched = true;
        }
        else {
          const open = isOpen(node);
          result.push({node, depth, open});

          if (open)
            walk(node.children, depth + 1);
        }
      }
      else if (!props.filter || props.filter(node)) {
        result.push({node, depth});
        matched = true;
      }
    }

    return matched;
  }

  walk(props.nodes, 0);
  return result;
});

const anyFolder = computed(() => props.nodes.some(isFolder));

function onClick(row, e) {
  if (isFolder(row.node) && (props.clickToggles || props.selectedKey === row.node.key || e.target.closest(".fold-toggle")))
    toggle(row.node);

  emit("select", row.node, e);
}

// The middle button does not scroll (Firefox autoscroll); with keepFocus no button takes the focus
function onMouseDown(e) {
  if (props.keepFocus || e.button === 1)
    e.preventDefault();
}

function onAuxClick(row, e) {
  if (e.button === 1)
    emit("middle", row.node, e);
}

function onKeydown(row, e) {
  if (e.key === "Enter")
    emit("activate", row.node, e);
  else if (e.key === "F2")
    emit("rename", row.node);
  else if (e.key === "Delete")
    emit("delete", row.node);
  else if (e.key === "ArrowRight" && isFolder(row.node))
    setOpen(row.node, true);
  else if (e.key === "ArrowLeft" && isFolder(row.node))
    setOpen(row.node, false);
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const index = rows.value.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1);
    const next = rows.value[index];

    if (next) {
      emit("select", next.node, e);
      e.currentTarget.parentElement.children[index]?.focus();
    }
  }
  else
    return;

  e.preventDefault();
}

// ---------- Dragging ----------

const dragged = ref(null);
const dropTarget = ref(null);

function onDragStart(row, e) {
  if (!props.canDrop) {
    e.preventDefault();
    return;
  }

  dragged.value = row.node;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(DRAG_TYPE, row.node.key);
}

function dropPosition(target) {
  if (!dragged.value || target === dragged.value)
    return null;

  // Not into itself
  if (target && findPath([dragged.value], target.key))
    return null;

  return props.canDrop(dragged.value, target);
}

function onDragOver(row, e) {
  const position = dropPosition(row?.node ?? null);

  if (!position)
    return;

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = "move";
  dropTarget.value = {key: row?.node.key ?? null, position};
}

function onDrop(row, e) {
  const target = row?.node ?? null;
  const position = dropPosition(target);

  if (position) {
    e.preventDefault();
    e.stopPropagation();
    emit("move", dragged.value, target, position);
  }

  onDragEnd();
}

function onDragEnd() {
  dragged.value = null;
  dropTarget.value = null;
}

const dropClass = row => dropTarget.value?.key === row.node.key ? `drop-${dropTarget.value.position}` : null;

defineExpose({reveal, setOpen});
</script>

<template>
  <div ref="treeElement" class="tree" role="tree" :class="{'drop-root': dropTarget && dropTarget.key === null}"
       @dragover="e => onDragOver(null, e)" @drop="e => onDrop(null, e)" @dragleave.self="dropTarget = null">
    <div v-for="row in rows" :key="row.node.key" class="row" role="treeitem" tabindex="-1"
         :class="[{folder: !!row.node.children, selected: selectedKey === row.node.key}, dropClass(row)]"
         :aria-selected="selectedKey === row.node.key" :aria-expanded="row.node.children ? row.open : undefined"
         :style="{paddingLeft: `${6 + row.depth * INDENT}px`}" :draggable="!!canDrop"
         @mousedown="onMouseDown"
         @click="e => onClick(row, e)" @auxclick="e => onAuxClick(row, e)"
         @dblclick="e => emit('activate', row.node, e)"
         @contextmenu.prevent="e => emit('menu', e, row.node)"
         @keydown="e => onKeydown(row, e)"
         @dragstart="e => onDragStart(row, e)" @dragend="onDragEnd"
         @dragover="e => onDragOver(row, e)" @drop="e => onDrop(row, e)">
      <!-- An empty folder has nothing to unfold -->
      <span v-if="row.node.children?.length" class="fold-toggle" :class="{open: row.open}"><svg viewBox="0 0 8 8" width="8" height="8"><path d="M2 1l4 3-4 3z" fill="currentColor"/></svg></span>
      <span v-else-if="row.node.children || anyFolder || row.depth" class="fold-spacer"></span>
      <slot name="row" :node="row.node" :open="row.open"><span class="label">{{ row.node.name }}</span></slot>
    </div>
    <div v-if="!rows.length" class="empty">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
.tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 100%;
  padding-bottom: 12px;
}

.tree.drop-root {
  box-shadow: inset 0 0 0 1px var(--ib-accent-border);
  border-radius: 4px;
}

.row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding-right: 6px;
  border-radius: 4px;
  color: var(--ib-text-2);
  white-space: nowrap;
  cursor: pointer;
  outline: none;
}

.row:hover {
  background: var(--ib-hover);
  color: var(--ib-text);
}

.row:focus-visible {
  box-shadow: inset 0 0 0 1px var(--ib-accent-border);
}

.row.selected {
  background: var(--ib-accent-soft);
  color: var(--ib-text);
}

.row.drop-inside {
  background: var(--ib-accent-soft);
  box-shadow: inset 0 0 0 1px var(--ib-accent);
}

.row.drop-before {
  box-shadow: inset 0 2px 0 var(--ib-accent);
}

.fold-toggle,
.fold-spacer {
  width: 12px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ib-muted);
}

.fold-toggle {
  transition: transform 0.12s;
}

.fold-toggle.open {
  transform: rotate(90deg);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  padding: 16px 8px;
  color: var(--ib-muted);
  font-size: 12px;
  text-align: center;
}
</style>
