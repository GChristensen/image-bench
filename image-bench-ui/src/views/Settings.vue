<script setup>
import {useExploreImagesStore} from "@/stores/explore.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useAppConfigStore} from "@/stores/appConfig.js";

const appConfigStore = useAppConfigStore();
const exploreImagesStore = useExploreImagesStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaledImageStore = useUpscaledImagesStore();

function onClearAllClick(e) {
  e.preventDefault();

  if (confirm("This will clear all images. The image files will remain on disk. Do you want to continue?")) {
    clearImageStores();
  }
}

function clearImageStores() {
  exploreImagesStore.clear();
  generatedImagesStore.clear();
  imageTrayStore.clear();
  upscaledImageStore.clear();
}

function onClearOutputsClick(e) {
  e.preventDefault();

  if (confirm("This will clear all files in the SD WebUI outputs dir. Do you want to continue?")) {
    clearImageStores();
    setTimeout(() => fetch("/image-bench/clear_outputs_dir"), 500);
  }
}

function persistConfig() {
  appConfigStore.persist();
}

</script>

<template>
<div class="settings-container">
  <div class="settings-left">
    <h3>Generation</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.config.automaticallyClearGeneratedImages"
                                        @change="persistConfig()"
    >Automatically clear generated images</label>
    <h3>Other</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.config.repositionConfigPresetsDropdown"
                                        @change="persistConfig()"
    >Bring up the dropdown of the 'Config Presets' extension</label>
  </div>
  <div class="spacer"></div>
  <div class="settings-right">
    <h3>Actions</h3>
    <div class="action-link-container">
      <a class="action-link clear-all-link" href="#" @click="onClearAllClick">Clear all images</a>
    </div>
    <div class="action-link-container">
      <a class="action-link clear-outputs-link" href="#" @click="onClearOutputsClick">Clear outputs directory</a>
    </div>
  </div>
</div>
</template>

<style scoped>
.settings-container {
  display: flex;
  flex-direction: row;
  padding-top: 15px;
}

.spacer {
  /*flex-grow: 1;*/
  width: 50px;
}

a {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
  padding: 3px;
}

a:hover {
  background-color: hsla(160, 100%, 37%, 0.2);
}

.setting-label {
  display: block;
  padding-left: 15px;
}

.setting-label input {
  margin-right: 5px;
}

h3 {
  font-weight: bold;
}

h3:not(:first-child) {
  margin-top: 15px;
}
</style>