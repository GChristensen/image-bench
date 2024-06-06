<script setup>

import {onBeforeMount, onMounted, reactive, ref} from "vue";
import SelectableImage from "@/components/SelectableImage.vue";
import {createImageData, createImageLink} from "@/utils.js";
import ImageOverlay from "@/components/ImageOverlay.vue";

  const models = ref([]);
  const selected = ref(new Set());
  const lastPreset = ref("");
  const presetNames = ref([]);
  const presetSelect = ref();
  let modelPresets = {};
  const modelImages = ref([]);
  const generateImages = ref(3);

  const showOverlay = ref(false);
  const overlayImage = ref(null);
  const generatedImages = ref();

  async function refreshModels() {
    models.value = await fetch("http://" + location.host + "/sdapi/v1/sd-models").then(r => r.json());
  }

  async function loadPresets() {
    const response = await fetch("http://" + location.host + "/image-bench/explore_presets");

    if (response.ok && response.headers.get("content-length") > 0) {
      modelPresets = await response.json();
    }
    else
      modelPresets = {};

    lastPreset.value = modelPresets.last_preset || "";
    presetNames.value = modelPresets.presets? Object.keys(modelPresets.presets): [];
    await activatePreset(lastPreset.value);
  }

  async function writePresets() {
    const presets = JSON.stringify(modelPresets);
    await fetch("http://" + location.host + "/image-bench/explore_presets", {method: "post", body: presets});
  }

  onBeforeMount(async () => {
    await refreshModels();
    await loadPresets();
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

    modelImages.value = [];
    window.opener.postMessage({type: "EXPLORE_MODELS", models: selectedModels, generateImages: generateImages.value})
  }

  async function onCreateClick(e) {
    e.preventDefault();

    const presetName = prompt("New preset name: ");

    if (presetName) {
      lastPreset.value = presetName;
      modelPresets.presets = modelPresets.presets || {};
      modelPresets.presets[presetName] = getSelectedModels().map(m => m.sha256);
      modelPresets.last_preset = presetName;

      if (!presetNames.value.some(m => m === presetName))
        presetNames.value.push(presetName);

      await writePresets();
    }
  }

  async function onSaveClick(e) {
    e.preventDefault();

    const presetName = presetSelect.value.value;

    if (presetName) {
      modelPresets.presets = modelPresets.presets || {};
      modelPresets.presets[presetName] = getSelectedModels().map(m => m.sha256);
      modelPresets.last_preset = presetName;
      await writePresets();
    }
    else
      alert("No preset is selected.");
  }

  async function onDeleteClick(e) {
    e.preventDefault();

    if (!confirm("Do you really want to continue?"))
      return;

    const presetName = presetSelect.value.value;
    const nameIndex = presetNames.value.indexOf(presetName);

    presetNames.value.splice(nameIndex, 1);
    delete modelPresets.presets[presetName];

    if (presetNames.value.length) {
      lastPreset.value = presetNames.value[0];
      modelPresets.last_preset = lastPreset.value;
      return activatePreset(lastPreset.value);
    }

    await writePresets();
  }

  function onPresetChange(e) {
    activatePreset(e.target.value)
  }

  function activatePreset(presetName) {
    selected.value = new Set();

    for (let i = 0; i < models.value.length; ++i) {
      if (modelPresets.presets[presetName].some(h => h === models.value[i].sha256)) {
        selected.value.add(i);
      }
    }

    lastPreset.value = presetName;
    modelPresets.last_preset = lastPreset.value;
    return writePresets();
  }

  function onImageClick(image) {
    overlayImage.value = createImageLink(image.imagePath);
    showOverlay.value = true;
  }

  function onSDEvent(e) {
    const gi = generatedImages.value;
    const scrolledToBottom = (gi.clientHeight === gi.scrollHeight) || (gi.scrollHeight - gi.scrollTop === gi.clientHeight);
    let model = modelImages.value.find(m => m.hash === e.pnginfo["model hash"]);
    
    if (!model) {
      model = reactive({name: e.pnginfo["model"], hash: e.pnginfo["model hash"], images: []});
      modelImages.value.push(model);
    }

    const imageData = createImageData(e);
    model.images.push(imageData);

    if (scrolledToBottom)
      setTimeout(() => gi.scrollTop = gi.scrollHeight, 500);
  }

  defineExpose({onSDEvent})
</script>

<template>
  <ImageOverlay v-if="showOverlay" :image="overlayImage"
                @hide-overlay="showOverlay = false"/>
  <div class="wrapper">
    <div class="toolbar">
      <a href="#" class="tool-item" id="explore-selected" @click="onExploreClick">Explore</a>
      <div class="generate-images-container">
        <label>Generate images:&nbsp;<input type="number" class="generate-images" v-model="generateImages"></label>
      </div>
    </div>
    <div class="explore-container">
      <div class="model-list">
        Presets&nbsp;
        <select class="model-presets" ref="presetSelect" @change="onPresetChange">
          <option v-for="name in presetNames" :value="name" :selected="lastPreset === name">{{ name }}</option>
        </select>
        <div class="preset-controls">
          <a class="control-link" href="#" @click="onCreateClick">Create</a
          >&nbsp;<a class="control-link" href="#" @click="onSaveClick">Save</a
          >&nbsp;<a class="control-link" href="#" @click="onDeleteClick">Delete</a>
        </div>
        <div class="models-container">
          <div class="models">
            <div v-for="(model, index) in models">
              <label class="model-label"><input type="checkbox"
                                                @change="e => onModelCheckChange(e, index)" :checked="selected.has(index)"
                                            >&nbsp;{{model.model_name}}</label>
            </div>
          </div>
        </div>
      </div>
      <div class="generated-images-wrapper">
        <div class="generated-images" ref="generatedImages">
          <div class="model-images-wrapper" v-for="model in modelImages">
            <h3 class="model-name">{{ model.name }}</h3>
            <div class="model-images">
              <SelectableImage v-for="image in model.images"
                               :image-path="image.imagePath"
                               :parameters="image.parameters"
                               @image-click="() => onImageClick(image)"></SelectableImage>
            </div>
          </div>
        </div>
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
  width: 280px;
}

.models {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: auto;
}

.model-list {
  margin: 15px 0;
  display: flex;
  flex-direction: column;
  padding-right: 10px;
  border-right: 1px solid white;
}

.model-label {
  white-space: nowrap;
}

.generated-images-wrapper {
  position: relative;
  flex-grow: 1;
}

.generated-images {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  margin: 15px;
}

.control-link {
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: 0.4s;
  padding: 3px;
  font-size: 90%;
}

.model-name {
  font-weight: bold;
}

.model-images {
  display: flex;
  border-bottom: 1px solid white;
}

.generate-images-container {
  display: flex;
}

.generate-images-container label {
  display: flex;
  align-items: center;
}

input.generate-images {
  width: 50px;
}
</style>