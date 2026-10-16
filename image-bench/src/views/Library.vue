<script setup>
/**
 * Library tab: docs, snippets and projects, each as a tree at the left and the selected item at the right.
 * Docs are the Markdown files under the docs root (set in the settings), shown read-only; snippets are prompt text
 * inserted from the Snippets panel of the Generate tab; projects are folders under the project root (set in the
 * settings) that keep the trays and the parameters of the workspace; the manual is the help of Image Bench.
 */
import {computed, onActivated, reactive, ref, watch} from "vue";
import ProjectsBrowser from "@/components/library/ProjectsBrowser.vue";
import ProjectDetail from "@/components/library/ProjectDetail.vue";
import SnippetsBrowser from "@/components/library/SnippetsBrowser.vue";
import SnippetEditor from "@/components/library/SnippetEditor.vue";
import DocsBrowser from "@/components/library/DocsBrowser.vue";
import DocViewer from "@/components/library/DocViewer.vue";
import ManualBrowser from "@/components/library/ManualBrowser.vue";
import ManualViewer from "@/components/library/ManualViewer.vue";
import AppIcon from "@/components/AppIcon.vue";
import {useProjectsStore} from "@/stores/projects.js";
import {useSnippetsStore} from "@/stores/snippets.js";
import {useDocsStore} from "@/stores/docs.js";
import {useManualStore} from "@/stores/manual.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useDragSize} from "@/composables/useDragSize.js";
import {dialog} from "@/dialogs/useDialog.js";

const SECTION_KEY = "imageBench_librarySection";
const SNIPPET_KEY = "imageBench_librarySelectedSnippet";
// The switch names the shown section; the others are their icons, those of their items in the tree
const SECTIONS = [
  {id: "docs", label: "Docs", icon: "book"},
  {id: "snippets", label: "Snippets", icon: "snippet"},
  {id: "projects", label: "Projects", icon: "box"},
  {id: "manual", label: "Manual", icon: "help"},
];
const SIDE_WIDTH_KEY = "imageBench_librarySideWidth";
// The detail pane keeps at least this width
const SIDE_WIDTH = {min: 220, default: 290, contentMin: 480};

const projects = useProjectsStore();
const snippets = useSnippetsStore();
const docs = useDocsStore();
const manual = useManualStore();
const storage = useLocalStorage();

const storedSection = storage.getItem(SECTION_KEY);
const section = ref(SECTIONS.some(s => s.id === storedSection) ? storedSection : "projects");
const query = ref("");
const selectedSnippet = ref(storage.getItem(SNIPPET_KEY) || null);

watch(section, value => storage.setItem(SECTION_KEY, value));

// The tree column is resized by the grip at its right edge
const sideWidth = reactive(useDragSize(SIDE_WIDTH_KEY, {
  axis: "x",
  direction: 1,
  min: SIDE_WIDTH.min,
  max: () => Math.max(SIDE_WIDTH.min, window.innerWidth - SIDE_WIDTH.contentMin),
  fallback: SIDE_WIDTH.default
}));
watch(selectedSnippet, id => storage.setItem(SNIPPET_KEY, id ?? ""));

// The tree is read again when the tab is shown, since folders may change outside of Image Bench
onActivated(async () => {
  snippets.load();
  docs.loadTree().then(() => docs.doc?.path !== docs.selectedPath && docs.open());
  await projects.loadTree();

  if (projects.selectedPath && (!projects.project || projects.project.path !== projects.selectedPath))
    await projects.loadProject();
});

const allTags = computed(() => {
  const tags = new Map();

  (function walk(entries) {
    for (const entry of entries)
      if (entry.type === "project")
        entry.project?.tags?.forEach(tag => tags.set(tag.toLowerCase(), tag));
      else
        walk(entry.children);
  })(projects.tree?.nodes ?? []);

  return [...tags.values()].sort((a, b) => a.localeCompare(b));
});

function filterTag(tag) {
  section.value = "projects";
  query.value = `#${tag} `;
}

async function deleteSnippet(id) {
  const item = snippets.find(id);

  if (item && await dialog.confirm(`Delete the snippet "${item.name}"?`, {title: "Delete", okText: "Delete", danger: true})) {
    selectedSnippet.value = null;
    snippets.remove(id);
  }
}

function duplicateSnippet(id) {
  selectedSnippet.value = snippets.duplicate(id)?.id ?? selectedSnippet.value;
}

// A snippet to show, requested by the Snippets panel of the Generate tab
watch(() => snippets.revealed, request => {
  if (request) {
    section.value = "snippets";

    if (typeof request === "string")
      selectedSnippet.value = request;

    snippets.revealed = null;
  }
}, {immediate: true});

// The projects, requested by the project chip of the tab bar
watch(() => projects.shownRequested, request => {
  if (request) {
    section.value = "projects";
    projects.shownRequested = false;
  }
}, {immediate: true});

// The manual, requested from the tab bar
watch(() => manual.revealed, request => {
  if (request) {
    section.value = "manual";
    manual.revealed = false;
  }
}, {immediate: true});
</script>

<template>
  <div class="view-container library">
    <aside class="side" :style="{width: `${sideWidth.size}px`}">
      <div class="seg sections" role="tablist" aria-label="Library section">
        <button v-for="item in SECTIONS" :key="item.id" role="tab" :class="{on: section === item.id}"
                :aria-selected="section === item.id" :aria-label="item.label" :title="item.label"
                @click="section = item.id"
          ><AppIcon :name="item.icon" :size="14"/><span v-if="section === item.id">{{ item.label }}</span></button>
      </div>
      <ProjectsBrowser v-if="section === 'projects'" v-model:query="query"/>
      <SnippetsBrowser v-else-if="section === 'snippets'" v-model:selected="selectedSnippet"/>
      <ManualBrowser v-else-if="section === 'manual'"/>
      <DocsBrowser v-else/>
    </aside>
    <div class="column-grip" :class="{active: sideWidth.resizing}" role="separator" aria-orientation="vertical"
         aria-label="Resize the tree column" :aria-valuenow="sideWidth.size" tabindex="0"
         title="Drag to resize the column; double-click to restore it"
         @pointerdown="sideWidth.onPointerDown" @keydown="sideWidth.onKeydown" @dblclick="sideWidth.reset"><i></i></div>
    <main class="content">
      <div v-if="projects.busy" class="busy"><span class="spinner"></span>{{ projects.busy }}</div>
      <ProjectDetail v-if="section === 'projects'" :all-tags="allTags" @filter-tag="filterTag"/>
      <SnippetEditor v-else-if="section === 'snippets'" :id="selectedSnippet" @delete="deleteSnippet"
                     @duplicate="duplicateSnippet"/>
      <ManualViewer v-else-if="section === 'manual'"/>
      <DocViewer v-else/>
    </main>
  </div>
</template>

<style scoped>
.library {
  flex-direction: row;
}

.side {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-right: 1px solid var(--ib-border);
  background: var(--ib-surface);
  min-height: 0;
}

/* Over the border between the tree column and the detail pane */
.column-grip {
  position: relative;
  z-index: 6;
  flex: none;
  width: 10px;
  margin: 0 -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: col-resize;
  touch-action: none;
}

.column-grip i {
  width: 4px;
  height: 40px;
  border-radius: 2px;
  background: var(--ib-border-2);
}

.column-grip:hover i,
.column-grip:focus-visible i,
.column-grip.active i {
  background: var(--ib-accent);
}

.column-grip:focus-visible {
  outline: none;
  background: var(--ib-accent-soft);
}

.sections {
  flex: none;
}

/* Only the shown section takes the free width, for its label */
.sections button {
  flex: none;
}

.sections button.on {
  flex: 1;
}

.content {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.busy {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 5;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border: 1px solid var(--ib-border-2);
  border-radius: 14px;
  background: var(--ib-elev);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  color: var(--ib-text);
  font-size: 12px;
}
</style>
