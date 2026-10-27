<script setup>
/**
 * Controls of a run in a tab toolbar (Generate, Explore): the start button, which turns into Stop while running (and
 * into the alternative label, e.g. Restart, while `altShown`), the controls of the slot (e.g. Skip), the number of
 * images with × resetting it to 1 (then the "after" slot), optionally the count button setting the preset number and ∞ (-1, until stopped),
 * and the progress of the run. The button's own clicks are the view's: it emits them as they come
 */
import {ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import NumberStepper from "@/components/NumberStepper.vue";
import ProgressIndicator from "@/components/ProgressIndicator.vue";

const props = defineProps({
  running: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ""
  },
  // Label shown instead of Stop while running, e.g. {label: "Restart", icon: "refresh"}
  alt: {
    type: Object,
    default: null
  },
  altShown: {
    type: Boolean,
    default: false
  },
  // Classes of the button besides its state (e.g. joined to the project cube)
  buttonClass: {
    type: [String, Object, Array],
    default: null
  },
  // Number of images; null shows no count
  count: {
    type: Number,
    default: null
  },
  countLabel: {
    type: String,
    default: "Images to generate"
  },
  countDisabled: {
    type: Boolean,
    default: false
  },
  // Number set by the count button; null shows no count button
  presetCount: {
    type: Number,
    default: null
  },
  // ∞ sets the count to -1
  forever: {
    type: Boolean,
    default: false
  },
  // {value, label, completed, total} while running, null hides the progress
  progress: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(["click", "auxclick", "update:count"]);

const buttonElement = ref(null);

// -1 images: generate until stopped; ∞ again restores the former number
let finiteCount = props.count > 0 ? props.count : 1;

watch(() => props.count, count => {
  if (count > 0)
    finiteCount = count;
});

function toggleForever() {
  emit("update:count", props.count === -1 ? finiteCount : -1);
}

defineExpose({buttonElement});
</script>

<template>
  <div class="toolbar-group run-control">
    <button ref="buttonElement" class="btn swap" :class="[running ? 'stop' : 'primary', buttonClass]"
            :disabled="disabled" :title="title"
            @click="e => emit('click', e)" @mousedown.middle.prevent @auxclick="e => emit('auxclick', e)">
      <span :class="{off: running}"><AppIcon name="play" :size="13"/>{{ label }}</span>
      <span :class="{off: !running || altShown && !!alt}"><AppIcon name="stop" :size="13"/>Stop</span>
      <span v-if="alt" :class="{off: !running || !altShown}"><AppIcon :name="alt.icon" :size="13"/>{{ alt.label }}</span>
    </button>
    <slot/>
    <template v-if="count !== null">
      <label class="toolbar-group-label"><span class="reset-count" title="Reset to 1 image"
            @click.prevent="emit('update:count', 1)">×</span><NumberStepper :model-value="count"
            :label="countLabel" :disabled="countDisabled" @update:model-value="value => emit('update:count', value)"/></label>
      <button v-if="presetCount !== null" class="btn preset-count" :class="{on: count === presetCount}"
              :disabled="running" :title="`Generate ${presetCount} images (set in the settings)`"
              @click="emit('update:count', presetCount)">{{ presetCount }}</button>
      <button v-if="forever" class="ib" :class="{on: count === -1}" :aria-pressed="count === -1" :disabled="running"
              :title="count === -1 ? 'Generating forever: click to restore the number of images' : 'Generate forever (until stopped)'"
              aria-label="Generate forever" @click="toggleForever"><AppIcon name="infinity" :size="14"/></button>
    </template>
    <slot name="after"/>
  </div>
  <ProgressIndicator v-if="running && progress" :value="progress.value" :label="progress.label ?? ''"
                     :completed="progress.completed || 0" :total="progress.total || 0"/>
</template>

<style scoped>
.preset-count {
  min-width: 26px;
  padding: 0 6px;
  font-family: var(--ib-mono);
  font-size: 12px;
}

.preset-count.on {
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}
</style>
