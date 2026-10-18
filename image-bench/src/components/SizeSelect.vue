<script setup>
/**
 * Image size picker: preset sizes grouped by megapixels and by model, and a button swapping width and height.
 * The presets are listed in the orientation of the current size, so after a swap they stay selectable;
 * a size that matches no preset is shown as custom. The list is a popover (up to 75% of the viewport high),
 * since a native select is cut to a few rows.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {SIZE_PRESET_GROUPS} from "@/consts.js";

const props = defineProps({
  width: {
    type: [Number, String],
    default: null
  },
  height: {
    type: [Number, String],
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['change']);

const open = ref(false);
const element = ref(null);
const list = ref(null);

const width = computed(() => parseInt(props.width) || 0);
const height = computed(() => parseInt(props.height) || 0);
const isPortrait = computed(() => height.value > width.value);
const currentValue = computed(() => `${width.value}x${height.value}`);

// Presets turned to the current orientation, e.g. 1216x832 (19:13) -> 832x1216 (13:19)
const groups = computed(() => SIZE_PRESET_GROUPS.map(group => ({
  name: group.name,
  sizes: group.sizes.map(({width: w, height: h, note}) => {
    const flip = isPortrait.value && w > h;
    const [sw, sh] = flip ? [h, w] : [w, h];
    const shownNote = flip ? note.replace(/^(\d+):(\d+)/, "$2:$1") : note;

    return {value: `${sw}x${sh}`, width: sw, height: sh, size: `${sw}x${sh}`, note: shownNote};
  })
})));

const current = computed(() => {
  for (const group of groups.value) {
    const size = group.sizes.find(size => size.value === currentValue.value);

    if (size)
      return {...size, group: group.name};
  }

  return null;
});

const shownLabel = computed(() => current.value
  ? current.value.size + (current.value.note ? ` (${current.value.note})` : "")
  : `${currentValue.value} (custom)`);

const title = computed(() => current.value ? `Image size: ${shownLabel.value}, ${current.value.group}` : "Image size");

function choose(size) {
  open.value = false;

  if (size.value !== currentValue.value)
    emit('change', size.width, size.height);
}

// Opened at the current size, focused for the arrow keys
watch(open, async value => {
  if (!value)
    return;

  await nextTick();
  const selected = list.value?.querySelector("button.selected") ?? list.value?.querySelector("button");
  selected?.scrollIntoView({block: "center"});
  selected?.focus({preventScroll: true});
});

watch(() => props.disabled, disabled => disabled && (open.value = false));

function onListKeydown(e) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End")
    return;

  e.preventDefault();
  const buttons = [...list.value.querySelectorAll("button")];
  const index = buttons.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0
    : e.key === "End" ? buttons.length - 1
    : Math.min(buttons.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)));

  buttons[next]?.focus();
  buttons[next]?.scrollIntoView({block: "nearest"});
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
  <div class="size-select">
    <div class="select-wrap" ref="element" @keydown="onKeydown">
      <button type="button" class="value" :disabled="disabled" :title="title" aria-haspopup="listbox"
              :aria-expanded="open" aria-label="Image size" @click="open = !open">{{ shownLabel }}</button>
      <AppIcon name="chevron" :size="14"/>
      <div v-if="open" ref="list" class="menu popover" role="listbox" aria-label="Image sizes"
           @keydown="onListKeydown">
        <template v-for="group in groups" :key="group.name">
          <div class="group">{{ group.name }}</div>
          <button v-for="size in group.sizes" :key="size.value" type="button" role="option"
                  :class="{selected: size.value === currentValue}" :aria-selected="size.value === currentValue"
                  @click="choose(size)"
            ><span class="dims">{{ size.size }}</span><span class="note">{{ size.note }}</span></button>
        </template>
      </div>
    </div>
    <button class="ib" :disabled="disabled || width === height" title="Swap width and height"
            aria-label="Swap width and height" @click="emit('change', height, width)"><AppIcon name="swap"/></button>
  </div>
</template>

<style scoped>
.size-select {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.value {
  width: 100%;
  height: 26px;
  padding: 0 26px 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12px;
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

.popover {
  top: calc(100% + 4px);
  left: 0;
  width: max(100%, 200px);
  max-height: 75vh;
  box-sizing: border-box;
  overflow-y: auto;
}

.group {
  padding: 6px 8px 2px;
  color: var(--ib-muted);
  font-size: 11px;
  font-weight: 600;
}

.group:first-child {
  padding-top: 2px;
}

.popover button {
  gap: 12px;
  height: 22px;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.popover button.selected {
  background: var(--ib-hover);
  color: var(--ib-accent);
}

.popover button:focus-visible {
  outline: 1px solid var(--ib-accent-border);
  outline-offset: -1px;
}

.dims {
  min-width: 9ch;
}

.note {
  color: var(--ib-muted);
}
</style>
