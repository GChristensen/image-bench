<script setup>
/**
 * img2img and inpaint parameters of the Generate tab: denoising strength, the inpaint options (mask mode, inpaint
 * area, mask blur, only masked padding; in ComfyUI those of the Inpaint Crop node the workflow has) and in WebUI the
 * resize mode and the masked content. Radio groups are set by their choice labels
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {withCurrent} from "./choices.js";

const props = defineProps({
  form: {
    type: Object,
    required: true
  },
  // Radio choices: resizeMode, maskMode, inpaintArea, maskedContent
  options: {
    type: Object,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  // Inpaint upload, or another img2img mode tab chosen in WebUI
  inpaintParams: {
    type: Boolean,
    default: false
  },
  // Feature check (useFeatures)
  has: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['set']);

// The padding applies only to the masked area
const paddingOff = computed(() => !props.inpaintParams || props.form.inpaintArea === "Whole picture");
</script>

<template>
  <div class="group">
    <!-- Tabs in place of the title (ControlNet in the same place) -->
    <div class="group-header label-small"><slot name="title">{{ title }}</slot></div>
    <div class="pair">
      <label v-if="has('denoising')" class="field">Denoising strength
        <NumberStepper :model-value="form.denoising ?? ''" :min="0" :max="1" :step="0.01"
                       label="Denoising strength" @update:model-value="v => emit('set', 'denoising', v)"/>
      </label>
      <label v-if="has('img2imgOptions')" class="field">Resize mode
        <span class="select-wrap">
          <select :value="form.resizeMode" @change="e => emit('set', 'resizeMode', e.target.value)">
            <option v-for="name in withCurrent(options.resizeMode ?? [], form.resizeMode)" :key="name"
                    :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </span>
      </label>
    </div>
    <div v-if="has('img2imgOptions') || has('maskMode') || has('inpaintArea')" class="pair"
         :class="{off: !inpaintParams}">
      <label v-if="has('img2imgOptions')" class="field">Masked content
        <span class="select-wrap">
          <select :value="form.maskedContent" :disabled="!inpaintParams" @change="e => emit('set', 'maskedContent', e.target.value)">
            <option v-for="name in withCurrent(options.maskedContent ?? [], form.maskedContent)" :key="name"
                    :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </span>
      </label>
      <label v-if="has('maskMode')" class="field">Mask mode
        <span class="select-wrap">
          <select :value="form.maskMode" :disabled="!inpaintParams" @change="e => emit('set', 'maskMode', e.target.value)">
            <option v-for="name in withCurrent(options.maskMode ?? [], form.maskMode)" :key="name"
                    :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </span>
      </label>
      <label v-if="has('inpaintArea')" class="field">Inpaint area
        <span class="select-wrap">
          <select :value="form.inpaintArea" :disabled="!inpaintParams" @change="e => emit('set', 'inpaintArea', e.target.value)">
            <option v-for="name in withCurrent(options.inpaintArea ?? [], form.inpaintArea)" :key="name"
                    :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </span>
      </label>
    </div>
    <div v-if="has('maskBlur') || has('inpaintPadding')" class="pair">
      <label v-if="has('maskBlur')" class="field" :class="{off: !inpaintParams}">Mask blur
        <NumberStepper :model-value="form.maskBlur ?? ''" :min="0" :max="64" :step="1" :disabled="!inpaintParams"
                       label="Mask blur" @update:model-value="v => emit('set', 'maskBlur', v)"/>
      </label>
      <label v-if="has('inpaintPadding')" class="field" :class="{off: paddingOff}"
             title="Only masked padding, pixels">Padding
        <NumberStepper :model-value="form.inpaintPadding ?? ''" :min="0" :max="256" :step="4" :disabled="paddingOff"
                       label="Only masked padding, pixels" @update:model-value="v => emit('set', 'inpaintPadding', v)"/>
      </label>
    </div>
  </div>
</template>

<style scoped src="./groups.css"></style>
