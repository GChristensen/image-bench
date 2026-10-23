<script setup>
/**
 * Download card of an editor plugin (manual, Editors chapter): its version and Download (.ccx for Photoshop, .zip
 * for Krita and GIMP), an asset of the editor-plugins GitHub release, which tools/plugins_release.py uploads along
 * with writing editor-plugins.json. The notes are the default slot (list items)
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import PLUGINS from "@/assets/editor-plugins.json";

const props = defineProps({
  // Plugin name of editor-plugins.json (editor-extensions/plugin_tools/editor_plugins.py: PLUGINS)
  plugin: {type: String, required: true},
  title: {type: String, required: true},
  // Short name of the editor on the badge
  badge: {type: String, default: "Ps"},
});

const RELEASE_URL = "https://github.com/GChristensen/image-bench/releases/tag/editor-plugins";
const DOWNLOAD_URL = "https://github.com/GChristensen/image-bench/releases/download/editor-plugins/";

const info = computed(() => PLUGINS[props.plugin]);
const extension = computed(() => info.value?.file.slice(info.value.file.lastIndexOf(".")) ?? "");
</script>

<template>
<div class="plugin-card">
  <div class="plugin-card-header">
    <span class="ps-badge">{{ badge }}</span>
    <div>
      <div class="plugin-title">{{ title }}</div>
      <div class="plugin-status">{{ info ? `Version ${info.version}` : "Not published yet." }}</div>
    </div>
  </div>
  <div class="plugin-actions">
    <a class="btn primary" :class="{disabled: !info}" :href="info ? DOWNLOAD_URL + info.file : undefined"
      ><AppIcon name="save" :size="14"/>Download {{ extension }}</a>
    <a class="btn" :href="RELEASE_URL" target="_blank" rel="noopener">Release page</a>
  </div>
  <ul v-if="$slots.default" class="plugin-notes">
    <slot/>
  </ul>
</div>
</template>

<style scoped>
.plugin-card {
  padding: 14px 16px 6px;
  margin: 12px 0 6px;
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  background: var(--ib-surface);
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ps-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 2px solid #31a8ff;
  border-radius: 6px;
  background: #001e36;
  color: #31a8ff;
  font-weight: 700;
}

.plugin-title {
  font-weight: 600;
}

.plugin-status {
  color: var(--ib-text-2);
}

.plugin-actions {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.plugin-actions a.btn {
  text-decoration: none;
}

.plugin-actions a.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.plugin-notes {
  color: var(--ib-text-2);
  font-size: 12.5px;
}
</style>
