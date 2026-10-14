<script setup>
/**
 * Left pane of the Library projects: the folders and projects under the project root, the search by name and prompt
 * words, #tag and host:, the tags of the shown projects with their counts, and the file operations
 * (context menu, dragging onto folders, F2, Delete). Double-click or Enter opens a project.
 */
import {computed, nextTick, ref, watch} from "vue";
import {useRouter} from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";
import {baseName, useProjectsStore} from "@/stores/projects.js";
import {openContextMenu} from "@/contextMenu.js";
import {HOST_LABELS} from "@/projectParams.js";
import {dialog} from "@/dialogs/useDialog.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const TAG_LIMIT = 10;
const MOVE_HISTORY_KEY = "projectMoveTarget";

const query = defineModel("query", {type: String, default: ""});

const store = useProjectsStore();
const router = useRouter();
const storage = useLocalStorage();
const treeView = ref(null);
// Folder or project last clicked; new folders and projects are created in it (or next to the project)
const selectedKey = ref(store.selectedPath);
const showAllTags = ref(false);

// "Show in Explorer" opens the file manager of the server computer
const isLocal = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);

const toNodes = entries => entries.map(entry => entry.type === "folder"
  ? {key: entry.path, name: entry.name, children: toNodes(entry.children), entry}
  : {key: entry.path, name: entry.name, entry});

const nodes = computed(() => toNodes(store.tree?.nodes ?? []));

function collectProjects(entries, result = []) {
  for (const entry of entries)
    if (entry.type === "project")
      result.push(entry);
    else
      collectProjects(entry.children, result);

  return result;
}

const allProjects = computed(() => collectProjects(store.tree?.nodes ?? []));

const projectCount = entry => collectProjects(entry.children).length;

// ---------- Search ----------

const parsed = computed(() => {
  const words = [];
  const tags = [];
  const hosts = [];

  for (const token of query.value.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("#") && token.length > 1)
      tags.push(token.slice(1).toLowerCase());
    else if (/^host:./i.test(token))
      hosts.push(token.slice(5).toLowerCase());
    else
      words.push(token.toLowerCase());
  }

  return {words, tags, hosts, active: words.length + tags.length + hosts.length > 0};
});

function matches(entry) {
  const {words, tags, hosts} = parsed.value;
  const project = entry.project ?? {};
  const text = `${entry.name}\n${project.prompt ?? ""}`.toLowerCase();
  const projectTags = (project.tags ?? []).map(tag => tag.toLowerCase());
  const host = String(project.host ?? "");

  return words.every(word => text.includes(word))
    && tags.every(tag => projectTags.includes(tag))
    && hosts.every(name => host.startsWith(name) || HOST_LABELS[host]?.toLowerCase().startsWith(name));
}

const results = computed(() => parsed.value.active ? allProjects.value.filter(matches) : []);

// Tags of the shown projects (all, or the search results) by their counts
const tagCounts = computed(() => {
  const counts = new Map();

  for (const entry of parsed.value.active ? results.value : allProjects.value)
    for (const tag of entry.project?.tags ?? []) {
      const key = tag.toLowerCase();
      counts.set(key, {tag, count: (counts.get(key)?.count ?? 0) + 1});
    }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
});

const shownTags = computed(() => showAllTags.value ? tagCounts.value : tagCounts.value.slice(0, TAG_LIMIT));
const isTagActive = tag => parsed.value.tags.includes(tag.toLowerCase());

function toggleTag(tag) {
  const tokens = query.value.trim().split(/\s+/).filter(Boolean);
  const token = "#" + tag.toLowerCase();
  const index = tokens.findIndex(item => item.toLowerCase() === token);

  if (index === -1)
    tokens.push("#" + tag);
  else
    tokens.splice(index, 1);

  query.value = tokens.join(" ") + (tokens.length ? " " : "");
}

/**
 * Parts of a text with the search words marked, around the first match for long texts
 * @returns {{text: string, hit: boolean}[]}
 */
function highlight(text, excerpt = false) {
  const words = parsed.value.words;
  text = String(text ?? "");

  if (excerpt) {
    const lower = text.toLowerCase();
    const first = Math.min(...words.map(word => lower.indexOf(word)).filter(index => index !== -1));

    if (!Number.isFinite(first))
      return [];

    const start = Math.max(0, first - 30);
    text = (start ? "…" : "") + text.slice(start, start + 110);
  }

  if (!words.length)
    return [{text, hit: false}];

  const pattern = new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).filter(Boolean).map(part => ({text: part, hit: words.includes(part.toLowerCase())}));
}

const parentPath = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

// The selected project is shown in the tree when the search is cleared
watch(() => parsed.value.active, async active => {
  if (!active && store.selectedPath) {
    await nextTick();
    treeView.value?.reveal(store.selectedPath);
  }
});

// ---------- Selection ----------

function onSelect(node) {
  selectedKey.value = node.key;

  if (!node.children)
    store.select(node.key);
}

function selectResult(entry) {
  selectedKey.value = entry.path;
  store.select(entry.path);
}

// Folder in which new folders and projects are created
const targetFolder = computed(() => {
  const node = selectedKey.value && store.findNode(store.tree?.nodes ?? [], selectedKey.value);

  if (!node)
    return "";

  return node.type === "folder" ? node.path : parentPath(node.path);
});

watch(() => store.selectedPath, path => {
  if (path) {
    selectedKey.value = path;
    treeView.value?.reveal(path);
  }
});

// ---------- File operations ----------

const canDrop = (source, target) => !target ? "inside" : target.children ? "inside" : null;

function onMove(source, target) {
  const to = target?.key ?? "";

  if (parentPath(source.key) !== to)
    store.move(source.key, to);
}

function folderPaths(entries, result = [""]) {
  for (const entry of entries)
    if (entry.type === "folder") {
      result.push(entry.path);
      folderPaths(entry.children, result);
    }

  return result;
}

async function moveTo(entry) {
  // The folders are offered as the history of the input
  const folders = folderPaths(store.tree?.nodes ?? [])
    .filter(path => path !== entry.path && !path.startsWith(entry.path + "/"))
    .map(path => "/" + path);

  storage.setJsonItem(`imageBench_promptHistory_${MOVE_HISTORY_KEY}`, folders);

  const target = await dialog.prompt(`Move "${entry.name}" to the folder:`, {
    title: "Move", defaultValue: "/" + parentPath(entry.path), storageKey: MOVE_HISTORY_KEY,
    dropdown: true, historySize: folders.length, okText: "Move"
  });

  if (target !== null)
    onMove({key: entry.path}, {key: target.replace(/^[\\/]+|[\\/]+$/g, "").replaceAll("\\", "/")});
}

function serverPath(path) {
  const root = store.tree?.root ?? "";
  const separator = root.includes("\\") ? "\\" : "/";
  return path ? root.replace(/[\\/]+$/, "") + separator + path.split("/").join(separator) : root;
}

async function copyPath(path) {
  try {
    await navigator.clipboard.writeText(serverPath(path));
  } catch {
    await dialog.prompt("Path on the server:", {title: "Copy path", defaultValue: serverPath(path)});
  }
}

function onMenu(e, node) {
  const entry = node.entry;
  const items = [];

  if (entry.type === "project") {
    items.push({icon: "upload", label: "Open", hint: "Enter", run: () => store.open(entry.path)});
    items.push({separator: true});
  }
  else {
    items.push({icon: "box", label: "New project here…", run: () => store.createProject(entry.path)});
    items.push({icon: "folder", label: "New folder here…", run: () => store.createFolder(entry.path)});
    items.push({separator: true});
  }

  items.push({icon: "pencil", label: "Rename…", hint: "F2", run: () => store.rename(entry.path)});
  items.push({icon: "swap", label: "Move to…", run: () => moveTo(entry)});
  items.push({separator: true});
  items.push({icon: "copy", label: "Copy path", run: () => copyPath(entry.path)});

  if (isLocal)
    items.push({icon: "external", label: "Show in Explorer", run: () => store.reveal(entry.path)});

  items.push({separator: true});
  items.push({icon: "trash", label: "Delete…", hint: "Del", danger: true, run: () => store.remove(entry)});

  openContextMenu(e, items);
}

function onActivate(node) {
  if (!node.children)
    store.open(node.key);
}

// The name the project was saved under differs from its folder (renamed or copied outside Image Bench)
const nameMismatch = entry => !!entry.project?.name && entry.project.name !== entry.name;
const mismatchTitle = entry => `Saved as "${entry.project.name}": the folder was renamed or copied outside Image Bench`;

const savedTitle = entry => [
  entry.path,
  entry.project?.host && `Saved in ${HOST_LABELS[entry.project.host] ?? entry.project.host}`,
  entry.project?.tags?.length && entry.project.tags.map(tag => "#" + tag).join(" ")
].filter(Boolean).join("\n");

defineExpose({reveal: path => treeView.value?.reveal(path)});
</script>

<template>
  <div class="projects-browser">
    <div v-if="store.tree && !store.tree.root" class="no-root">
      <AppIcon name="box" :size="22"/>
      <p>Set the folder of your projects to start.</p>
      <button class="btn primary" @click="router.push('/settings')">Open Settings</button>
    </div>
    <template v-else>
      <div class="root-line">
        <span class="root-path" :title="`Project root (as the server sees it): ${store.tree?.root ?? ''}`"
          ><bdi dir="ltr">{{ store.tree?.root }}</bdi></span>
        <button class="ib flat sm" title="New folder" aria-label="New folder"
                @click="store.createFolder(targetFolder)"><AppIcon name="folder" :size="14"/></button>
        <button class="ib flat sm" title="New project: saves the workspace into it" aria-label="New project"
                @click="store.createProject(targetFolder)"><AppIcon name="box" :size="14"/></button>
        <button class="ib flat sm" :class="{busy: store.treeLoading}" title="Refresh" aria-label="Refresh"
                @click="store.loadTree()"><span v-if="store.treeLoading" class="spinner"></span><AppIcon v-else name="refresh" :size="13"/></button>
      </div>

      <label class="search" :class="{active: parsed.active}">
        <AppIcon name="fileSearch" :size="14"/>
        <input v-model="query" type="text" placeholder="Name, prompt, #tag, host:comfy" aria-label="Search projects"
               spellcheck="false" @keydown.esc.stop="query = ''">
        <button v-if="query" class="clear" title="Clear the search" aria-label="Clear the search" @click="query = ''"
          ><AppIcon name="close" :size="12"/></button>
      </label>

      <div v-if="tagCounts.length" class="tags">
        <button v-for="{tag, count} in shownTags" :key="tag" class="tag" :class="{on: isTagActive(tag)}"
                :title="isTagActive(tag) ? `Remove #${tag} from the search` : `Show the projects tagged #${tag}`"
                @click="toggleTag(tag)">#{{ tag }} <span>{{ count }}</span></button>
        <button v-if="tagCounts.length > TAG_LIMIT" class="tag more" @click="showAllTags = !showAllTags"
          >{{ showAllTags ? "Less" : `+${tagCounts.length - TAG_LIMIT}` }}</button>
      </div>

      <div v-if="store.tree && !store.tree.exists" class="message error">
        The project root does not exist or is not reachable. Check it in Settings.
      </div>
      <div v-else-if="store.treeError" class="message error">{{ store.treeError }}</div>

      <div class="list">
        <template v-if="parsed.active">
          <div class="results-count">{{ results.length }} {{ results.length === 1 ? "project" : "projects" }}</div>
          <button v-for="entry in results" :key="entry.path" class="result"
                  :class="{selected: store.selectedPath === entry.path}"
                  @click="selectResult(entry)" @dblclick="store.open(entry.path)"
                  @contextmenu.prevent="e => onMenu(e, {entry})">
            <span class="result-name">
              <AppIcon name="box" :size="13" :class="{current: entry.path === store.current.path}"/>
              <span class="name"><template v-for="(part, index) in highlight(entry.name)" :key="index"
                ><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
              <span v-if="entry.path === store.current.path && store.unsaved" class="unsaved-dot" title="Unsaved changes"></span>
              <AppIcon v-if="nameMismatch(entry)" name="alert" :size="12" class="name-warning" :title="mismatchTitle(entry)"/>
              <span class="host" :class="entry.project?.host">{{ entry.project?.host === "comfy" ? "C" : "W" }}</span>
            </span>
            <span class="result-path">{{ parentPath(entry.path) || "/" }}</span>
            <span v-if="parsed.words.length && highlight(entry.project?.prompt, true).length" class="result-prompt"
              ><template v-for="(part, index) in highlight(entry.project?.prompt, true)" :key="index"
                ><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
          </button>
          <div v-if="!results.length" class="message">No projects match.</div>
        </template>

        <TreeView v-else ref="treeView" :nodes="nodes" :selected-key="selectedKey"
                  storage-key="imageBench_libraryProjectsOpen" :can-drop="canDrop"
                  :empty-text="store.tree ? 'No folders yet. Create a project with the box button.' : 'Loading…'"
                  @select="onSelect" @activate="onActivate" @menu="onMenu" @move="onMove"
                  @rename="node => store.rename(node.key)" @delete="node => store.remove(node.entry)">
          <template #row="{node}">
            <template v-if="node.children">
              <AppIcon name="folder" :size="14" class="row-icon"/>
              <span class="name" :class="{empty: !projectCount(node.entry)}">{{ node.name }}</span>
              <span v-if="projectCount(node.entry)" class="row-count">{{ projectCount(node.entry) }}</span>
            </template>
            <template v-else>
              <AppIcon name="box" :size="14" class="row-icon" :class="{current: node.key === store.current.path}"/>
              <span class="name" :class="{current: node.key === store.current.path}"
                    :title="savedTitle(node.entry)">{{ node.name }}</span>
              <span v-if="node.key === store.current.path && store.unsaved" class="unsaved-dot" title="Unsaved changes"></span>
              <AppIcon v-if="nameMismatch(node.entry)" name="alert" :size="12" class="name-warning"
                       :title="mismatchTitle(node.entry)"/>
              <span class="host" :class="node.entry.project?.host"
                    :title="`Saved in ${HOST_LABELS[node.entry.project?.host] ?? 'WebUI'}`"
                >{{ node.entry.project?.host === "comfy" ? "C" : "W" }}</span>
            </template>
          </template>
        </TreeView>
      </div>
    </template>
  </div>
</template>

<style scoped>
.projects-browser {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.no-root {
  margin: 40px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--ib-text-2);
  text-align: center;
}

.no-root p {
  margin: 0;
}

.root-line {
  display: flex;
  align-items: center;
  gap: 2px;
}

.root-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Cut at the start; the path itself is isolated as left-to-right, else the leading backslashes of a UNC path
     and other punctuation are moved to the other end */
  direction: rtl;
  text-align: left;
  font-family: var(--ib-mono);
  font-size: 11px;
  color: var(--ib-muted);
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
  color: var(--ib-muted);
}

.search.active,
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

.clear {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--ib-muted);
  cursor: pointer;
}

.clear:hover {
  background: var(--ib-hover);
  color: var(--ib-text);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  height: 20px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--ib-elev-2);
  color: var(--ib-text-2);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.tag span {
  color: var(--ib-muted);
}

.tag:hover {
  color: var(--ib-text);
}

.tag.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.tag.on span {
  color: inherit;
  opacity: 0.75;
}

.tag.more {
  color: var(--ib-muted);
}

.message {
  padding: 8px;
  color: var(--ib-muted);
  font-size: 12px;
}

.message.error {
  color: var(--ib-danger-text);
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 0 -4px;
  padding: 0 4px;
}

.row-icon {
  color: var(--ib-muted);
}

.row-icon.current,
.result-name .current {
  color: var(--ib-accent);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.name.empty {
  color: var(--ib-muted);
  font-style: italic;
}

.name.current {
  font-weight: 600;
}

.row-count {
  color: var(--ib-muted);
  font-size: 11px;
}

.name-warning {
  flex-shrink: 0;
  color: var(--ib-warn);
}

.unsaved-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--ib-warn);
}

.host {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid rgba(90, 169, 255, 0.45);
  border-radius: 3px;
  color: var(--ib-info);
  font-size: 9.5px;
  font-weight: 700;
  line-height: 14px;
}

.host.comfy {
  border-color: rgba(196, 166, 255, 0.45);
  color: #c4a6ff;
}

.results-count {
  padding: 2px 4px 6px;
  color: var(--ib-muted);
  font-size: 11px;
}

.result {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 2px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.result:hover {
  background: var(--ib-hover);
}

.result.selected {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-text);
}

.result-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--ib-text);
}

.result-path {
  padding-left: 19px;
  color: var(--ib-muted);
  font-size: 11px;
}

.result-prompt {
  padding-left: 19px;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

mark {
  border-radius: 2px;
  background: var(--ib-warn);
  color: #1a0b00;
}
</style>
