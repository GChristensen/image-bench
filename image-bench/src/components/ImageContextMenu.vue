<script setup>
/**
 * Context menu of an image, opened through openImageMenu() of contextMenu.js, or another menu (openContextMenu(),
 * openMenuBelow()); mounted once in App.vue
 */
import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
import {contextMenu, closeContextMenu} from "@/contextMenu.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import AppIcon from "@/components/AppIcon.vue";

const menuElement = ref(null);
const position = ref({left: 0, top: 0});
// Submenus open to the left when there is no room on the right
const flipSubmenus = ref(false);

const EDGE = 4;

watch(contextMenu, async (menu, previous) => {
  removeListeners();
  rowHovered.value = null;
  previous?.onClose?.();

  if (!menu)
    return;

  position.value = {left: menu.x, top: menu.y};
  await nextTick();

  // Keep the menu within the window
  const rect = menuElement.value.getBoundingClientRect();
  const left = menu.alignRight ? menu.x - rect.width : menu.x;
  position.value = {
    left: Math.max(EDGE, Math.min(left, window.innerWidth - rect.width - EDGE)),
    top: Math.max(EDGE, Math.min(menu.y, window.innerHeight - rect.height - EDGE))
  };
  flipSubmenus.value = position.value.left + rect.width * 2 > window.innerWidth;

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("wheel", closeContextMenu, true);
  window.addEventListener("blur", closeContextMenu);
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("keydown", onKeydown, true);
});

function removeListeners() {
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("wheel", closeContextMenu, true);
  window.removeEventListener("blur", closeContextMenu);
  window.removeEventListener("resize", closeContextMenu);
  window.removeEventListener("keydown", onKeydown, true);
}

onBeforeUnmount(removeListeners);

// A press on the button of the menu is left to its click, which closes the menu (openMenuBelow)
function onPointerDown(e) {
  if (!menuElement.value?.contains(e.target) && !contextMenu.value?.anchor?.contains(e.target))
    closeContextMenu();
}

// Escape is not consumed, so it also closes the overlay under the menu
function onKeydown(e) {
  if (e.key === "Escape" || e.key === "Esc")
    closeContextMenu();
}

// A submenu opens beside its item; near the bottom of the window it moves up so that it stays within it
function fitSubmenu(e) {
  const submenu = e.currentTarget.querySelector(".submenu");

  if (!submenu)
    return;

  submenu.style.top = "";
  const rect = submenu.getBoundingClientRect();
  const overflow = rect.bottom - (window.innerHeight - EDGE);

  if (overflow > 0)
    submenu.style.top = `${parseFloat(getComputedStyle(submenu).top) - Math.min(overflow, rect.top - EDGE)}px`;
}

function onItemClick(item) {
  closeContextMenu();
  item.run();
}

// ---------- Row of icon buttons (the Send actions) ----------

const shiftDown = useShiftKey();
// The entry of a row under the pointer, labelled under the row
const rowHovered = ref(null);

const rowEntry = entry => shiftDown.value && entry.alt ? entry.alt : entry;
const rowLabel = computed(() => rowHovered.value ? rowEntry(rowHovered.value) : null);

function onRowClick(entry, alt) {
  closeContextMenu();
  entry.run(alt);
}

// A middle click runs the alternative, as on the action rim
function onRowAuxClick(entry, e) {
  if (e.button === 1)
    onRowClick(entry, true);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="contextMenu" ref="menuElement" class="menu image-context-menu" :class="{flip: flipSubmenus}" role="menu"
         :style="{left: position.left + 'px', top: position.top + 'px'}" @contextmenu.prevent>
      <template v-for="(item, index) in contextMenu.items" :key="index">
        <hr v-if="item.separator">
        <div v-else-if="item.heading" class="item-heading" role="presentation">{{ item.heading }}</div>
        <div v-else-if="item.row" class="item-row" role="group">
          <div class="row-buttons">
            <button v-for="(entry, entryIndex) in item.row" :key="entryIndex" type="button" role="menuitem"
                    class="row-button" :class="{'group-start': entry.groupStart}" :style="{'--row-color': entry.color}"
                    :aria-label="rowEntry(entry).label"
                    @click="onRowClick(entry, $event.shiftKey)" @mousedown.middle.prevent
                    @auxclick="onRowAuxClick(entry, $event)"
                    @mouseenter="rowHovered = entry" @mouseleave="rowHovered = null">
              <AppIcon :name="rowEntry(entry).icon" :size="16"/>
            </button>
          </div>
          <div class="row-label">
            <template v-if="rowLabel">
              <span class="item-label">{{ rowLabel.label }}</span>
              <span class="item-hint">{{ rowLabel.hint }}</span>
            </template>
            <span v-else class="row-placeholder">{{ item.placeholder }}</span>
          </div>
        </div>
        <div v-else-if="item.submenu" class="submenu-item" @mouseenter="fitSubmenu">
          <button role="menuitem" aria-haspopup="menu">
            <AppIcon v-if="item.icon" :name="item.icon" :size="14" class="item-icon"/>
            <span v-else class="item-icon"></span>
            <span class="item-label">{{ item.label }}</span>
            <AppIcon name="chevron" :size="12" class="submenu-arrow"/>
          </button>
          <div class="menu submenu" role="menu">
            <template v-for="(subitem, subindex) in item.submenu" :key="subindex">
              <hr v-if="subitem.separator">
              <button v-else role="menuitem" @click="onItemClick(subitem)">
                <AppIcon v-if="subitem.icon" :name="subitem.icon" :size="14" class="item-icon"/>
                <span v-else class="item-icon"></span>
                <span class="item-label">{{ subitem.label }}</span>
                <span v-if="subitem.hint" class="item-hint">{{ subitem.hint }}</span>
              </button>
            </template>
          </div>
        </div>
        <button v-else role="menuitem" :class="{danger: item.danger}" :title="item.title" :disabled="item.disabled"
                @click="onItemClick(item)" @mouseenter="item.hover?.(true)" @mouseleave="item.hover?.(false)">
          <AppIcon v-if="item.icon" :name="item.icon" :size="14" class="item-icon"/>
          <span v-else class="item-icon"></span>
          <span class="item-label">{{ item.label }}</span>
          <span v-if="item.hint" class="item-hint">{{ item.hint }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* Above the image and parameters overlays (up to 1003), below the dialogs (1100) */
.image-context-menu {
  position: fixed;
  z-index: 1050;
  min-width: 220px;
}

.item-icon {
  width: 14px;
  flex-shrink: 0;
}

.item-label {
  flex: 1;
  white-space: nowrap;
}

.item-hint {
  margin-left: 16px;
  color: var(--ib-muted);
  font-size: 11px;
  white-space: nowrap;
}

.item-heading {
  padding: 6px 10px 3px;
  color: var(--ib-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* The destinations (send, trays, Compare): icon buttons tinted by their group, the label of the hovered one under them, which does not widen the menu */
.item-row {
  padding: 2px 2px 4px;
}

.row-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.menu .row-button {
  width: 32px;
  height: 28px;
  padding: 0;
  justify-content: center;
  border-radius: 5px;
  background: color-mix(in srgb, var(--row-color) 16%, transparent);
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--row-color) 70%, transparent);
  color: var(--row-color);
}

.menu .row-button.group-start {
  margin-left: 6px;
}

.menu .row-button:hover {
  background: color-mix(in srgb, var(--row-color) 34%, transparent);
  color: #fff;
}

.row-label {
  display: flex;
  align-items: center;
  width: 0;
  min-width: 100%;
  height: 20px;
  margin-top: 3px;
  padding: 0 4px;
  box-sizing: border-box;
  font-size: 11.5px;
}

.row-label .item-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-placeholder {
  color: var(--ib-muted);
}

.submenu-item {
  position: relative;
}

.submenu-arrow {
  transform: rotate(-90deg);
  color: var(--ib-muted);
}

.submenu {
  display: none;
  top: -5px;
  left: 100%;
}

.flip .submenu {
  left: auto;
  right: 100%;
}

.submenu-item:hover > .submenu {
  display: block;
}

.submenu-item:hover > button {
  background: var(--ib-hover);
}
</style>
