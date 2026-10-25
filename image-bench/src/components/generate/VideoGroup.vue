<script setup>
/**
 * Video parameters of the Generate tab, a tab beside Sampling: the length in frames and the frame rate of a video
 * workflow (in ComfyUI located by the frames / fps locators of node_config.json)
 */
import {computed} from "vue";
import NumberStepper from "@/components/NumberStepper.vue";

const props = defineProps({
  form: {
    type: Object,
    required: true
  },
  // Frame grid of the model, {step, offset, fps}: lengths of step * k + offset frames (MiniMax H3 17k+5, LTX 8n+1),
  // fps the fixed frame rate of a model without an fps parameter; null if any length goes
  grid: {
    type: Object,
    default: null
  },
  // Feature check (useFeatures)
  has: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['set']);

const step = computed(() => props.grid?.step ?? 1);
const offset = computed(() => props.grid?.offset ?? 0);
const fps = computed(() => Number(props.has('fps') ? props.form.fps : props.grid?.fps) || null);

// Up to the next length of the grid, as the models round
function snap(frames) {
  const value = Math.max(offset.value || 1, Math.round(Number(frames) || 0));
  return Math.ceil((value - offset.value) / step.value) * step.value + offset.value;
}

const seconds = computed(() => fps.value && props.form.frames
  ? `${Number((props.form.frames / fps.value).toFixed(2))} s` : "");
</script>

<template>
  <div class="group">
    <div class="group-header label-small"><slot name="title">Video</slot></div>
    <div class="pair">
      <label class="field">
        <span class="label">Frames<span v-if="seconds" class="hint">{{ seconds }}</span></span>
        <NumberStepper :model-value="form.frames ?? ''" :min="offset || 1" :max="3600" :step="step" label="Frames"
                       @update:model-value="v => emit('set', 'frames', snap(v))"/>
      </label>
      <label v-if="has('fps')" class="field">Frame rate
        <NumberStepper :model-value="form.fps ?? ''" :min="1" :max="120" :step="1" label="Frame rate"
                       @update:model-value="v => emit('set', 'fps', v)"/>
      </label>
    </div>
  </div>
</template>

<style scoped src="./groups.css"></style>

<style scoped>
.label {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.hint {
  color: var(--ib-muted);
}
</style>
