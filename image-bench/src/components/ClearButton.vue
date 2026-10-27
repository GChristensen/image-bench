<script setup>
/**
 * The Clear button of the image views, at the right end of their toolbars: a click removes all images, the arrow or a
 * middle click lists what else can be removed (the checked images, the marked or unmarked ones, those of one
 * marking) with their counts. Removals go through undo.js, so nothing asks first
 */
import {computed, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {openMenuBelow} from "@/contextMenu.js";
import {gestureTitle} from "@/gestures.js";
import {MARKINGS} from "@/consts.js";

const props = defineProps({
  // The entries of the view (batch separators are not counted)
  images: {
    type: Array,
    required: true
  },
  // Images of the view carry markings
  markable: {
    type: Boolean,
    default: true
  },
  // Images of the view can be checked
  selectable: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  // The text of the tooltip of a click
  allTitle: {
    type: String,
    default: "Remove all images from this view (Shift+Del); the files stay on disk"
  }
});

const emit = defineEmits(["remove"]);

const splitElement = ref(null);

const shown = computed(() => props.images.filter(image => !image.separator));
const hasMenu = computed(() => props.markable || props.selectable);

// Shift+click chooses which images, as a middle click does
function onClick(e) {
  if (e.shiftKey && hasMenu.value)
    openMenu();
  else
    emit("remove", () => true);
}

function count(predicate) {
  return shown.value.filter(predicate).length;
}

function item(icon, label, predicate) {
  return {icon, label, hint: String(count(predicate)), run: () => emit("remove", predicate)};
}

function openMenu() {
  const items = [item("eraser", "All", () => true)];
  const selected = count(image => image.selected);

  if (props.selectable && selected)
    items.push(item("checks", "Checked", image => image.selected && !image.separator));

  if (props.markable) {
    items.push({separator: true});
    items.push(item("filter", "Unmarked", image => !image.marking && !image.separator));
    items.push(item("tag", "Marked", image => !!image.marking));

    const used = MARKINGS.filter(marking => shown.value.some(image => image.marking === marking));

    if (used.length)
      items.push({label: "By marking", submenu: used.map(marking => ({label: marking,
        hint: String(count(image => image.marking === marking)), run: () => emit("remove", image => image.marking === marking)}))});
  }

  openMenuBelow(splitElement.value, items, {alignRight: true});
}

function onAuxClick(e) {
  if (e.button === 1 && hasMenu.value)
    openMenu();
}
</script>

<template>
  <div ref="splitElement" class="clear-split" :class="{split: hasMenu}">
    <button class="btn clear-main" :disabled="disabled || !shown.length"
            :title="hasMenu ? gestureTitle(allTitle, 'choose which images (or the arrow)') : allTitle"
            @click="onClick" @auxclick="onAuxClick" @mousedown.middle.prevent
      ><AppIcon name="eraser" :size="14"/>Clear</button>
    <button v-if="hasMenu" class="btn clear-more" :disabled="disabled || !shown.length"
            title="Choose which images to remove" aria-label="Choose which images to remove" aria-haspopup="menu"
            @click="openMenu"><AppIcon name="chevron" :size="12"/></button>
  </div>
</template>

<style scoped>
.clear-split {
  display: inline-flex;
  flex: none;
}

.split .clear-main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.clear-more {
  padding: 0 5px;
  border-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
