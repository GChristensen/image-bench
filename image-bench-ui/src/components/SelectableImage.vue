<script setup>
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {createImageLink, isImg2Img, sendWebUIMessage} from "@/sdwebui.js";
  import {animateColors} from "@/utils_html.js";

  const props = defineProps(["image", "selectable", "selected", "isTray"]);

  const imageTrayStore = useImageTrayStore();

  function onReuseSeedClick(e) {
    e.preventDefault();

    const parameters = JSON.parse(JSON.stringify(props.image.parameters))
    sendWebUIMessage({type: "SET_IMAGE_SEED", parameters});
  }

  // currently undocumented
  function onReuseParamsClick(e) {
    e.preventDefault();

    const parameters = JSON.parse(JSON.stringify(props.image.parameters))
    sendWebUIMessage({type: "SET_IMAGE_PARAMS", parameters});
  }

  function onPlaceToTray(e) {
    e.preventDefault();

    imageTrayStore.addImage(props.image);

    const trayTabElement = document.getElementById("image-tray-tab");
    animateColors(trayTabElement, 0.7);
  }

  function createTooltip(parameters) {
    let result = "";

    for (const key in parameters) {
      if (key !== "prompt" && key !== "negative" && key !== "version")
        result += key.charAt(0).toUpperCase() + key.slice(1) + ": " + parameters[key] + "\u000d";
    }

    return result;
  }

  function onGenerateVaryingSteps(e) {
    let storedSteps = localStorage.getItem("imageBench_varyingSteps");

    if (!storedSteps)
      storedSteps = "24, 26, 28, 30, 32";

    const steps = prompt("Use step values:", storedSteps);
    if (steps) {
      localStorage.setItem("imageBench_varyingSteps", steps);
      const image = JSON.parse(JSON.stringify(props.image))
      sendWebUIMessage({type: "GENERATE_VARYING_STEPS", image, steps});
    }
  }

  function onUpscaleVaryingDenoising(e) {
    let storedSteps = localStorage.getItem("imageBench_varyingDenoising");

    if (!storedSteps)
      storedSteps = "0.42, 0.46, 0.5, 0.54, 0.6";

    const denoising = prompt("Use denoising values:", storedSteps);
    if (denoising) {
      localStorage.setItem("imageBench_varyingDenoising", denoising);
      const image = JSON.parse(JSON.stringify(props.image))
      sendWebUIMessage({type: "UPSCALE_VARYING_DENOISING", image, denoising: denoising});
    }
  }
</script>

<template>
<div class="selectable-image">
  <img v-if="!image.separator"
       class="selectable-image-preview"
       :src="createImageLink(image.imagePath)"
       :title="createTooltip(image.parameters)"
       @mousedown.left="$emit('imageClick')"
       @mousedown.middle="$emit('imageOpen')">
  <div class="image-separator" v-if="image.separator">🏁</div>
  <div  v-if="!image.separator" class="selectable-image-controls">
    <label v-if="selectable" class="select-label"><input class="selectable-emage-checkbox" type="checkbox"
                  @change="$emit('select', $event.target.checked)"
                  :checked="selected"> Select&nbsp;</label>
    <div class="control-buttons" v-if="!isImg2Img(image.imagePath)">
      <span class="reuse-seed" title="Left: reuse seed, Middle: reuse all parameters"
            @mousedown.left="onReuseSeedClick"
            @mousedown.middle="onReuseParamsClick">♻️</span>
      <span class="generation-params" title="Generation parameters"
            @mousedown.left="$emit('showParams')">📑</span>
      <span v-if="isTray" class="generate-steps" title="Generate with steps"
            @mousedown.left="onGenerateVaryingSteps">📶</span>
      <span v-if="isTray" class="upscale" title="Upscale" @mousedown.left="$emit('upscaleImage', image)">🏞️</span>
      <span v-if="isTray" class="upscale-denoising" title="Upscale with denoising"
            @mousedown.left="onUpscaleVaryingDenoising">📉</span>
      <a v-if="!isTray" href="#" class="place-to-tray" title="Place to tray" @click="onPlaceToTray">📥</a>
      <span v-if="image.setSteps" class="steps-indicator" :title="`Upscale with ${image.parameters['steps']} steps`">🐾</span>
      <span v-if="image.parameters['hires upscale']" class="upscale-indicator" title="Upscaled">⬆️</span>
      <span v-if="isTray" class="delete" title="Delete"
            @mousedown.left="$emit('deleteImage', image)">🗑️</span>
    </div>
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
  max-width: 27vw;
  max-height: 70vh;
  object-fit: contain;
  cursor: pointer;
}

.control-buttons {
  display: inline-block;
}

.selectable-image-controls {
  text-align: center;
  color: initial;
}

.select-label {
  color: var(--color-text);
}

.reuse-seed, .generation-params, .generate-steps, .upscale-denoising, .delete, .upscale {
  text-decoration: none;
  cursor: pointer;
}

.upscale-indicator, .steps-indicator {
  cursor: default;
}

.image-separator {
}
</style>