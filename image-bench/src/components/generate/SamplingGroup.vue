<script setup>
/**
 * Sampling parameters of the Generate tab: sampling method, schedule type, CFG scale and Shift / Distilled CFG
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
  samplers: {
    type: Array,
    required: true
  },
  schedulers: {
    type: Array,
    required: true
  },
  // What the shift field controls: "shift", "distilledCfg" or null if the model does not use it
  sliderKind: {
    type: String,
    default: null
  },
  // Feature check (useFeatures)
  has: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['set']);

const shiftLabel = computed(() => props.sliderKind === "distilledCfg" ? "Distilled CFG" : "Shift");
</script>

<template>
  <div class="group">
    <div class="group-header label-small">Sampling</div>
    <label v-if="has('sampler')" class="field">Sampling method
      <span class="select-wrap">
        <select :value="form.sampler" @change="e => emit('set', 'sampler', e.target.value)">
          <option v-for="name in withCurrent(samplers, form.sampler)" :key="name" :value="name">{{ name }}</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </span>
    </label>
    <label v-if="has('scheduler')" class="field">Schedule type
      <span class="select-wrap">
        <select :value="form.scheduler" @change="e => emit('set', 'scheduler', e.target.value)">
          <option v-for="name in withCurrent(schedulers, form.scheduler)" :key="name" :value="name">{{ name }}</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </span>
    </label>
    <div class="pair">
      <label v-if="has('cfg')" class="field">CFG scale
        <NumberStepper :model-value="form.cfg ?? ''" :min="1" :max="30" :step="0.5" label="CFG scale"
                       @update:model-value="v => emit('set', 'cfg', v)"/>
      </label>
      <label v-if="has('shift')" class="field" :class="{off: !sliderKind}"
             :title="sliderKind ? '' : 'Not used by the current UI preset'">{{ shiftLabel }}
        <NumberStepper :model-value="form.shift ?? ''" :min="0" :max="30" :step="0.1" :label="shiftLabel"
                       @update:model-value="v => emit('set', 'shift', v)"/>
      </label>
    </div>
  </div>
</template>

<style scoped src="./groups.css"></style>
