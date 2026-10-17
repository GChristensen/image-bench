<script setup>
/**
 * Install card of an editor plugin supplied with the extension (manual, Editors chapter): its install state,
 * Install (on the computer running the host) and Download (.ccx for Photoshop, .zip for Krita and GIMP).
 * The notes are the default slot (list items)
 */
import {computed, onMounted, ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {dialog} from "@/dialogs/useDialog.js";
import {HOST_NAME} from "@/host.js";

const props = defineProps({
  // Plugin name of the backend (shared_backend/editor_plugins.py: PLUGINS)
  plugin: {type: String, required: true},
  title: {type: String, required: true},
  // The editor of the plugin and its short name on the badge
  editor: {type: String, default: "Photoshop"},
  badge: {type: String, default: "Ps"},
  // Where the editor shows the plugin after the restart
  menu: {type: String, required: true},
});

const PLUGIN_URL = "/image-bench/editor/plugin";
const query = computed(() => `?plugin=${encodeURIComponent(props.plugin)}`);

const status = ref(null);
const installing = ref(false);
// Install copies the plugin to the computer running the host, which is not this one for a remote host
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
    return `Version ${value.installed} is installed, ${value.available} is supplied: install to update.`;

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

// The elevated installer runs on its own; the status changes once it has written the plugin registry
async function waitForInstall(version) {
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadStatus();

    if (status.value?.installed === version)
      return true;
  }

  return false;
}

async function onInstall() {
  if (isRemoteHost && !await dialog.confirm(
      `${HOST_NAME} runs on another computer (${location.hostname}). The plugin will be installed there, `
      + `not on this computer. Download the ${status.value?.package ?? ""} file to install it here.`, {okText: "Install there"}))
    return;

  installing.value = true;

  try {
    const response = await fetch(`${PLUGIN_URL}/install${query.value}`, {method: "POST"});
    const result = await response.json();

    if (!response.ok)
      throw new Error(result.detail || response.statusText);

    if (result.result === "elevating") {
      dialog.alert("Confirm the Windows administrator prompt to finish the installation.", {title: props.title});

      if (!await waitForInstall(status.value?.available)) {
        await dialog.alert("The plugin was not installed. If the administrator prompt was declined, try again, "
            + "or install the downloaded .ccx file with the Creative Cloud app.", {title: props.title});
        return;
      }
    } else
      await loadStatus();

    await dialog.alert(`The plugin is installed. Restart ${props.editor} and open ${props.menu}.`, {title: props.title});
  } catch (e) {
    await dialog.alert(`Unable to install the plugin: ${e.message}`, {title: props.title});
  } finally {
    installing.value = false;
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
    <button class="btn primary" :disabled="installing || !status?.available || !status?.supported"
            :title="status && !status.supported ? `Not supported on ${status.platform}` : `Copy the plugin to the ${editor} plugin folder`"
            @click="onInstall"><AppIcon name="download" :size="14"/>{{ installing ? "Installing…" : "Install" }}</button>
    <a class="btn outline" :class="{disabled: !status?.available}" :href="`${PLUGIN_URL}/package${query}`" download
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
