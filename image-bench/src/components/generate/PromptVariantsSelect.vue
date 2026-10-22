<script setup>
/**
 * Dropdown of the prompt variants after the prompt history buttons: closed, it shows the name of the variant shown
 * or "Variants"; open, the variants with their names and the beginning of their prompts. Choosing one shows it like a
 * history entry (chosen again, the current prompt), a double click takes it into the current prompts
 */
import {onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
  // {name, prompt, negativePrompt, time}, in the order of forking
  variants: {
    type: Array,
    required: true
  },
  // Index of the variant shown, null if none
  selected: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(["select", "use", "rename", "remove"]);

const open = ref(false);
const element = ref(null);

watch(() => props.variants.length, length => length || (open.value = false));

function choose(index) {
  open.value = false;
  emit("select", index === props.selected ? null : index);
}

function use(index) {
  open.value = false;
  emit("use", index);
}

function rename(index) {
  open.value = false;
  emit("rename", index);
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
  <span ref="element" class="prompt-variants" @keydown="onKeydown">
    <button type="button" class="chip" :class="{on: selected !== null}" aria-haspopup="listbox" :aria-expanded="open"
            :title="selected === null ? 'Prompt variants of the project' : `Variant: ${variants[selected]?.name}`"
            @click="open = !open">
      <span class="label">{{ selected === null ? "Variants" : variants[selected]?.name }}</span>
      <AppIcon name="chevron" :size="9"/>
    </button>
    <div v-if="open" class="popover" role="listbox" aria-label="Prompt variants">
      <div v-for="(variant, index) in variants" :key="variant.time" class="item" :class="{on: selected === index}"
           role="option" :aria-selected="selected === index">
        <button type="button" class="pick" :title="`${variant.prompt}\n\nDouble-click to use it`"
                @click="choose(index)" @dblclick="use(index)">
          <span class="name">{{ variant.name }}</span>
          <span class="preview">{{ variant.prompt.trim() || variant.negativePrompt.trim() }}</span>
        </button>
        <button type="button" class="action" title="Rename" aria-label="Rename" @click="rename(index)"
          ><AppIcon name="pencil" :size="11"/></button>
        <button type="button" class="action" title="Remove" aria-label="Remove" @click="emit('remove', index)"
          ><AppIcon name="close" :size="11"/></button>
      </div>
    </div>
  </span>
</template>

<style scoped>
.prompt-variants {
  position: relative;
  flex: none;
  display: flex;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 140px;
  height: 16px;
  padding: 0 4px;
  border: 1px solid var(--ib-border);
  border-radius: 3px;
  background: var(--ib-surface);
  color: var(--ib-text-2);
  font: inherit;
  font-size: 10px;
  white-space: nowrap;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--ib-border-2);
  color: var(--ib-text);
}

.chip.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 320px;
  max-height: min(60vh, 420px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-elev);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.item {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  border-radius: 4px;
}

.item:hover {
  background: var(--ib-hover);
}

.item.on {
  background: var(--ib-accent-soft);
}

.pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.name {
  flex: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ib-text);
  font-size: 11.5px;
  font-weight: 600;
}

.item.on .name {
  color: var(--ib-accent);
}

.preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ib-muted);
  font-size: 11px;
}

/* Shown on the hovered row */
.action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--ib-text-2);
  cursor: pointer;
  visibility: hidden;
}

.item:hover .action,
.action:focus-visible {
  visibility: visible;
}

.action:hover {
  background: var(--ib-elev-2);
  color: var(--ib-text);
}
</style>
