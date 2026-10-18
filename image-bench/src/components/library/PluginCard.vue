<script setup>
/**
 * Download card of an editor plugin supplied with the extension (manual, Editors chapter): its version, the version
 * installed on the computer running the host, and Download (.ccx for Photoshop, .zip for Krita and GIMP).
 * The notes are the default slot (list items)
 */
import {computed, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
  // Plugin name of the backend (shared_backend/editor_plugins.py: PLUGINS)
  plugin: {type: String, required: true},
  title: {type: String, required: true},
  // Short name of the editor on the badge
  badge: {type: String, default: "Ps"},
});

const PLUGIN_URL = "/image-bench/editor/plugin";
const query = computed(() => `?plugin=${encodeURIComponent(props.plugin)}`);

const status = ref(null);
// The installed version is that of the computer running the host, which is not this one for a remote host
const isRemoteHost = !["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);

const state = computed(() => {
  const value = status.value;

  if (!value)
    return "";
  if (!value.available)
    return "The plugin files are missing from the extension.";
  if (!value.installed)
    return `Version ${value.available} is supplied; not installed${isRemoteHost ? " on the server computer" : ""}.`;
  if (value.installed !== value.available)
    return `Version ${value.installed} is installed, ${value.available} is supplied: download it to update.`;

  return `Version ${value.installed} is installed${isRemoteHost ? " on the server computer" : ""}.`;
});

async function loadStatus() {
  try {
    const response = await fetch(PLUGIN_URL + query.value);
    status.value = response.ok ? await response.json() : null;
  } catch (e) {
    status.value = null;
  }
}

onMounted(loadStatus);
</script>

<template>
<div class="plugin-card">
  <div class="plugin-card-header">
    <span class="ps-badge">{{ badge }}</span>
    <div>
      <div class="plugin-title">{{ title }}</div>
      <div class="plugin-status">{{ state || "Checking the plugin…" }}</div>
    </div>
  </div>
  <div class="plugin-actions">
    <a class="btn primary" :class="{disabled: !status?.available}" :href="`${PLUGIN_URL}/package${query}`" download
      ><AppIcon name="save" :size="14"/>Download {{ status?.package ?? "" }}</a>
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
