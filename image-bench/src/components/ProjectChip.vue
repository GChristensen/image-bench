<script setup>
/**
 * Current project in the tab bar: its name (opens it in the Library), a dot while the workspace has unsaved
 * changes, the Save button, and the close button, which starts a blank workspace (as the clean-up action)
 */
import {computed} from "vue";
import {useRouter} from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import {PROJECT_TRAYS, useProjectsStore} from "@/stores/projects.js";
import {startBlankWorkspace} from "@/workspace.js";

const store = useProjectsStore();
const router = useRouter();

const title = computed(() => {
  const current = store.current;
  const changed = PROJECT_TRAYS.filter(tray => current.trays?.[tray.kind]?.changed).map(tray => tray.label);

  return [
    `Current project: ${current.path}`,
    current.exists === false ? "The project folder is not found" : null,
    changed.length ? `Changed since the last save: ${changed.join(", ")}` : "No unsaved tray changes",
    "Click to show it in the Library"
  ].filter(Boolean).join("\n");
});

async function show() {
  await router.push("/library");
  await store.select(store.current.path);
}
</script>

<template>
  <div v-if="store.hasCurrent" class="project-chip" :class="{missing: store.current.exists === false}">
    <button class="chip-name" :title="title" @click="show">
      <AppIcon :name="store.current.exists === false ? 'alert' : 'box'" :size="13"/>
      <span class="name">{{ store.current.name }}</span>
      <span v-if="store.unsaved" class="dot" aria-label="Unsaved changes"></span>
    </button>
    <button class="chip-save" :disabled="!!store.busy || store.current.exists === false"
            :title="store.busy || 'Save the workspace into the project (Ctrl+S)'" aria-label="Save the project"
            @click="store.save()"><span v-if="store.busy" class="spinner"></span><AppIcon v-else name="save" :size="13"/></button>
    <button class="chip-close" :disabled="!!store.busy"
            title="Close the project: clears the images, trays and prompts for a blank workspace"
            aria-label="Close the project" @click="startBlankWorkspace"><AppIcon name="close" :size="12"/></button>
  </div>
</template>

<style scoped>
.project-chip {
  display: flex;
  align-items: center;
  height: 26px;
  margin-right: 6px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--ib-accent) 7%, transparent);
  overflow: hidden;
}

.project-chip.missing {
  border-color: rgba(240, 164, 49, 0.5);
}

.chip-name,
.chip-save,
.chip-close {
  height: 100%;
  display: flex;
  align-items: center;
  border: 0;
  background: none;
  color: var(--ib-text);
  font: inherit;
  cursor: pointer;
}

.chip-name {
  gap: 6px;
  max-width: 190px;
  padding: 0 4px 0 9px;
}

.chip-name .app-icon {
  color: var(--ib-accent);
}

.missing .chip-name .app-icon {
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

.chip-save {
  width: 28px;
  justify-content: center;
  color: var(--ib-accent);
}

.chip-close {
  width: 22px;
  justify-content: center;
  padding-right: 2px;
  color: var(--ib-muted);
}

.chip-close:hover:not(:disabled) {
  color: var(--ib-danger-text);
}

.chip-name:hover,
.chip-save:hover:not(:disabled),
.chip-close:hover:not(:disabled) {
  background: var(--ib-hover);
}

.chip-save:disabled,
.chip-close:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
