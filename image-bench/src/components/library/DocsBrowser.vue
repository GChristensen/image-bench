<script setup>
/**
 * Left pane of the Library docs: the tree of the Markdown files and tag lists (CSV) under the docs root (read-only),
 * with a name filter
 */
import {computed, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";
import {useDocsStore} from "@/stores/docs.js";

const store = useDocsStore();
const filter = ref("");

function toNodes(entries) {
  return entries.map(entry => entry.type === "folder"
    ? {key: entry.path, name: entry.name, children: toNodes(entry.children)}
    : {key: entry.path, name: entry.name.replace(/\.(md|markdown)$/i, ""), item: entry});
}

const nodes = computed(() => toNodes(store.tree?.nodes ?? []));

const count = computed(() => (function walk(entries) {
  return entries.reduce((sum, entry) => sum + (entry.type === "folder" ? walk(entry.children) : 1), 0);
})(store.tree?.nodes ?? []));

const matches = computed(() => {
  const text = filter.value.trim().toLowerCase();
  return text ? node => node.key.toLowerCase().includes(text) : null;
});

function onSelect(node) {
  if (!node.children)
    store.open(node.key);
}
</script>

<template>
  <div class="docs-browser">
    <div class="toolbar-line">
      <span class="total" :title="store.tree?.root">{{ count }} {{ count === 1 ? "document" : "documents" }}</span>
      <button class="ib flat sm" title="Read the folder again" aria-label="Refresh" @click="store.loadTree()"
        ><AppIcon name="refresh" :size="14"/></button>
    </div>
    <label class="search">
      <AppIcon name="fileSearch" :size="14"/>
      <input v-model="filter" type="text" placeholder="Filter by name" aria-label="Filter documents"
             spellcheck="false" @keydown.esc.stop="filter = ''">
    </label>
    <div v-if="store.treeError" class="notice">{{ store.treeError }}</div>
    <div v-else-if="store.tree && !store.tree.exists" class="notice">
      The docs folder <code>{{ store.tree.root }}</code> does not exist. Set it in Settings › Library.
    </div>
    <div v-else class="list">
      <TreeView :nodes="nodes" :selected-key="store.selectedPath" storage-key="imageBench_libraryDocsFolded"
                default-open click-toggles :filter="matches"
                :empty-text="matches ? 'No documents match' : 'No documents in the docs folder'"
                @select="onSelect">
        <template #row="{node}">
          <AppIcon :name="node.children ? 'folder' : node.item.kind === 'tags' ? 'tag' : 'book'" :size="14"
                   class="row-icon"/>
          <span class="name" :title="node.key">{{ node.name }}</span>
        </template>
      </TreeView>
    </div>
  </div>
</template>

<style scoped>
.docs-browser {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.toolbar-line {
  display: flex;
  align-items: center;
  gap: 2px;
}

.total {
  flex: 1;
  color: var(--ib-muted);
  font-size: 11.5px;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
  color: var(--ib-muted);
}

.search:focus-within {
  border-color: var(--ib-accent-border);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 12.5px;
}

.notice {
  color: var(--ib-muted);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px;
}

.row-icon {
  color: var(--ib-muted);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
