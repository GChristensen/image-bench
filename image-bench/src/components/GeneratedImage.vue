<script setup>
  import {nextTick, ref, watch} from "vue";
  import {useImageTrayStore} from "@/stores/imageTray.js";
  import {animateColors} from "@/utils_html.js";
  import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
  import {useAppConfigStore} from "@/stores/appConfig.js";
  import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
  import {useUpscaledImagesStore} from "@/stores/upscaled.js";
  import {flashTrayTab} from "@/components/utils.js";
  import {useConceptTrayStore} from "@/stores/conceptTray.js";
  import {KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, MARKINGS} from "@/consts.js";
  import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
  import {useImageOperations} from "@/composables/useImageOperations.js";
  import {useLocalStorage} from "@/composables/useLocalStorage.js";
  import {usePromptModal} from "@/composables/usePromptModal.js";
  import PromptModal from "@/components/PromptModal.vue";
  import AppIcon from "@/components/AppIcon.vue";

  const emit = defineEmits(['setMarking', 'filterMarking', 'imageClick', 'imageOpen', 'showParams', 
    'select', 'upscaleImage', 'addComment', 'deleteImage']);

  const props = defineProps({
    isTray: {
      type: Boolean,
      required: true
    },
    kind: {
      type: String,
      required: true,
      validator: (value) => ['generated', 'image-tray', 'concept-tray', 'upscaled', 'explore'].includes(value)
    },
    image: {
      type: Object,
      required: true
    },
    selectable: {
      type: Boolean,
      default: false
    },
    displayed: {
      type: Boolean,
      default: true
    },
    upscalable: {
      type: Boolean,
      default: false
    },
    selected: {
      type: Boolean,
      default: false
    },
    highlighted: {
      type: Boolean,
      default: false
    }
  });

  const rootElement = ref(null);

  // Bring the thumbnail into view when it gets highlighted (e.g. after its preview overlay is closed)
  watch(() => props.highlighted, async (highlighted) => {
    if (highlighted) {
      await nextTick();
      rootElement.value?.scrollIntoView({block: "nearest", inline: "nearest"});
    }
  });

  const config = useAppConfigStore();
  const imageTrayStore = useImageTrayStore();
  const conceptTrayStore = useConceptTrayStore();
  const sdWebUIStore = useSDWebUIStateStore();
  const generatedImagesStore = useGeneratedImagesStore();
  const upscaledImageStore = useUpscaledImagesStore();

  // Composables
  const webUI = useWebUIBridge();
  const imageOps = useImageOperations();
  const storage = useLocalStorage();
  const promptModal = usePromptModal();

  function onReuseSeedClick(e) {
    e.preventDefault();

    const parameters = imageOps.cloneImage(props.image).parameters;
    webUI.setImageSeed(parameters);
  }

  // currently undocumented
  function onReuseParamsClick(e) {
    e.preventDefault();

    const parameters = imageOps.cloneImage(props.image).parameters;
    webUI.setImageParams(parameters);
  }

  function onPlaceToTray(e) {
    e.preventDefault();

    imageTrayStore.addImage(props.image);

    flashTrayTab("image-tray-tab");
  }

  function onPlaceToConceptTray(e) {
    e.preventDefault();

    conceptTrayStore.addImage(props.image);

    flashTrayTab("concept-tray-tab");
  }


  async function onGenerateVaryingSteps(e) {
    const storedSteps = storage.getVaryingSteps();
    const steps = await promptModal.showPrompt(
      "Apply step values:",
      storedSteps,
      "varyingSteps"
    );

    if (steps) {
      if (config.automaticallyClearGeneratedImages)
        generatedImagesStore.clear();

      generatedImagesStore.startingGeneration();

      storage.setVaryingSteps(steps);
      const image = imageOps.cloneImage(props.image);
      webUI.generateVaryingSteps(image, steps);
    }
  }

  async function onUpscaleVaryingDenoising(e) {
    const storedSteps = storage.getVaryingDenoising();
    const denoising = await promptModal.showPrompt(
      "Apply denoising values:",
      storedSteps,
      "varyingDenoising"
    );

    if (denoising) {
      if (config.automaticallyClearGeneratedImages)
        upscaledImageStore.clear();

      upscaledImageStore.startingGeneration();

      storage.setVaryingDenoising(denoising);
      const image = imageOps.cloneImage(props.image);
      webUI.upscaleVaryingDenoising(image, denoising);
    }
  }

  // The Photoshop plugin connects to WebUI only
  const canSendToPhotoshop = import.meta.env.MODE !== "comfy";

  async function onSendToPhotoshop(e) {
    e.preventDefault();

    const error = await imageOps.sendToPhotoshop(props.image);

    if (error)
      alert(error);
  }

  function needShowPromptWarning(image) {
    return import.meta.env.webui
        && (image.parameters["prompt"] != sdWebUIStore.prompt
        || image.parameters["negative prompt"] != sdWebUIStore.negativePrompt);
  }

  function getUpscaleButtonTitle(image) {
    let result = "Left: " + "upscale";

    if (image.setSteps)
      result += ` using ${image.parameters['steps']} sampling steps`;
    else
      result += ' using WebUI settings';

    if (!image.setSteps)
      result += ", Middle: upscale using image tray preset";

    return result;
  }

  function onSelectMarkingClick(e) {
    props.image.marking = e.target.textContent;
    emit("setMarking");
  }

  function onRemoveMarking(e) {
    delete props.image.marking;
    emit("setMarking");
  }

</script>

<template>
<PromptModal
  :show="promptModal.showModal.value"
  :message="promptModal.modalMessage.value"
  :default-value="promptModal.modalDefaultValue.value"
  :storage-key="promptModal.modalStorageKey.value"
  @confirm="promptModal.onConfirm"
  @cancel="promptModal.onCancel"
/>
<div v-if="displayed" ref="rootElement" class="selectable-image" :class="{selected, highlighted}">
  <div class="image-separator" v-if="image.separator">◇</div>
  <div v-else class="image-frame">
    <img class="selectable-image-preview"
         :src="imageOps.getImageLink(image)"
         :title="imageOps.createImageTooltip(image)"
         @mousedown.left="$emit('imageClick')"
         @mousedown.middle="$emit('imageOpen')">

    <span v-if="image.tagColor" class="tag-bar" :style="{background: image.tagColor}"></span>

    <label v-if="selectable" class="select-box" title="Select">
      <input type="checkbox" aria-label="Select image" :checked="selected"
             @change="$emit('select', $event.target.checked)">
      <span class="select-circle"><AppIcon name="check" :size="12"/></span>
    </label>

    <!-- One shared row, so the left group wraps only when the whole width runs out -->
    <div class="image-actions-bar" :class="{selectable}">
    <div class="image-actions left">
      <button v-if="!image.img2img" class="ib sm" title="Left: reuse seed, Middle: reuse all parameters" aria-label="Reuse seed"
              @mousedown.left="onReuseSeedClick" @mousedown.middle="onReuseParamsClick"><AppIcon name="seed" :size="13"/></button>
      <button class="ib sm" title="Generation parameters" aria-label="Generation parameters"
              @mousedown.left="$emit('showParams')"><AppIcon name="params" :size="13"/></button>
      <button v-if="isTray && !image.img2img" class="ib sm" title="Generate with steps" aria-label="Generate with steps"
              @mousedown.left="onGenerateVaryingSteps"><AppIcon name="steps" :size="13"/></button>
      <button v-if="upscalable && !image.img2img" class="ib sm" :title="getUpscaleButtonTitle(image)" aria-label="Upscale"
              @mousedown.left="$emit('upscaleImage', image, false)"
              @mousedown.middle="$emit('upscaleImage', image, true)"><AppIcon name="upscale" :size="13"/></button>
      <button v-if="isTray && !image.img2img" class="ib sm" title="Upscale with denoising" aria-label="Upscale with denoising"
              @mousedown.left="onUpscaleVaryingDenoising"><AppIcon name="denoise" :size="13"/></button>
      <button v-if="canSendToPhotoshop" class="ib sm" title="Send to Photoshop" aria-label="Send to Photoshop"
              @mousedown.left="onSendToPhotoshop"><AppIcon name="external" :size="13"/></button>
      <button v-if="isTray" class="ib sm" title="Add comment" aria-label="Add comment"
              @click="$emit('addComment', image)"><AppIcon name="comment" :size="13"/></button>
      <button v-if="isTray" class="ib sm danger" title="Delete" aria-label="Delete"
              @mousedown.left="$emit('deleteImage', image)"><AppIcon name="trash" :size="13"/></button>
    </div>

    <!-- Tray buttons stay top-right, the rest go top-left -->
    <div class="image-actions right">
      <button v-if="!isTray || kind === KIND_IMAGE_TRAY" class="ib sm" title="Place to concept tray" aria-label="Place to concept tray"
              @click="onPlaceToConceptTray"><AppIcon name="concept" :size="13"/></button>
      <button v-if="!isTray || kind === KIND_CONCEPT_TRAY" class="ib sm" title="Place to image tray" aria-label="Place to image tray"
              @click="onPlaceToTray"><AppIcon name="palette" :size="13"/></button>
    </div>
    </div>

    <div class="image-badges">
      <span v-if="image.parameters['hires upscale']" class="badge hr" title="Upscaled">HR</span>
      <span v-if="image.img2img" class="badge i2i" title="Img2Img image">I2I</span>
      <span v-if="image.setSteps" class="badge steps" :title="`Upscaled with ${image.parameters['steps']} sampling steps`">{{ image.parameters['steps'] }} st</span>
      <span v-if="needShowPromptWarning(image)" class="badge warn" title="Image prompt and Txt2Img prompt do not match"
        ><AppIcon name="alert" :size="11"/></span>
    </div>

    <span v-if="image.marking" class="image-marking" title="Left: remove marking, Middle: filter by"
          @mousedown.left="onRemoveMarking"
          @mousedown.middle="$emit('filterMarking', image.marking)">{{ image.marking }}</span>

    <div v-if="isTray" class="markings">
      <span v-for="marking in MARKINGS" :key="marking" class="marking" @click="onSelectMarkingClick">{{ marking }}</span>
    </div>
  </div>
</div>
</template>

<style scoped>
/* The width cap lives here only: a percentage max-width on the img is ignored when sizing
   this flex item, so a separate vw cap there would leave the frame wider than the image */
.selectable-image {
  max-width: min(30%, 27vw);
  height: max-content;
}

.image-frame {
  position: relative;
  display: inline-block;
  vertical-align: top;
  line-height: 0;
  border-radius: 4px;
  overflow: hidden;
}

.selectable-image.selected .image-frame {
  box-shadow: 0 0 0 2px var(--ib-accent);
}

.selectable-image.highlighted .image-frame {
  outline: 2px solid transparent;
  outline-offset: 2px;
  animation: highlightFade 2.5s ease-in forwards;
}

@keyframes highlightFade {
  0%, 40% { outline-color: var(--ib-info); }
  100%    { outline-color: transparent; }
}

.selectable-image-preview {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 70vh;
  cursor: pointer;
}

.tag-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
}

/* Circular outline check: deliberately unlike the square filled action buttons */
.select-box {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: normal;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.select-box input {
  position: absolute;
  width: 0;
  height: 0;
  margin: 0;
  opacity: 0;
}

.select-circle {
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.5);
  color: transparent;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.select-box:hover .select-circle {
  border-color: #fff;
  transform: scale(1.1);
}

.selectable-image.selected .select-circle {
  background: var(--ib-accent);
  border-color: var(--ib-accent);
  color: #fff;
}

.select-box input:focus-visible + .select-circle {
  outline: 2px solid var(--ib-accent);
  outline-offset: 2px;
}

.selectable-image.selected .select-box,
.image-frame:hover .select-box {
  opacity: 1;
}

/* The bar itself never takes clicks, so gaps between the groups fall through to the image */
.image-actions-bar {
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  align-items: flex-start;
  gap: 3px;
  line-height: normal;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

/* Leave room for the select checkbox */
.image-actions-bar.selectable {
  left: 40px;
}

.image-actions {
  display: flex;
  gap: 3px;
}

.image-actions.left {
  flex: 0 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.image-actions.right {
  flex: none;
  margin-left: auto;
}

.image-frame:hover .image-actions-bar {
  opacity: 1;
}

.image-frame:hover .image-actions {
  pointer-events: auto;
}

.image-actions .ib {
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.image-actions .ib:hover {
  background: var(--ib-elev-2);
  border-color: var(--ib-border-2);
  color: #fff;
}

.image-badges {
  position: absolute;
  left: 6px;
  bottom: 7px;
  display: flex;
  gap: 3px;
  line-height: normal;
  transition: opacity 0.15s;
}

.image-badges .badge {
  cursor: default;
}

.image-frame:hover .image-badges {
  opacity: 0;
}

.image-marking {
  position: absolute;
  right: 6px;
  bottom: 7px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  font-size: 14px;
  line-height: normal;
  cursor: pointer;
}

.markings {
  position: absolute;
  bottom: 7px;
  left: 50%;
  transform: translate(-50%, 0);
  display: none;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  line-height: normal;
  white-space: nowrap;
}

.image-frame:hover .markings {
  display: block;
  animation: fadeIn 0.2s both ease-in;
}

.marking {
  cursor: pointer;
  padding: 0 1px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.image-separator {
  color: var(--ib-muted);
  font-size: 120%;
  font-weight: bold;
}
</style>
