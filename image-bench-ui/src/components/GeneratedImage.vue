<script setup>
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {createImageLink, isImg2Img, sendWebUIMessage} from "@/sdwebui.js";
  import {animateColors} from "@/utils_html.js";
  import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
  import {useAppConfigStore} from "@/stores/appConfig.js";
  import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
  import {useUpscaledImagesStore} from "@/stores/upscaled.js";
  import {useConfigPresetsStore} from "@/stores/configPresets.js";
  import {flashTrayTab} from "@/components/utils.js";

  const emit = defineEmits(["setMarking", "filterMarking"])
  const props = defineProps(["isTray", "image", "selectable", "displayed", "upscalable", "selected"]);

  const config = useAppConfigStore();
  const imageTrayStore = useImageTrayStore();
  const sdWebUIStore = useSDWebUIStateStore();
  const generatedImagesStore = useGeneratedImagesStore();
  const upscaledImageStore = useUpscaledImagesStore();

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

    flashTrayTab();
  }

  function createTooltip(image) {
    let result = "";

    if (image.comment)
      result += "💬 " + image.comment +"\u000d\u000d";

    for (const key in image.parameters) {
      if (key !== "prompt" && key !== "negative prompt" && key !== "version") {
        let value = image.parameters[key];

        if (typeof value === "object")
          continue;

        result += key.charAt(0).toUpperCase() + key.slice(1) + ": " + value +"\u000d";
      }
    }

    return result;
  }

  function onGenerateVaryingSteps(e) {
    let storedSteps = localStorage.getItem("imageBench_varyingSteps");

    if (!storedSteps)
      storedSteps = "24, 26, 28, 30, 32";

    const steps = prompt("Apply step values:", storedSteps);
    if (steps) {
      if (config.automaticallyClearGeneratedImages)
        generatedImagesStore.clear();

      generatedImagesStore.startingGeneration();

      localStorage.setItem("imageBench_varyingSteps", steps);
      const image = JSON.parse(JSON.stringify(props.image))
      sendWebUIMessage({type: "GENERATE_VARYING_STEPS", image, steps});
    }
  }

  function onUpscaleVaryingDenoising(e) {
    let storedSteps = localStorage.getItem("imageBench_varyingDenoising");

    if (!storedSteps)
      storedSteps = "0.42, 0.46, 0.5, 0.54, 0.6";

    const denoising = prompt("Apply denoising values:", storedSteps);
    if (denoising) {
      if (config.automaticallyClearGeneratedImages)
        upscaledImageStore.clear();

      upscaledImageStore.startingGeneration();

      localStorage.setItem("imageBench_varyingDenoising", denoising);
      const image = JSON.parse(JSON.stringify(props.image))
      sendWebUIMessage({type: "UPSCALE_VARYING_DENOISING", image, denoising: denoising});
    }
  }

  function needShowPromptWarning(image) {
    return image.parameters["prompt"] != sdWebUIStore.prompt
        || image.parameters["negative prompt"] != sdWebUIStore.negativePrompt;
  }

  function getUpscaleButtonTitle(image) {
    let result = "Left: " + "upscale";

    if (image.setSteps)
      result += ` using ${image.parameters['steps']} sampling steps`;
    else if (props.isTray)
      result += ' using WebUI settings';

    if (!image.setSteps)
      result += ", Middle: upscale using tray preset";

    return result;
  }

  function onImageMouseEnter(e) {
    const markings = e.target.querySelector(".markings");
    if (markings)
      markings.style.display = "block";
  }

  function onImageMouseLeave(e) {
    const markings = e.target.querySelector(".markings");
    if (markings)
      markings.style.display = "none";
  }

  function onSelectMarkingClick(e) {
    props.image.marking = e.target.textContent;
    emit("setMarking");
  }

  function onRemoveMarking(e) {
    delete props.image.marking;
    emit("setMarking");
  }

  function getTagStyle(image) {
    if (image.tagColor) {
      return {
        'border-right': `4px solid ${image.tagColor}`
      };
    }
  }
</script>

<template>
<div v-if="displayed" class="selectable-image">
  <div class="image-wrapper"
       @mouseenter="onImageMouseEnter"
       @mouseleave="onImageMouseLeave">
    <img v-if="!image.separator"
         :style="getTagStyle(image)"
         class="selectable-image-preview"
         :src="createImageLink(image)"
         :title="createTooltip(image)"
         @mousedown.left="$emit('imageClick')"
         @mousedown.middle="$emit('imageOpen')">
    <div v-if="isTray" class="markings fadeIn">
      <span class="marking" @click="onSelectMarkingClick">👍</span>
      <span class="marking" @click="onSelectMarkingClick">👎</span>
      <span class="marking" @click="onSelectMarkingClick">🔴</span>
      <span class="marking" @click="onSelectMarkingClick">🟠</span>
      <span class="marking" @click="onSelectMarkingClick">🟡</span>
      <span class="marking" @click="onSelectMarkingClick">🟢</span>
      <span class="marking" @click="onSelectMarkingClick">🔵</span>
      <span class="marking" @click="onSelectMarkingClick">🟣</span>
    </div>
  </div>
  <div class="image-separator" v-if="image.separator">◇</div>
  <div  v-if="!image.separator" class="selectable-image-controls"><!--
      --><span v-if="image.marking" class="image-marking" title="Left: remove marking, Middle: fiter by"
               @mousedown.left="onRemoveMarking"
               @mousedown.middle="$emit('filterMarking', image.marking)">{{image.marking}}&nbsp;</span><!--
      --><label v-if="selectable" class="select-label"><input class="selectable-emage-checkbox" type="checkbox"
                  @change="$emit('select', $event.target.checked)" title="Select"
                  :checked="selected">&nbsp;</label>
    <div class="control-buttons">
      <span v-if="!image.img2img" class="reuse-seed" title="Left: reuse seed, Middle: reuse all parameters"
            @mousedown.left="onReuseSeedClick"
            @mousedown.middle="onReuseParamsClick">♻️</span>
      <span class="generation-params" title="Generation parameters"
            @mousedown.left="$emit('showParams')">📑</span>
      <span v-if="isTray && !image.img2img" class="generate-steps" title="Generate with steps"
            @mousedown.left="onGenerateVaryingSteps">📶</span>
      <span v-if="upscalable && !image.img2img" class="upscale" :title="getUpscaleButtonTitle(image)"
            @mousedown.left="$emit('upscaleImage', image, false)"
            @mousedown.middle="$emit('upscaleImage', image, true)">🏞️</span>
      <span v-if="isTray && !image.img2img" class="upscale-denoising" title="Upscale with denoising"
            @mousedown.left="onUpscaleVaryingDenoising">📉</span>
      <span v-if="!isTray" class="place-to-tray" title="Place to tray" @click="onPlaceToTray">📥</span>
      <span v-if="isTray" class="add-comment" title="Add comment" @click="$emit('addComment', image)">💬</span>
      <span v-if="isTray" class="delete" title="Delete" @mousedown.left="$emit('deleteImage', image)">🗑️</span><!--
      -->&nbsp;<!--
      --><span v-if="image.parameters['hires upscale']" class="upscale-indicator" title="Upscaled">⬆️</span>
      <span v-if="image.img2img" class="img2img-indicator" title="Img2Img image">🖼️</span>
      <span v-if="image.setSteps" class="upscale-steps" :title="`Upscaled with ${image.parameters['steps']} sampling steps`">🐾</span>
      <span v-if="needShowPromptWarning(image)" class="prompt-warning" title="Image prompt and Txt2Img prompt do not match">⚠️️</span>
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

.reuse-seed, .generation-params, .generate-steps, .upscale-denoising, .delete, .upscale, .place-to-tray, .add-comment {
  text-decoration: none;
  cursor: pointer;
}

.upscale-indicator, .upscale-steps, .prompt-warning, .img2img-indicator {
  cursor: default;
}

.upscale-steps {
  color: transparent;
  text-shadow: 0 0 0 #57ff00;
  font-size: 90%;
}

.image-wrapper {
  position: relative;
}

.markings {
  position: absolute;
  bottom: 5px;
  left: 50%;
  transform: translate(-50%, 0);
  color: initial;
  display: none;
}

.marking, .image-marking {
  cursor: pointer;
}

@keyframes fadeIn {
  from    { opacity: 0; }
  to      { opacity: 1; }
}

.fadeIn {
  animation: fadeIn 0.2s both ease-in;
}

.image-separator {
  color: white;
  font-size: 120%;
  font-weight: bold;
}

</style>