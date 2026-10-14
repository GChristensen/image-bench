<script setup>
/**
 * Workflow dropdown of the Generate tab (ComfyUI): closed, it shows the active workflow; open, the saved workflows
 * of the ComfyUI Workflows sidebar as a collapsible folder tree with a filter. Choosing one emits its path.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";

const props = defineProps({
  // [{path, name}], name: the path below the workflows folder without .json ("portraits/anima/base")
  workflows: {
    type: Array,
    default: () => []
  },
  // The active workflow {path, name, modified}, null if unknown
  active: {
    type: Object,
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["select"]);

const open = ref(false);
const filter = ref("");
const element = ref(null);
const filterInput = ref(null);
const tree = ref(null);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"});

// Folders first, then the workflows, each by name; folder keys are "folder:<path>"
const nodes = computed(() => {
  const root = {children: [], folders: new Map()};

  for (const {path, name} of props.workflows) {
    const parts = name.split("/");
    let parent = root;

    parts.slice(0, -1).forEach((part, i) => {
      if (!parent.folders.has(part)) {
        const folder = {key: `folder:${parts.slice(0, i + 1).join("/")}`, name: part, children: [], folders: new Map()};
        parent.folders.set(part, folder);
        parent.children.push(folder);
      }

      parent = parent.folders.get(part);
    });

    parent.children.push({key: path, name: parts.at(-1)});
  }

  const sort = list => {
    list.sort((a, b) => !!b.children - !!a.children || byName(a, b));
    list.forEach(node => node.children && sort(node.children));
    return list;
  };

  return sort(root.children);
});

const matches = computed(() => {
  const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? node => words.every(word => node.key.toLowerCase().includes(word)) : null;
});

const isSaved = computed(() => props.workflows.some(item => item.path === props.active?.path));

const title = computed(() => props.active
  ? `Workflow: ${props.active.name}${props.active.modified ? " (modified)" : ""}${isSaved.value ? "" : " (not saved)"}`
  : "Workflow");

const shownName = computed(() => props.active?.name.split("/").at(-1) || "Workflow…");

function choose(node) {
  if (node.children)
    return;

  open.value = false;

  if (node.key !== props.active?.path)
    emit("select", node.key);
}

// Opened at the active workflow
watch(open, async value => {
  if (!value)
    return;

  filter.value = "";
  await nextTick();

  if (isSaved.value) {
    tree.value?.reveal(props.active.path);
    await nextTick();
    element.value?.querySelector(".tree .row.selected")?.scrollIntoView({block: "nearest"});
  }

  filterInput.value?.focus();
});

watch(() => props.disabled, disabled => disabled && (open.value = false));

// Enter in the filter takes the first matching workflow
function onFilterEnter() {
  const first = element.value?.querySelector(".tree .name[data-path]");
  const workflow = first && props.workflows.find(item => item.path === first.dataset.path);

  if (workflow)
    choose({key: workflow.path});
}

function onDocumentMousedown(e) {
  if (open.value && !element.value?.contains(e.target))
    open.value = false;
}

function onKeydown(e) {
  if (open.value && (e.key === "Escape" || e.key === "Esc")) {
    e.stopPropagation();
    open.value = false;
  }
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="workflow-select select-wrap" ref="element" @keydown="onKeydown">
    <button type="button" class="value" :class="{none: !active}" :title="title" :disabled="disabled"
            aria-haspopup="dialog" :aria-expanded="open" aria-label="Workflow" @click="open = !open"
      >{{ shownName }}</button>
    <span v-if="active?.modified" class="modified-dot" aria-hidden="true">•</span>
    <AppIcon name="chevron" :size="14"/>
    <div v-if="open" class="menu popover" role="dialog" aria-label="Workflows">
      <label class="search">
        <AppIcon name="fileSearch" :size="14"/>
        <input ref="filterInput" v-model="filter" type="text" placeholder="Filter workflows" spellcheck="false"
               aria-label="Filter workflows" @keydown.enter.prevent="onFilterEnter">
      </label>
      <div class="list">
        <TreeView ref="tree" :nodes="nodes" :selected-key="isSaved ? active.path : null"
                  storage-key="imageBench_comfyWorkflowsUnfolded" click-toggles :filter="matches"
                  :empty-text="matches ? 'No workflows match' : 'No saved workflows'"
                  @select="(node, e) => e.type === 'click' && choose(node)" @activate="choose">
          <template #row="{node}">
            <AppIcon :name="node.children ? 'folder' : 'flask'" :size="14" class="row-icon"/>
            <span class="name" :data-path="node.children ? null : node.key" :title="node.children ? null : node.key"
              >{{ node.name }}</span>
          </template>
        </TreeView>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-select {
  position: relative;
}

.value {
  width: 100%;
  height: 26px;
  padding: 0 34px 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font: inherit;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.value:hover:not(:disabled) {
  border-color: var(--ib-border-2);
}

.value:disabled {
  opacity: 0.6;
  cursor: default;
}

.value.none {
  color: var(--ib-muted);
}

/* Unsaved changes of the active workflow, before the chevron */
.modified-dot {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  color: var(--ib-accent);
  pointer-events: none;
}

/* At the right edge of the toolbar: opens to the left */
.popover {
  top: calc(100% + 4px);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max(100%, 380px);
  max-height: min(70vh, 560px);
  box-sizing: border-box;
  padding: 6px;
}

/* .select-wrap places its icon (the chevron) at the right; the icons of the popover stay in their rows */
.popover .app-icon {
  position: static;
}

.search {
  flex: none;
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
}

.list :deep(.tree) {
  padding-bottom: 0;
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
