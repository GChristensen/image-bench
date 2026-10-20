<script setup>
/**
 * img2img and inpaint parameters of the Generate tab: denoising strength, and in WebUI the resize mode
 * and the inpaint radio groups (set by their choice labels)
 */
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {withCurrent} from "./choices.js";

defineProps({
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
    <template v-if="has('img2imgOptions')">
      <div class="pair" :class="{off: !inpaintParams}">
        <label class="field">Mask mode
          <span class="select-wrap">
            <select :value="form.maskMode" :disabled="!inpaintParams" @change="e => emit('set', 'maskMode', e.target.value)">
              <option v-for="name in withCurrent(options.maskMode ?? [], form.maskMode)" :key="name"
                      :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
        <label class="field">Inpaint area
          <span class="select-wrap">
            <select :value="form.inpaintArea" :disabled="!inpaintParams" @change="e => emit('set', 'inpaintArea', e.target.value)">
              <option v-for="name in withCurrent(options.inpaintArea ?? [], form.inpaintArea)" :key="name"
                      :value="name">{{ name }}</option>
            </select>
            <AppIcon name="chevron" :size="14"/>
          </span>
        </label>
      </div>
      <label class="field" :class="{off: !inpaintParams}">Masked content
        <span class="select-wrap">
          <select :value="form.maskedContent" :disabled="!inpaintParams" @change="e => emit('set', 'maskedContent', e.target.value)">
            <option v-for="name in withCurrent(options.maskedContent ?? [], form.maskedContent)" :key="name"
                    :value="name">{{ name }}</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </span>
      </label>
    </template>
  </div>
</template>

<style scoped src="./groups.css"></style>
