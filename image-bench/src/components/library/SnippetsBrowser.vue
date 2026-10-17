<script setup>
/**
 * Left pane of the Library snippets: the folder tree with its filter, ordering by dragging, the context menu,
 * and the import of WebUI styles (styles.csv)
 */
import {computed, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";
import {hasPlaceholder, parseStylesCsv, useSnippetsStore} from "@/stores/snippets.js";
import {openContextMenu} from "@/contextMenu.js";
import {dialog} from "@/dialogs/useDialog.js";
import {isWebUI} from "@/host.js";

const IMPORT_FOLDER = "Imported styles";

const selected = defineModel("selected", {type: String, default: null});

const store = useSnippetsStore();
const filter = ref("");

const matches = computed(() => {
  const text = filter.value.trim().toLowerCase();

  return text
    ? node => `${node.item.name}\n${node.item.prompt}\n${node.item.negative}`.toLowerCase().includes(text)
    : null;
});

// Ordered by dragging: into folders, or before any item
const canDrop = (source, target) => !target || target.children ? "inside" : "before";

function onMove(source, target, position) {
  store.move(source.key, target?.key ?? null, position);
}

async function newSnippet(folderId = store.folderFor(selected.value)) {
  const name = await dialog.prompt("Name of the snippet:", {title: "New snippet", placeholder: "Snippet name", okText: "Create"});

  if (name)
    selected.value = store.addSnippet(folderId, {name}).id;
}

async function newFolder(folderId = store.folderFor(selected.value)) {
  const name = await dialog.prompt("Name of the folder:", {title: "New folder", placeholder: "Folder name", okText: "Create"});

  if (name)
    selected.value = store.addFolder(folderId, name).id;
}

async function rename(id) {
  const item = store.find(id);
  const name = item && await dialog.prompt("New name:", {title: `Rename ${item.name}`, defaultValue: item.name, okText: "Rename"});

  if (name)
    store.update(id, {name});
}

async function remove(id) {
  const item = store.find(id);

  if (!item)
    return;

  const message = item.children
    ? `Delete the folder "${item.name}" with its ${item.children.length ? "snippets" : "content"}?`
    : `Delete the snippet "${item.name}"?`;

  if (await dialog.confirm(message, {title: "Delete", okText: "Delete", danger: true})) {
    if (selected.value === id)
      selected.value = null;

    store.remove(id);
  }
}

function onMenu(e, node) {
  const id = node.key;
  const folderId = node.children ? id : store.folderFor(id);
  const items = [
    {icon: "plus", label: "New snippet here…", run: () => newSnippet(folderId)},
    {icon: "folder", label: "New folder here…", run: () => newFolder(folderId)},
    {separator: true},
    {icon: "pencil", label: "Rename…", hint: "F2", run: () => rename(id)}
  ];

  if (!node.children)
    items.push({icon: "copy", label: "Duplicate", run: () => selected.value = store.duplicate(id)?.id ?? selected.value});

  items.push({separator: true}, {icon: "trash", label: "Delete…", hint: "Del", danger: true, run: () => remove(id)});
  openContextMenu(e, items);
}

function onImportMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const position = {preventDefault() {}, clientX: rect.left, clientY: rect.bottom + 4};
  const items = [{icon: "upload", label: "Import styles.csv file…", run: importFile}];

  if (isWebUI)
    items.unshift({icon: "download", label: "Import the styles of WebUI", run: importWebUIStyles});

  openContextMenu(position, items);
}

async function importStyles(styles) {
  if (!styles.length) {
    await dialog.alert("No styles found.", {title: "Import styles"});
    return;
  }

  const added = store.importStyles(styles, IMPORT_FOLDER);
  await dialog.alert(`${added} of ${styles.length} styles were added to the "${IMPORT_FOLDER}" folder`
    + (added < styles.length ? "; the others were there already." : "."), {title: "Import styles"});
}

async function importWebUIStyles() {
  const response = await fetch("/image-bench/snippets/webui_styles");
  await importStyles(response.ok ? await response.json() : []);
}

function importFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];

    if (file)
      await importStyles(parseStylesCsv(await file.text()));
  });
  input.click();
}

const snippetTitle = item => [item.prompt, item.negative && `Negative: ${item.negative}`].filter(Boolean).join("\n\n");
</script>

<template>
  <div class="snippets-browser">
    <div class="toolbar-line">
      <span class="total">{{ store.count }} {{ store.count === 1 ? "snippet" : "snippets" }}</span>
      <button class="ib flat sm" title="New folder" aria-label="New folder" @click="newFolder()"><AppIcon name="folder" :size="14"/></button>
      <button class="ib flat sm" title="New snippet" aria-label="New snippet" @click="newSnippet()"><AppIcon name="plus" :size="14"/></button>
      <button class="ib flat sm" title="Import styles" aria-label="Import styles" @click="onImportMenu"><AppIcon name="download" :size="14"/></button>
    </div>
    <label class="search">
      <AppIcon name="fileSearch" :size="14"/>
      <input v-model="filter" type="text" placeholder="Filter by name or text" aria-label="Filter snippets"
             spellcheck="false" @keydown.esc.stop="filter = ''">
    </label>
    <div class="list">
      <TreeView :nodes="store.nodes" :selected-key="selected" storage-key="imageBench_snippetsUnfolded"
                :filter="matches" :can-drop="matches ? null : canDrop"
                :empty-text="matches ? 'No snippets match' : 'No snippets yet'"
                @select="node => selected = node.key" @menu="onMenu" @move="onMove"
                @rename="node => rename(node.key)" @delete="node => remove(node.key)">
        <template #row="{node}">
          <AppIcon :name="node.children ? 'folder' : 'snippet'" :size="14" class="row-icon"/>
          <span class="name" :title="node.children ? null : snippetTitle(node.item)">{{ node.name }}</span>
          <span v-if="node.children" class="row-count">{{ node.children.length || "" }}</span>
          <span v-else-if="node.item.negative" class="negative" title="Has a negative part">−</span>
          <span v-if="!node.children && hasPlaceholder(node.item.prompt)" class="wrap" title="Wraps the selection">{}</span>
        </template>
      </TreeView>
    </div>
  </div>
</template>

<style scoped>
.snippets-browser {
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

.row-count {
  color: var(--ib-muted);
  font-size: 11px;
}

.negative,
.wrap {
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.negative {
  border: 1px solid rgba(255, 122, 125, 0.4);
  color: var(--ib-danger-text);
}

.wrap {
  border: 1px solid var(--ib-border-2);
  color: var(--ib-muted);
  font-family: var(--ib-mono);
}
</style>
