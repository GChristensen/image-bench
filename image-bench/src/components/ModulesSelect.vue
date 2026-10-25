<script setup>
/**
 * VAE / Text Encoder modules of Forge Neo as a dropdown of the size of the checkpoint dropdown:
 * closed, it shows the chosen modules; open, a filterable checklist grouped by VAE and text encoder.
 * Each change is emitted at once.
 */
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import FilterChecklist from "@/components/FilterChecklist.vue";
import {MODULE_KIND_LABELS, modulesSummary, stripExtension} from "@/modules.js";
import {typeIntoFilter} from "@/typeToFilter.js";

const model = defineModel({type: Array, default: () => []});

const props = defineProps({
  // [{name, kind}] of /image-bench/modules
  choices: {
    type: Array,
    default: () => []
  }
});

const open = ref(false);
const filter = ref("");
const element = ref(null);
const checklist = ref(null);

// Chosen modules missing from the choices (e.g. the list is not loaded yet) are listed too
const items = computed(() => {
  const names = new Set(props.choices.map(module => module.name));

  return [...props.choices, ...model.value.filter(name => !names.has(name)).map(name => ({name, kind: ""}))]
    .map(module => ({value: module.name, label: stripExtension(module.name), group: module.kind}));
});

const summary = computed(() => modulesSummary(model.value));
const title = computed(() => model.value.length
  ? `VAE / Text Encoder:\n${model.value.join("\n")}`
  : "VAE / Text Encoder: none (those built into the checkpoint)");

function onDocumentMousedown(e) {
  if (open.value && !element.value?.contains(e.target))
    open.value = false;
}

function onKeydown(e) {
  if (open.value && (e.key === "Escape" || e.key === "Esc")) {
    e.stopPropagation();
    open.value = false;
  }
  else if (open.value)
    typeIntoFilter(e, checklist.value?.input);
}

onMounted(() => document.addEventListener("mousedown", onDocumentMousedown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMousedown));
</script>

<template>
  <div class="modules-select select-wrap" ref="element" @keydown="onKeydown">
    <button type="button" class="value" :class="{none: !summary}" :title="title" aria-haspopup="dialog"
            :aria-expanded="open" aria-label="VAE / Text Encoder" @click="open = !open"
      >{{ summary || "Built-in VAE / Text Encoder" }}</button>
    <AppIcon name="chevron" :size="14"/>
    <div v-if="open" class="menu popover" role="dialog" aria-label="VAE / Text Encoder">
      <FilterChecklist ref="checklist" v-model="model" v-model:filter="filter" :items="items" :groups="MODULE_KIND_LABELS"
                       empty-text="No VAE or text encoder files" autofocus/>
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

.value.none {
  color: var(--ib-muted);
}

.popover {
  top: calc(100% + 4px);
  left: 0;
  width: max(100%, 320px);
  box-sizing: border-box;
  padding: 6px;
}
</style>
