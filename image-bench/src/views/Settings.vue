<script setup>
import {useAppConfigStore} from "@/stores/appConfig.js";
import {computed, ref, watch} from "vue";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useProjectsStore} from "@/stores/projects.js";
import {ACCENT_COLORS, KNOWN_UI_PRESETS} from "@/consts.js";
import {HOST_NAME} from "@/host.js";
import AppIcon from "@/components/AppIcon.vue";

const appConfigStore = useAppConfigStore();
const sdWebUIStateStore = useSDWebUIStateStore();
const projectsStore = useProjectsStore();
const isWebUI = import.meta.env.MODE === 'webui';

// ---------- Project root ----------

const projectRoot = ref(appConfigStore.projectRoot);
// Result of the check: {exists, writable, projects, error}, null before
const rootCheck = ref(null);
const checking = ref(false);

watch(() => appConfigStore.projectRoot, root => projectRoot.value = root);

async function checkRoot() {
  checking.value = true;

  try {
    const response = await fetch(`/image-bench/projects/check?${new URLSearchParams({root: projectRoot.value.trim()})}`);
    rootCheck.value = await response.json();
  } catch (error) {
    rootCheck.value = {error: error.message};
  } finally {
    checking.value = false;
  }
}

async function saveRoot() {
  const root = projectRoot.value.trim();

  if (root === appConfigStore.projectRoot)
    return;

  appConfigStore.projectRoot = root;
  await appConfigStore.persist();
  await checkRoot();
  await projectsStore.loadTree();
  await projectsStore.loadCurrent();
}

// The presets reported by WebUI once the Generate tab was shown, the known ones until then
const uiPresetChoices = computed(() => {
  const reported = sdWebUIStateStore.options.uiPresets;
  return reported.length ? reported : KNOWN_UI_PRESETS;
});

function setGenerateUiPreset(index, value) {
  const presets = [...appConfigStore.generateUiPresets];
  presets[index] = value;
  appConfigStore.generateUiPresets = presets;
}
</script>

<template>
<div class="settings-container">
  <div class="settings-left">
    <h3>Appearance</h3>
    <div class="setting-label accent-setting">
      <span>Accent color</span>
      <div class="accent-swatches" role="radiogroup" aria-label="Accent color">
        <button v-for="(color, key) in ACCENT_COLORS" :key="key"
                type="button" role="radio"
                class="accent-swatch"
                :class="{selected: appConfigStore.accentColor === key}"
                :style="{'--swatch-color': color.accent}"
                :title="color.name"
                :aria-checked="appConfigStore.accentColor === key"
                @click="appConfigStore.accentColor = key"></button>
      </div>
      <span class="accent-name">{{ ACCENT_COLORS[appConfigStore.accentColor].name }}</span>
    </div>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.openInTab"
    >Open Image Bench in a browser tab instead of a popup window</label>
    <h3>Generation</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.flashGeneratedTab"
    >Flash the Generated tab when an image generated from the Generate tab arrives</label>
    <h3>Generate Tab</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.keepSessionStrip"
    >Keep the session filmstrip shown when a batch ends</label>
    <template v-if="isWebUI">
      <div class="setting-label generate-setting">
        <span>UI preset buttons</span>
        <select v-for="(preset, index) in appConfigStore.generateUiPresets" :key="index" :value="preset"
                :aria-label="`UI preset button ${index + 1}`" @change="e => setGenerateUiPreset(index, e.target.value)">
          <option v-for="choice in [...new Set([preset, ...uiPresetChoices])]" :key="choice" :value="choice">{{ choice }}</option>
        </select>
      </div>
      <label class="setting-label generate-setting">
        <span>Images set by the count button</span>
        <input type="number" min="2" :value="appConfigStore.generatePresetImages"
               @change="e => appConfigStore.generatePresetImages = e.target.value">
        <span class="help" tabindex="0" role="note"
              aria-label="WebUI allows at most 100 images per batch. To generate more, raise the maximum of Batch count in ui-config.json in the WebUI folder and restart WebUI."
          >?<span class="help-text" aria-hidden="true">WebUI allows at most 100 images per batch.
            To generate more, raise <code>"txt2img/Batch count/maximum"</code> and
            <code>"img2img/Batch count/maximum"</code> in <code>ui-config.json</code> in the WebUI folder,
            then restart WebUI.</span></span>
      </label>
    </template>
    <h3>Library</h3>
    <div class="setting-label root-setting">
      <label for="project-root">Project root</label>
      <input id="project-root" v-model="projectRoot" type="text" spellcheck="false"
             placeholder="D:\Projects or \\server\share\projects" @change="saveRoot" @keydown.enter="saveRoot">
      <button class="btn outline" :disabled="checking || !projectRoot.trim()" @click="checkRoot">Check</button>
    </div>
    <div class="setting-label root-help">
      The folder of the projects as the {{ HOST_NAME }} server sees it: a local path or a network (UNC) path.
      <span v-if="rootCheck" class="root-status" :class="{ok: rootCheck.exists && rootCheck.writable}">
        <AppIcon :name="rootCheck.exists && rootCheck.writable ? 'check' : 'alert'" :size="13"/>
        <template v-if="rootCheck.exists && rootCheck.writable">Exists and writable · {{ rootCheck.projects }} projects</template>
        <template v-else-if="rootCheck.exists">Exists, but is not writable</template>
        <template v-else>{{ rootCheck.error || "Not found" }}</template>
      </span>
    </div>
    <h3>Model Exploration</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.exploreLoraFreeImages"
    >Generate LoRA-free images for each model when exploring LoRAs</label>
    <h3>SD WebUI Interface</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.addModelInfoButton"
    >Add 'Civitai Model Info' settings button (restart required)</label>
    <label class="setting-label civitai-setting"><input type="checkbox" class="checkbox-spacer"
                                                       aria-hidden="true" tabindex="-1">Open models on
      <select v-model="appConfigStore.civitaiDomain">
        <option value="com">civitai.com</option>
        <option value="red">civitai.red</option>
      </select>
    </label>
    <label v-if="isWebUI" class="setting-label"><input type="checkbox" v-model="appConfigStore.repositionConfigPresetsDropdown"
    >Bring up the dropdown of the 'Config Presets' extension</label>
    <label v-if="isWebUI" class="setting-label"><input type="checkbox" v-model="appConfigStore.persistGenerationParams"
    >Remember prompts and generation parameters across WebUI reloads</label>
  </div>
</div>
</template>

<style scoped>
.settings-container {
  display: flex;
  flex-direction: row;
  padding-top: 15px;
}

a {
  text-decoration: none;
  color: var(--ib-accent);
  transition: 0.4s;
  padding: 3px;
}

a:hover {
  background-color: var(--ib-accent-soft);
}

.setting-label {
  display: block;
  padding-left: 15px;
}

.setting-label input {
  margin-right: 5px;
}

/* Invisible checkbox that aligns the text with the checkbox labels */
.checkbox-spacer {
  visibility: hidden;
}

.civitai-setting select {
  margin-left: 5px;
}

.generate-setting {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.generate-setting span {
  min-width: 200px;
}

.generate-setting .help {
  position: relative;
  min-width: 0;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--ib-border-2);
  border-radius: 50%;
  color: var(--ib-text-2);
  font-size: 11px;
  font-weight: 600;
  cursor: help;
}

.generate-setting .help:hover,
.generate-setting .help:focus-visible {
  outline: none;
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}

.generate-setting .help-text {
  position: absolute;
  left: 22px;
  top: 50%;
  z-index: 10;
  width: 320px;
  min-width: 0;
  padding: 8px 10px;
  transform: translateY(-50%);
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  visibility: hidden;
  pointer-events: none;
}

.generate-setting .help:hover .help-text,
.generate-setting .help:focus .help-text {
  visibility: visible;
}

.help-text code {
  font-family: var(--ib-mono);
  font-size: 11.5px;
  color: var(--ib-accent);
}

.generate-setting input {
  width: 80px;
}

.root-setting {
  display: flex;
  align-items: center;
  gap: 8px;
}

.root-setting input {
  width: 420px;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12px;
}

.root-setting input:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}

.root-help {
  margin-top: 4px;
  color: var(--ib-muted);
  font-size: 12px;
}

.root-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  color: var(--ib-warn);
}

.root-status.ok {
  color: var(--ib-info);
}

.accent-setting {
  display: flex;
  align-items: center;
  gap: 10px;
}

.accent-swatches {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-surface);
}

.accent-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: var(--swatch-color);
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: 1px;
  transition: outline-color 0.15s, transform 0.15s;
}

.accent-swatch:hover {
  transform: scale(1.08);
}

.accent-swatch.selected {
  outline-color: var(--ib-text);
  box-shadow: inset 0 0 0 2px var(--ib-surface);
}

.accent-name {
  color: var(--ib-text-2);
}

h3 {
  font-weight: bold;
}

h3:not(:first-child) {
  margin-top: 15px;
}
</style>