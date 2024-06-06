<script setup>

import {onBeforeMount, onMounted, ref} from "vue";

  const models = ref([]);
  const selected = ref(new Set());

  async function refreshModels() {
    models.value = await fetch("http://" + location.host + "/sdapi/v1/sd-models").then(r => r.json());
  }

  onBeforeMount(async () => {
    await refreshModels();
  });

  function onModelCheckChange(e, index) {
    if (e.target.checked)
      selected.value.add(index);
    else
      selected.value.delete(index);
  }

function getSelectedModels() {
  const selectedItems = [];

  for (let i = 0; i < models.value.length; ++i) {
    if (selected.value.has(i)) {
      const proxyItem = models.value[i];
      const image = JSON.parse(JSON.stringify(proxyItem));
      selectedItems.push(image);
    }
  }

  return selectedItems;
}

function onExploreClick() {
    const selectedModels = getSelectedModels();

    window.opener.postMessage({type: "EXPLORE_MODELS", models: selectedModels})
    setTimeout(() => window.open("", "sd-webui-main-window").focus(), 200);
}

</script>

<template>
  <div class="wrapper">
    <div class="toolbar">
      <a href="#" class="tool-item" id="explore-selected" @click="onExploreClick">Explore</a>
    </div>
    <div class="explore-container">
      <div class="model-list">
        <select class="model-presets">
          <option>test</option>
        </select>
        <div class="preset-controls">
          <a class="control-link" href="#">Create</a
          >&nbsp;<a class="control-link" href="#">Save</a
          >&nbsp;<a class="control-link" href="#">Delete</a>
        </div>
        <div class="models-container">
          <div class="models">
            <div v-for="(model, index) in models">
              <label><input type="checkbox" @change="e => onModelCheckChange(e, index)"
                >&nbsp;{{model.model_name}}</label>
            </div>
          </div>
        </div>
      </div>
      <div class="generated-images">

      </div>
    </div>
  </div>
</template>

<style scoped>
.wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.explore-container {
  display: flex;
  flex-grow: 1;
}

.model-presets {
  min-width: 100px;
}

.models-container {
  position: relative;
  flex-grow: 1;
}

.models {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  width: max-content;
}

.model-list {
  padding: 15px 0;
  display: flex;
  flex-direction: column;
}

.generated-images {
  flex-grow: 1;
}

.control-link {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
  padding: 3px;
  font-size: 90%;
}
</style>