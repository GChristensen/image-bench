<script setup>
/**
 * Dropdown of a single value with a filter, in the size of a select: closed, it shows the value; open, the choices
 * narrowed down by the filter (each word of it a substring, in any case). Typing on the closed dropdown opens it
 * with the typed text; ↑/↓ move through the shown choices, Enter takes one, Escape closes. Choosing emits it.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {typeIntoFilter} from "@/typeToFilter.js";

const model = defineModel({type: String, default: ""});

const props = defineProps({
  choices: {
    type: Array,
    default: () => []
  },
  label: {
    type: String,
    default: ""
  },
  title: {
    type: String,
    default: null
  },
  emptyText: {
    type: String,
    default: "Nothing to choose"
  }
});

const open = ref(false);
const filter = ref("");
const highlighted = ref(-1);
const element = ref(null);
const filterInput = ref(null);
const list = ref(null);

const shown = computed(() => {
  const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length
    ? props.choices.filter(choice => words.every(word => choice.toLowerCase().includes(word)))
    : props.choices;
});

// The highlight follows the filter: the current value if shown, else the first match
watch(shown, choices => {
  const index = choices.indexOf(model.value);
  highlighted.value = index >= 0 && !filter.value.trim() ? index : choices.length ? 0 : -1;
  nextTick(scrollToHighlighted);
});

function scrollToHighlighted() {
  list.value?.children[highlighted.value]?.scrollIntoView({block: "nearest"});
}

async function show(text = "") {
  filter.value = text;
  open.value = true;
  highlighted.value = shown.value.indexOf(model.value);
  await nextTick();

  if (highlighted.value >= 0)
    list.value?.children[highlighted.value]?.scrollIntoView({block: "center"});

  filterInput.value?.focus();
}

function close(refocus = true) {
  open.value = false;

  if (refocus)
    element.value?.querySelector(".value")?.focus();
}

function choose(choice) {
  close();

  if (choice !== model.value)
    model.value = choice;
}

function move(step) {
  if (!shown.value.length)
    return;

  highlighted.value = Math.max(0, Math.min(shown.value.length - 1, highlighted.value + step));
  scrollToHighlighted();
}

// A printable key on the closed dropdown opens it with that text
function onValueKeydown(e) {
  if (open.value || e.ctrlKey || e.altKey || e.metaKey)
    return;

  if (e.key === "ArrowDown" || e.key === "ArrowUp" || (e.key.length === 1 && e.key !== " ")) {
    e.preventDefault();
    show(e.key.length === 1 ? e.key : "");
  }
}

function onKeydown(e) {
  if (!open.value)
    return;

  if (e.key === "Escape" || e.key === "Esc") {
    e.stopPropagation();
    close();
  }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    move(e.key === "ArrowDown" ? 1 : -1);
  }
  else if (e.key === "PageDown" || e.key === "PageUp") {
    e.preventDefault();
    move(e.key === "PageDown" ? 10 : -10);
  }
  else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();

    if (highlighted.value >= 0)
      choose(shown.value[highlighted.value]);
  }
  else if (e.key === "Tab")
    close(false);
  else
    typeIntoFilter(e, filterInput.value);
}

function onDocumentMousedown(e) {
  if (open.value && !element.value?.contains(e.target))
    close(false);
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="filter-select select-wrap" ref="element" @keydown="onKeydown">
    <button type="button" class="value" :title="title ?? model" aria-haspopup="listbox" :aria-expanded="open"
            :aria-label="label" @click="open ? close() : show()" @keydown="onValueKeydown">{{ model }}</button>
    <AppIcon name="chevron" :size="14"/>
    <div v-if="open" class="menu popover">
      <label class="search">
        <AppIcon name="fileSearch" :size="14"/>
        <input ref="filterInput" v-model="filter" type="text" placeholder="Filter" spellcheck="false"
               autocomplete="off" aria-label="Filter">
      </label>
      <div ref="list" class="list" role="listbox" :aria-label="label">
        <div v-for="(choice, index) in shown" :key="choice" class="choice" role="option"
             :class="{highlighted: index === highlighted, current: choice === model}"
             :aria-selected="choice === model" :title="choice"
             @mousemove="highlighted = index" @mousedown.prevent @click="choose(choice)">{{ choice }}</div>
        <div v-if="!shown.length" class="empty">{{ choices.length ? "No matches" : emptyText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.value {
  width: 100%;
  height: 26px;
  padding: 0 26px 0 8px;
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

.value:hover {
  border-color: var(--ib-border-2);
}

.popover {
  top: calc(100% + 4px);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max(100%, 420px);
  max-width: 90vw;
  max-height: min(70vh, 560px);
  box-sizing: border-box;
  padding: 6px;
}

/* .select-wrap places its icon (the chevron) at the right; the icon of the filter stays in its row */
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

.choice {
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.choice.highlighted {
  background: var(--ib-hover);
}

.choice.current {
  color: var(--ib-accent);
}

.empty {
  padding: 8px;
  color: var(--ib-muted);
}
</style>
