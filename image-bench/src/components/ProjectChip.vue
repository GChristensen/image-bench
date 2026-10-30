<script setup>
/**
 * Current project in the tab bar, also the tab of the Projects view: its icon (a close button while the icon or the
 * name is hovered), its name (shows the project in the Projects tab), a dot while the workspace has unsaved changes,
 * the Save button, and the arrow opening the chip's menu. Without a current project: "No project" (shows the projects),
 * a button creating a new project and the arrow. The menu (also on right-click) has Save and Close / New project, the
 * recent projects and the clean-up actions (cleanUp.js); image cards
 * dropped on the chip are copied into the folder of the current project. It pulses when the project reminder is armed (projectReminder.js)
 */
import {computed, ref, watch} from "vue";
import {RouterLink, useRoute, useRouter} from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import {baseName, PROJECT_TRAYS, useProjectsStore} from "@/stores/projects.js";
import {cleanUpItems} from "@/cleanUp.js";
import {copyToProject, openContextMenu, openMenuBelow} from "@/contextMenu.js";
import {canDropOn, KIND_PROJECT, takeDraggedImages} from "@/imageDrag.js";
import {reminder} from "@/projectReminder.js";
import {showShortcuts} from "@/shortcutSheet.js";
import {startBlankWorkspace} from "@/workspace.js";

const PROJECTS_ROUTE = "/projects";
const CLOSE_TITLE = "Closes the project and clears the workspace; output images stay on disk";

const store = useProjectsStore();
const route = useRoute();
const router = useRouter();

const active = computed(() => route.path === PROJECTS_ROUTE);
const canTakeImages = computed(() => store.hasCurrent && store.current.exists !== false);
const dropTarget = ref(false);
const pulsing = ref(false);

watch(() => reminder.armed, armed => pulsing.value = armed);

const title = computed(() => {
  const current = store.current;
  const changed = PROJECT_TRAYS.filter(tray => current.trays?.[tray.kind]?.changed).map(tray => tray.label);

  return [
    `Current project: ${current.path}`,
    current.exists === false ? "The project folder is not found" : null,
    changed.length ? `Changed since the last save: ${changed.join(", ")}` : "No unsaved tray changes",
    "Click to show it in the projects; the icon closes it; right-click or the arrow: recent projects and clean-up",
    canTakeImages.value ? "Drop images here to copy them into the project folder" : null
  ].filter(Boolean).join("\n");
});

function show() {
  store.show(store.hasCurrent ? store.current.path : null);
}

const menuButton = ref(null);

function menuItems() {
  const items = store.hasCurrent
    ? [{icon: "save", label: "Save", hint: "Ctrl+S", disabled: !!store.busy || store.current.exists === false,
        run: () => store.save()},
       {icon: "close", label: "Close", disabled: !!store.busy, title: CLOSE_TITLE, run: () => startBlankWorkspace()},
       {icon: "box", label: "Show in Projects", run: () => { show(); router.push(PROJECTS_ROUTE); }}]
    : [{icon: "plus", label: "New project…", disabled: !!store.busy, run: () => store.createProject()}];

  const recent = store.recent.filter(path => path !== store.current?.path);
  items.push({heading: "Recent"});

  for (const path of recent) {
    const folder = path.slice(0, -baseName(path).length - 1);
    items.push({icon: "box", label: baseName(path), hint: folder, run: () => store.open(path)});
  }

  items.push({icon: "folder", label: "All projects…", run: () => router.push(PROJECTS_ROUTE)});
  return [...items, ...cleanUpItems(), {separator: true},
    {icon: "help", label: "Mouse and keys", hint: "?", run: () => showShortcuts("mouse")}];
}

function openMenu(event) {
  openContextMenu(event, menuItems());
}

function openMenuFromButton() {
  openMenuBelow(menuButton.value, menuItems(), {alignRight: true});
}

function onDragOver(e) {
  if (!canTakeImages.value || !canDropOn(e, KIND_PROJECT))
    return;

  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  dropTarget.value = true;
}

// Moving between the buttons of the chip also leaves it
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget))
    dropTarget.value = false;
}

function onDrop() {
  dropTarget.value = false;
  const images = takeDraggedImages();

  if (images.length)
    copyToProject(images);
}
</script>

<template>
  <div v-if="!store.hasCurrent" class="project-chip empty" :class="{active}" @contextmenu="openMenu">
    <RouterLink :to="PROJECTS_ROUTE" class="chip-name"
                title="No current project: the workspace is not saved anywhere.&#10;Click to show the projects; right-click or the arrow: recent projects and clean-up">
      <AppIcon name="box" :size="13"/>
      <span class="name">No project</span>
    </RouterLink>
    <button class="chip-save" :disabled="!!store.busy"
            :title="store.busy || 'New project, in the folder selected in the Projects tab or the root; the workspace can be saved into it'" aria-label="New project"
            @click="store.createProject()"><span v-if="store.busy" class="spinner"></span><AppIcon v-else name="plus" :size="13"/></button>
    <button ref="menuButton" class="chip-menu" title="Recent projects and clean-up" aria-label="Project menu"
            aria-haspopup="menu" @click="openMenuFromButton"><AppIcon name="chevron" :size="12"/></button>
  </div>
  <div v-else class="project-chip" :class="{active, missing: store.current.exists === false, 'drop-target': dropTarget, pulsing}"
       @animationend="pulsing = false" @contextmenu="openMenu" @dragover="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
    <div class="chip-head">
      <button class="chip-close" :disabled="!!store.busy" :title="CLOSE_TITLE" aria-label="Close the project"
              @click="startBlankWorkspace()">
        <AppIcon class="icon-project" :name="store.current.exists === false ? 'alert' : 'box'" :size="13"/>
        <AppIcon class="icon-close" name="close" :size="13"/>
      </button>
      <RouterLink :to="PROJECTS_ROUTE" class="chip-name" :title="title" @click="show">
        <span class="name">{{ store.current.name }}</span>
        <span v-if="store.unsaved" class="dot" aria-label="Unsaved changes"></span>
      </RouterLink>
    </div>
    <button class="chip-save" :disabled="!!store.busy || store.current.exists === false"
            :title="store.busy || 'Save the workspace into the project (Ctrl+S)'" aria-label="Save the project"
            @click="store.save()"><span v-if="store.busy" class="spinner"></span><AppIcon v-else name="save" :size="13"/></button>
    <button ref="menuButton" class="chip-menu" title="Save, recent projects and clean-up (also right-click on the chip)"
            aria-label="Project menu" aria-haspopup="menu" @click="openMenuFromButton"><AppIcon name="chevron" :size="12"/></button>
  </div>
</template>

<style scoped>
.project-chip {
  display: flex;
  align-items: center;
  height: 26px;
  margin-right: 6px;
  border: 1px solid var(--ib-project-border);
  border-radius: 13px;
  background: var(--ib-project-soft);
  overflow: hidden;
  /* In a narrow window the name is cut, never the buttons: overflow: hidden would let the chip shrink to 0,
     and min-content would include the whole name, so the floor is the icon, the dot and both buttons */
  min-width: 97px;
}

.project-chip.empty {
  min-width: 0;
  border-style: dashed;
  border-color: var(--ib-border);
  background: none;
}

.empty .name {
  font-weight: 400;
  color: var(--ib-muted);
}

.empty .chip-name .app-icon {
  color: var(--ib-muted);
}

.project-chip.missing {
  border-color: rgba(240, 164, 49, 0.5);
}

/* The chip is the tab of the Projects view: shown, it takes the look of a selected tab */
.project-chip.active {
  border-style: solid;
  border-color: var(--ib-accent);
  background: var(--ib-accent-soft);
}

.active .name {
  color: #fff;
}

.empty.active .chip-name .app-icon {
  color: var(--ib-accent);
}

.project-chip.pulsing {
  animation: pulse 0.9s ease-out 2;
}

@keyframes pulse {
  30% {
    box-shadow: 0 0 0 4px var(--ib-project-border);
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-chip.pulsing {
    animation: none;
  }
}

.project-chip.drop-target {
  background: color-mix(in srgb, var(--ib-project) 22%, transparent);
  box-shadow: inset 0 0 0 1px var(--ib-project-border);
}

.chip-head {
  display: flex;
  min-width: 0;
  flex-shrink: 1;
  height: 100%;
}

.chip-name,
.chip-close,
.chip-save,
.chip-menu {
  height: 100%;
  display: flex;
  align-items: center;
  border: 0;
  background: none;
  color: var(--ib-text);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}

.chip-name {
  gap: 6px;
  min-width: 0;
  flex-shrink: 1;
  max-width: 190px;
  padding: 0 4px 0 9px;
}

/* The icon is the close button: its own hit area, so the name keeps the gap after it as padding */
.chip-close {
  flex-shrink: 0;
  padding: 0 3px 0 9px;
}

.chip-head .chip-name {
  padding-left: 3px;
}

.chip-name .app-icon,
.chip-close .app-icon {
  flex-shrink: 0;
  color: var(--ib-project);
}

/* Hovering the icon or the name turns the project icon into the close icon */
.chip-close .icon-close,
.chip-head:hover .chip-close:not(:disabled) .icon-project {
  display: none;
}

.chip-head:hover .chip-close:not(:disabled) .icon-close {
  display: block;
  color: var(--ib-text);
}

.chip-close:hover:not(:disabled) .icon-close {
  color: var(--ib-danger);
}

.active .chip-close .icon-project,
.active .chip-save {
  color: var(--ib-accent);
}

.missing .chip-close .icon-project {
  color: var(--ib-warn);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--ib-warn);
}

.chip-save,
.chip-menu {
  flex-shrink: 0;
}

.chip-save {
  width: 28px;
  justify-content: center;
  color: var(--ib-project);
}

.chip-menu {
  width: 22px;
  justify-content: center;
  padding-right: 2px;
  color: var(--ib-muted);
}

.chip-name:hover,
.chip-close:hover:not(:disabled),
.chip-save:hover:not(:disabled),
.chip-menu:hover:not(:disabled) {
  background: var(--ib-hover);
}

.chip-close:disabled {
  cursor: default;
}

.chip-save:disabled,
.chip-menu:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
