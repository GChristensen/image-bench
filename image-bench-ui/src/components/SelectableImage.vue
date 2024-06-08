<script setup>
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {createImageLink} from "@/utils.js";

  const props = defineProps(["imagePath", "parameters", "selectable", "selected", "isTray"]);

  const imageTrayStore = useImageTrayStore();

  function onReuseSeedClick(e) {
    e.preventDefault();

    const parameters = JSON.parse(JSON.stringify(props.parameters))
    window.opener.postMessage({type: "SET_IMAGE_SEED", parameters});
  }

  // currently undocumented
  function onReuseParamsClick(e) {
    e.preventDefault();

    const parameters = JSON.parse(JSON.stringify(props.parameters))
    window.opener.postMessage({type: "SET_IMAGE_PARAMS", parameters});
  }

  function onPlaceToTray(e) {
    e.preventDefault();

    imageTrayStore.addImage({
      imagePath: props.imagePath,
      parameters: props.parameters
    })
  }

  function createTooltip(parameters) {
    let result = "";

    for (const key in parameters) {
      if (key !== "prompt" && key !== "negative" && key !== "version")
        result += key.charAt(0).toUpperCase() + key.slice(1) + ": " + parameters[key] + "\u000d";
    }

    return result;
  }
</script>

<template>
<div class="selectable-image">
  <img class="selectable-image-preview" :src="createImageLink(imagePath)" :title="createTooltip(parameters)"
       @mousedown.left="$emit('imageClick')"
       @mousedown.middle="$emit('imageOpen')">
  <div class="selectable-image-controls">
    <label v-if="selectable"><input class="selectable-emage-checkbox" type="checkbox"
                  @change="$emit('select', $event.target.checked)"
                  :checked="selected"> Select</label>
    <span class="reuse-seed" title="Reuse seed"
          @mousedown.left="onReuseSeedClick"
          @mousedown.middle="onReuseParamsClick">♻️</span>
    <span class="generation-params" title="Generation parameters"
          @mousedown.left="$emit('showParams')">📑</span>
    <a v-if="!isTray" href="#" class="place-to-tray" title="Place to tray" @click="onPlaceToTray">📥</a>
    <span v-if="parameters['hires upscale']" class="upscale-indicator" title="Upscaled">⬆️</span>
  </div>
</div>
</template>

<style scoped>
.selectable-image {
  max-width: 30%;
  max-height: 70vh;
  height: max-content;
  margin: 15px;
}

.selectable-image-preview {
  width: 100%;
  height: 100%;
  max-width: 30vw;
  max-height: 70vh;
  object-fit: contain;
  cursor: pointer;
}

.selectable-image-controls {
  text-align: center;
}

.reuse-seed, .generation-params {
  text-decoration: none;
  cursor: pointer;
}

.upscale-indicator {
  cursor: default;
}
</style>