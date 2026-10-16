<script setup>
/**
 * Left pane of the Library manual: the contents, marking the chapter being read
 */
import AppIcon from "@/components/AppIcon.vue";
import TreeView from "@/components/TreeView.vue";
import {HOST_NAME} from "@/host.js";
import {MANUAL_SECTIONS, useManualStore} from "@/stores/manual.js";

const manual = useManualStore();

const toNode = section => ({
  key: section.id,
  name: section.title,
  icon: section.icon,
  ...(section.children ? {children: section.children.map(toNode)} : {})
});

const nodes = MANUAL_SECTIONS.map(toNode);
</script>

<template>
  <div class="manual-browser">
    <div class="toolbar-line">Image Bench for {{ HOST_NAME }}</div>
    <div class="list">
      <TreeView :nodes="nodes" :selected-key="manual.active" storage-key="imageBench_libraryManualFolded"
                default-open @select="node => manual.goTo(node.key)">
        <template #row="{node}">
          <AppIcon :name="node.icon" :size="14" class="row-icon"/>
          <span class="name">{{ node.name }}</span>
        </template>
      </TreeView>
    </div>
  </div>
</template>

<style scoped>
.manual-browser {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

/* As high as the button lines of the other sections */
.toolbar-line {
  display: flex;
  align-items: center;
  height: 22px;
  color: var(--ib-muted);
  font-size: 11.5px;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
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
</style>
