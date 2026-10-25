<script setup>
/**
 * Projects tab, shown by the project chip of the tab bar: the folders and projects under the project root (set in
 * the settings) as a tree at the left and the selected project at the right. A project keeps the trays and the
 * parameters of the workspace
 */
import {computed, onActivated, reactive, ref} from "vue";
import ProjectsBrowser from "@/components/projects/ProjectsBrowser.vue";
import ProjectDetail from "@/components/projects/ProjectDetail.vue";
import FolderDetail from "@/components/projects/FolderDetail.vue";
import {useProjectsStore} from "@/stores/projects.js";
import {useDragSize} from "@/composables/useDragSize.js";

const SIDE_WIDTH_KEY = "imageBench_projectsSideWidth";
// The detail pane keeps at least this width
const SIDE_WIDTH = {min: 220, default: 290, contentMin: 480};

const projects = useProjectsStore();
const query = ref("");

// The tree column is resized by the grip at its right edge
const sideWidth = reactive(useDragSize(SIDE_WIDTH_KEY, {
  axis: "x",
  direction: 1,
  min: SIDE_WIDTH.min,
  max: () => Math.max(SIDE_WIDTH.min, window.innerWidth - SIDE_WIDTH.contentMin),
  fallback: SIDE_WIDTH.default
}));

// The tree is read again when the tab is shown, since folders may change outside of Image Bench
onActivated(async () => {
  await projects.loadTree();

  // A folder removed outside of Image Bench leaves the root page
  if (projects.selectedFolder && projects.tree?.exists
      && projects.findNode(projects.tree.nodes, projects.selectedFolder)?.type !== "folder")
    projects.selectFolder(null);

  if (projects.folderShown === null && projects.selectedPath && (!projects.project || projects.project.path !== projects.selectedPath))
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
  query.value = `#${tag} `;
}
</script>

<template>
  <div class="view-container projects">
    <aside class="side" :style="{width: `${sideWidth.size}px`}">
      <ProjectsBrowser v-model:query="query"/>
    </aside>
    <div class="column-grip" :class="{active: sideWidth.resizing}" role="separator" aria-orientation="vertical"
         aria-label="Resize the tree column" :aria-valuenow="sideWidth.size" tabindex="0"
         title="Drag to resize the column; double-click to restore it"
         @pointerdown="sideWidth.onPointerDown" @keydown="sideWidth.onKeydown" @dblclick="sideWidth.reset"><i></i></div>
    <main class="content">
      <div v-if="projects.busy" class="busy"><span class="spinner"></span>{{ projects.busy }}</div>
      <FolderDetail v-if="projects.folderShown !== null && projects.tree?.root && projects.tree.exists !== false"
                    :path="projects.folderShown"/>
      <ProjectDetail v-else :all-tags="allTags" @filter-tag="filterTag"/>
    </main>
  </div>
</template>

<style scoped>
.projects {
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
