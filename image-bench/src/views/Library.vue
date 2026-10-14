<script setup>
/**
 * Library tab: projects and snippets, each as a tree at the left and the selected item at the right.
 * Projects are folders under the project root (set in the settings) that keep the trays and the parameters
 * of the workspace; snippets are prompt text inserted from the Snippets panel of the Generate tab.
 */
import {computed, onActivated, reactive, ref, watch} from "vue";
import ProjectsBrowser from "@/components/library/ProjectsBrowser.vue";
import ProjectDetail from "@/components/library/ProjectDetail.vue";
import SnippetsBrowser from "@/components/library/SnippetsBrowser.vue";
import SnippetEditor from "@/components/library/SnippetEditor.vue";
import {useProjectsStore} from "@/stores/projects.js";
import {useSnippetsStore} from "@/stores/snippets.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useDragSize} from "@/composables/useDragSize.js";
import {dialog} from "@/dialogs/useDialog.js";

const SECTION_KEY = "imageBench_librarySection";
const SNIPPET_KEY = "imageBench_librarySelectedSnippet";
const SIDE_WIDTH_KEY = "imageBench_librarySideWidth";
// The detail pane keeps at least this width
const SIDE_WIDTH = {min: 220, default: 290, contentMin: 480};

const projects = useProjectsStore();
const snippets = useSnippetsStore();
const storage = useLocalStorage();

const section = ref(storage.getItem(SECTION_KEY) === "snippets" ? "snippets" : "projects");
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
</script>

<template>
  <div class="view-container library">
    <aside class="side" :style="{width: `${sideWidth.size}px`}">
      <div class="seg sections" role="tablist" aria-label="Library section">
        <button role="tab" :class="{on: section === 'projects'}" :aria-selected="section === 'projects'"
                @click="section = 'projects'">Projects</button>
        <button role="tab" :class="{on: section === 'snippets'}" :aria-selected="section === 'snippets'"
                @click="section = 'snippets'">Snippets</button>
      </div>
      <ProjectsBrowser v-if="section === 'projects'" v-model:query="query"/>
      <SnippetsBrowser v-else v-model:selected="selectedSnippet"/>
    </aside>
    <div class="column-grip" :class="{active: sideWidth.resizing}" role="separator" aria-orientation="vertical"
         aria-label="Resize the tree column" :aria-valuenow="sideWidth.size" tabindex="0"
         title="Drag to resize the column; double-click to restore it"
         @pointerdown="sideWidth.onPointerDown" @keydown="sideWidth.onKeydown" @dblclick="sideWidth.reset"><i></i></div>
    <main class="content">
      <div v-if="projects.busy" class="busy"><span class="spinner"></span>{{ projects.busy }}</div>
      <ProjectDetail v-if="section === 'projects'" :all-tags="allTags" @filter-tag="filterTag"/>
      <SnippetEditor v-else :id="selectedSnippet" @delete="deleteSnippet" @duplicate="duplicateSnippet"/>
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
