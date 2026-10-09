<script setup>
import {useAppConfigStore} from "@/stores/appConfig.js";
import {ACCENT_COLORS} from "@/consts.js";

const appConfigStore = useAppConfigStore();
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
    <h3>Generation</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.automaticallyClearGeneratedImages"
    >Automatically clear generated images</label>
    <h3>Model Exploration</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.exploreLoraFreeImages"
    >Generate LoRA-free images for each model when exploring LoRAs</label>
    <h3>SD WebUI Interface</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.addModelInfoButton"
    >Add 'Civitai Model Info' settings button</label>
    <label class="setting-label civitai-setting"><input type="checkbox" class="checkbox-spacer"
                                                       aria-hidden="true" tabindex="-1">Open models on
      <select v-model="appConfigStore.civitaiDomain">
        <option value="com">civitai.com</option>
        <option value="red">civitai.red</option>
      </select>
    </label>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.repositionConfigPresetsDropdown"
    >Bring up the dropdown of the 'Config Presets' extension</label>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.persistGenerationParams"
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