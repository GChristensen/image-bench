<script setup>
import {useAppConfigStore} from "@/stores/appConfig.js";

const appConfigStore = useAppConfigStore();
</script>

<template>
<div class="settings-container">
  <div class="settings-left">
    <h3>Generation</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.automaticallyClearGeneratedImages"
    >Automatically clear generated images</label>
    <h3>SD WebUI Interface</h3>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.addModelInfoButton"
    >Add 'Civitai Model Info' settings button</label>
    <label class="setting-label"><input type="checkbox" v-model="appConfigStore.repositionConfigPresetsDropdown"
    >Bring up the dropdown of the 'Config Presets' extension</label>
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