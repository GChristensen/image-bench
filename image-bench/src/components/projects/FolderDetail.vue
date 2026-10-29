<script setup>
/**
 * Folder shown in the Projects tab while a folder (or nothing, the root) is selected in the tree: its subfolders
 * and its projects with their final images, its own first, then those of all its subfolders (marked with their
 * folder). A click selects, a double-click opens a project
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {AUDIO_PLACEHOLDER, KIND_AUDIO, mediaKindOfName} from "@/media.js";
import {HOST_LABELS} from "@/projectParams.js";
import {formatSavedAt, projectFileUrl, useProjectsStore} from "@/stores/projects.js";

const props = defineProps({
  // Path relative to the project root, "" for the root
  path: {
    type: String,
    required: true
  }
});

const store = useProjectsStore();

const entries = computed(() => {
  const nodes = store.tree?.nodes ?? [];
  return props.path ? store.findNode(nodes, props.path)?.children ?? [] : nodes;
});

const folders = computed(() => entries.value.filter(entry => entry.type === "folder"));
const projects = computed(() => entries.value.filter(entry => entry.type === "project"));

function countProjects(list) {
  return list.reduce((count, entry) => count + (entry.type === "project" ? 1 : countProjects(entry.children)), 0);
}

const total = computed(() => countProjects(entries.value));

function collectProjects(list) {
  return list.flatMap(entry => entry.type === "project" ? [entry] : collectProjects(entry.children ?? []));
}

// The projects of the folder, then those of all its subfolders
const shownProjects = computed(() => [...projects.value, ...collectProjects(folders.value)]);

// Folder of a project of a subfolder, relative to the folder shown
function subfolder(entry) {
  const parts = entry.path.split("/").slice(props.path ? props.path.split("/").length : 0, -1);
  return parts.join(" › ");
}

// Root › a › b, each part selecting its folder
const crumbs = computed(() => {
  const parts = props.path ? props.path.split("/") : [];
  return [{name: "Root", path: ""}, ...parts.map((name, index) => ({name, path: parts.slice(0, index + 1).join("/")}))];
});

function preview(entry) {
  const final = entry.project?.final;

  if (!final)
    return null;

  return mediaKindOfName(final) === KIND_AUDIO
    ? AUDIO_PLACEHOLDER
    : projectFileUrl(entry.path, final, {thumb: true, version: entry.project.savedAt ?? 0});
}

const isCurrent = entry => entry.path === store.current.path;
</script>

<template>
  <div class="folder-detail">
    <header class="header">
      <div class="title">
        <nav class="crumbs" aria-label="Folder path">
          <template v-for="(crumb, index) in crumbs" :key="crumb.path">
            <span v-if="index" class="crumb-sep">›</span>
            <button v-if="index < crumbs.length - 1" class="crumb" @click="store.selectFolder(crumb.path)"
              >{{ crumb.name }}</button>
            <h2 v-else>{{ crumb.name }}</h2>
          </template>
        </nav>
        <div class="count">{{ total }} {{ total === 1 ? "project" : "projects" }}<template
          v-if="total !== projects.length"> · {{ projects.length }} in this folder</template></div>
      </div>
      <div class="buttons">
        <button class="btn outline" :disabled="!!store.busy" @click="store.createFolder(path)"
          ><AppIcon name="folder" :size="14"/>New folder</button>
        <button class="btn primary" :disabled="!!store.busy" title="New project here: saves the workspace into it"
                @click="store.createProject(path)"><AppIcon name="box" :size="14"/>New project</button>
      </div>
    </header>

    <div v-if="folders.length" class="folders">
      <button v-for="folder in folders" :key="folder.path" class="folder" :title="folder.path"
              @click="store.selectFolder(folder.path)">
        <AppIcon name="folder" :size="16"/>
        <span class="folder-name">{{ folder.name }}</span>
        <span class="folder-count">{{ countProjects(folder.children) }}</span>
      </button>
    </div>

    <div v-if="shownProjects.length" class="project-grid">
      <button v-for="entry in shownProjects" :key="entry.path" class="project" :class="{current: isCurrent(entry)}"
              title="Click to show the project, double-click to open it"
              @click="store.select(entry.path)" @dblclick="store.open(entry.path)">
        <span class="thumb">
          <img v-if="preview(entry)" :src="preview(entry)" alt="" loading="lazy" draggable="false">
          <AppIcon v-else name="box" :size="28"/>
        </span>
        <span class="name-line">
          <span class="name">{{ entry.name }}</span>
          <span v-if="isCurrent(entry) && store.unsaved" class="unsaved-dot" title="Unsaved changes"></span>
          <span class="host" :class="entry.project?.host"
                :title="`Saved in ${HOST_LABELS[entry.project?.host] ?? 'WebUI'}`"
            >{{ entry.project?.host === "comfy" ? "C" : "W" }}</span>
        </span>
        <span v-if="subfolder(entry)" class="subfolder" :title="entry.path"
          ><AppIcon name="folder" :size="11"/>{{ subfolder(entry) }}</span>
        <span class="saved">{{ formatSavedAt(entry.project?.savedAt) ?? "Not saved yet" }}</span>
        <span v-if="entry.project?.tags?.length" class="tags"
          >{{ entry.project.tags.map(tag => "#" + tag).join(" ") }}</span>
      </button>
    </div>

    <p v-if="!folders.length && !projects.length" class="empty">No projects or folders here yet.</p>
  </div>
</template>

<style scoped>
.folder-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 18px 18px;
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.title {
  flex: 1;
  min-width: 0;
}

.crumbs {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.crumb {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ib-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.crumb:hover {
  color: var(--ib-text);
  text-decoration: underline;
}

.crumb-sep {
  color: var(--ib-muted);
}

h2 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 19px;
  font-weight: 600;
}

.count {
  margin-top: 2px;
  color: var(--ib-muted);
  font-size: 11.5px;
}

.buttons {
  display: flex;
  gap: 6px;
}

.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
}

.folder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  color: var(--ib-text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.folder:hover {
  border-color: var(--ib-border-2);
  background: var(--ib-hover);
  color: var(--ib-text);
}

.folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  color: var(--ib-muted);
  font-size: 11px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.project {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.project:hover {
  background: var(--ib-hover);
}

.project.current {
  border-color: var(--ib-accent-border);
}

.thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  margin-bottom: 3px;
  border-radius: 5px;
  background: var(--ib-surface);
  color: var(--ib-border-2);
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-text);
  font-weight: 600;
}

.project.current .name {
  color: var(--ib-accent);
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

.subfolder {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  color: var(--ib-text-2);
  font-size: 11px;
}

.saved,
.tags {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-muted);
  font-size: 11px;
}

.tags {
  color: var(--ib-text-2);
}

.empty {
  margin: 24px 0;
  color: var(--ib-muted);
  text-align: center;
}
</style>
