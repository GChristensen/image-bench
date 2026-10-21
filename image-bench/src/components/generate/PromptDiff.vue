<script setup>
/**
 * A prompt of the history in the place of its textarea, read-only: compared with the current prompt, what taking it
 * would add (green), remove (struck out) or change (amber, the current text in the tooltip); or plain
 */
import {computed} from "vue";
import {diffPrompts} from "@/promptDiff.js";

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  // The current prompt
  base: {
    type: String,
    default: ""
  },
  plain: {
    type: Boolean,
    default: false
  }
});

const segments = computed(() => props.plain ? [{type: "same", text: props.text, sep: ""}]
                                            : diffPrompts(props.text, props.base));
</script>

<template>
  <div class="prompt-diff" :class="{plain}" aria-readonly="true"><template v-for="(segment, index) in segments" :key="index"><span
      v-if="segment.type === 'same'">{{ segment.text }}</span><span v-else :class="segment.type"
      :title="segment.type === 'changed' ? `Current: ${segment.base}` : null">{{ segment.text }}</span><span
      :class="{removed: segment.type === 'removed'}">{{ segment.sep }}</span></template></div>
</template>

<style scoped>
.prompt-diff {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  border: 1px dashed var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-elev);
  color: var(--ib-text-2);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: default;
}

.added {
  border-radius: 3px;
  background: rgba(63, 185, 80, 0.2);
  color: #7ee787;
}

.removed {
  color: var(--ib-danger-text);
  text-decoration: line-through;
  opacity: 0.75;
}

.changed {
  border-radius: 3px;
  background: rgba(240, 164, 49, 0.18);
  color: var(--ib-warn);
}
</style>
