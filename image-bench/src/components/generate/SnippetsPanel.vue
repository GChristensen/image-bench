<script setup>
/**
 * Floating, non-modal panel of the Generate tab with the snippets of the Library. Clicks do not take the focus,
 * so a snippet goes to the caret of the prompt last focused. Click: insert (the other part goes to the other
 * prompt), middle-click or Shift+click: only this prompt. A snippet with a placeholder wraps the selected prompt
 * text. Dragged by its header, resized
 * by its corner; the position and size are kept.
 */
import {computed, onBeforeUnmount, onMounted, reactive, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";
import {useSnippetsStore} from "@/stores/snippets.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const GEOMETRY_KEY = "imageBench_snippetsPanel";
const DEFAULT_SIZE = {width: 300, height: 440};
const EDGE = 8;

defineProps({
  // Prompt that receives the snippets: 'prompt' or 'negativePrompt'
  target: {
    type: String,
    required: true
  }
});

const emit = defineEmits(["insert", "close", "from-selection", "edit"]);

const store = useSnippetsStore();
const storage = useLocalStorage();
const filter = ref("");
const panel = ref(null);
const selected = ref(null);

const saved = storage.getJsonItem(GEOMETRY_KEY, null);
const geometry = reactive({
  width: saved?.width ?? DEFAULT_SIZE.width,
  height: saved?.height ?? DEFAULT_SIZE.height,
  left: saved?.left ?? window.innerWidth - DEFAULT_SIZE.width - 40,
  top: saved?.top ?? 90
});

const style = computed(() => ({
  left: `${geometry.left}px`,
  top: `${geometry.top}px`,
  width: `${geometry.width}px`,
  height: `${geometry.height}px`
}));

function clamp() {
  geometry.width = Math.min(geometry.width, window.innerWidth - 2 * EDGE);
  geometry.height = Math.min(geometry.height, window.innerHeight - 2 * EDGE);
  geometry.left = Math.max(EDGE, Math.min(geometry.left, window.innerWidth - geometry.width - EDGE));
  geometry.top = Math.max(EDGE, Math.min(geometry.top, window.innerHeight - geometry.height - EDGE));
}

const saveGeometry = () => storage.setJsonItem(GEOMETRY_KEY, {...geometry});

// ---------- Moving and resizing ----------

let drag = null;

function onHeaderPointerDown(e) {
  if (e.button !== 0 || e.target.closest("button"))
    return;

  e.preventDefault();
  drag = {x: e.clientX - geometry.left, y: e.clientY - geometry.top};
  e.currentTarget.setPointerCapture(e.pointerId);
}

function onHeaderPointerMove(e) {
  if (!drag)
    return;

  geometry.left = e.clientX - drag.x;
  geometry.top = e.clientY - drag.y;
  clamp();
}

function onHeaderPointerUp() {
  if (drag) {
    drag = null;
    saveGeometry();
  }
}

// Resized by the CSS resize handle
const resizeObserver = new ResizeObserver(([entry]) => {
  const {width, height} = entry.target.getBoundingClientRect();

  if (width && height && (Math.round(width) !== geometry.width || Math.round(height) !== geometry.height)) {
    geometry.width = Math.round(width);
    geometry.height = Math.round(height);
    saveGeometry();
  }
});

function onWindowResize() {
  clamp();
}

onMounted(() => {
  clamp();
  store.load();
  resizeObserver.observe(panel.value);
  window.addEventListener("resize", onWindowResize);
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  window.removeEventListener("resize", onWindowResize);
});

// ---------- Snippets ----------

const matches = computed(() => {
  const text = filter.value.trim().toLowerCase();

  return text
    ? node => `${node.item.name}\n${node.item.prompt}\n${node.item.negative}`.toLowerCase().includes(text)
    : null;
});

function onSelect(node, e) {
  selected.value = node.key;

  if (!node.children)
    emit("insert", node.item, e.shiftKey ? "middle" : "click");
}

function onMiddle(node) {
  if (!node.children)
    emit("insert", node.item, "middle");
}

const snippetTitle = item => [item.prompt, item.negative && `Negative: ${item.negative}`].filter(Boolean).join("\n\n");
</script>

<template>
  <section ref="panel" class="snippets-panel" role="dialog" aria-modal="false" aria-label="Snippets" :style="style"
           @keydown.esc.stop="emit('close')">
    <header @pointerdown="onHeaderPointerDown" @pointermove="onHeaderPointerMove" @pointerup="onHeaderPointerUp"
            @pointercancel="onHeaderPointerUp">
      <AppIcon name="grip" :size="14" class="grip"/>
      <span class="title">Snippets</span>
      <span class="spacer"></span>
      <span class="target" :title="'Snippets go to the caret of the prompt last focused'"
        >→ {{ target === 'negativePrompt' ? 'Negative' : 'Positive' }}</span>
      <button class="ib flat sm" aria-label="Close" title="Close (Esc)" @click="emit('close')"><AppIcon name="close" :size="13"/></button>
    </header>
    <label class="search">
      <AppIcon name="fileSearch" :size="13"/>
      <input v-model="filter" type="text" placeholder="Filter" aria-label="Filter snippets" spellcheck="false"
             @keydown.esc.stop="filter ? filter = '' : emit('close')">
    </label>
    <div class="list">
      <TreeView :nodes="store.nodes" :selected-key="selected" storage-key="imageBench_snippetsUnfolded"
                keep-focus click-toggles :filter="matches" :empty-text="matches ? 'No snippets match' : 'No snippets yet'"
                @select="onSelect" @middle="onMiddle">
        <template #row="{node}">
          <AppIcon :name="node.children ? 'folder' : 'snippet'" :size="13" class="row-icon"/>
          <span class="name" :title="node.children ? null : snippetTitle(node.item)">{{ node.name }}</span>
          <span v-if="!node.children && node.item.negative" class="negative">−</span>
        </template>
      </TreeView>
    </div>
    <div class="hints">Click: insert · Middle or Shift: this prompt only · {} wraps the selection</div>
    <footer>
      <button class="btn outline small" title="Make a snippet of the selected text of the prompt"
              @mousedown.prevent @click="emit('from-selection', store.folderFor(selected))"
        ><AppIcon name="plus" :size="12"/>From selection</button>
      <span class="spacer"></span>
      <button class="link" @click="emit('edit', selected)">Edit in Library</button>
    </footer>
  </section>
</template>

<style scoped>
.snippets-panel {
  position: fixed;
  z-index: 900;
  min-width: 220px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: both;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: var(--ib-elev);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}

header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 4px 0 8px;
  border-bottom: 1px solid var(--ib-border);
  background: var(--ib-elev-2);
  cursor: move;
  user-select: none;
  touch-action: none;
}

.grip {
  color: var(--ib-muted);
}

.title {
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.target {
  padding: 1px 8px;
  border-radius: 9px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  font-size: 11px;
  white-space: nowrap;
}

.search {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  margin: 8px 8px 4px;
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

.negative {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid rgba(255, 122, 125, 0.4);
  border-radius: 3px;
  color: var(--ib-danger-text);
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.hints {
  flex: none;
  padding: 5px 10px;
  border-top: 1px solid var(--ib-border);
  color: var(--ib-muted);
  font-size: 11px;
}

footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 8px 8px;
  border-top: 1px solid var(--ib-border);
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ib-accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}
</style>
