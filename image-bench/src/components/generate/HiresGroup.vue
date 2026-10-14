<script setup>
/**
 * Hires. fix parameters of txt2img in the Generate tab (in ComfyUI the second sampler, marked ib:smp:1),
 * with the Hires. fix checkbox in the header (in ComfyUI the switch marked ib:hr; without it the pass always runs)
 */
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import {withCurrent} from "./choices.js";

defineProps({
  form: {
    type: Object,
    required: true
  },
  upscalers: {
    type: Array,
    required: true
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
  <div class="group" :class="{off: has('hiresFix') && form.hiresFix === false}">
    <label v-if="has('hiresFix')" class="group-header label-small toggle">
      <input type="checkbox" :checked="!!form.hiresFix" @change="e => emit('set', 'hiresFix', e.target.checked)">
      Hires. fix
    </label>
    <div v-else class="group-header label-small">Hires. fix</div>
    <label v-if="has('hiresUpscaler')" class="field">Upscaler
      <span class="select-wrap">
        <select :value="form.hiresUpscaler" @change="e => emit('set', 'hiresUpscaler', e.target.value)">
          <option v-for="name in withCurrent(upscalers, form.hiresUpscaler)" :key="name"
                  :value="name">{{ name }}</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </span>
    </label>
    <div class="pair">
      <label v-if="has('hiresScale')" class="field">Upscale by
        <NumberStepper :model-value="form.hiresScale ?? ''" :min="1" :max="4" :step="0.05" label="Upscale by"
                       @update:model-value="v => emit('set', 'hiresScale', v)"/>
      </label>
      <label v-if="has('hiresSteps')" class="field">Steps
        <NumberStepper :model-value="form.hiresSteps ?? ''" :min="0" :max="150" label="Hires steps"
                       @update:model-value="v => emit('set', 'hiresSteps', v)"/>
      </label>
    </div>
    <label v-if="has('denoising')" class="field">Denoising strength
      <NumberStepper :model-value="form.denoising ?? ''" :min="0" :max="1" :step="0.01"
                     label="Denoising strength" @update:model-value="v => emit('set', 'denoising', v)"/>
    </label>
  </div>
</template>

<style scoped src="./groups.css"></style>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.toggle input {
  margin: 0;
}

/* Parameters of a switched off Hires. fix stay editable, dimmed */
.group.off > .field,
.group.off > .pair {
  opacity: 0.45;
}
</style>
