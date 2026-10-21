<script setup>
/**
 * Buttons of the prompt history after the prompt label: the pencil is the current prompt, the only editable one,
 * the numbers the prompts generated last (1 is the latest), shown read-only. A double click on a number takes its
 * prompts into the current ones
 */
import AppIcon from "@/components/AppIcon.vue";
import {formatHistoryTime} from "@/stores/promptHistory.js";

defineProps({
  // {prompt, negativePrompt, time}, the latest first
  entries: {
    type: Array,
    required: true
  },
  // Index of the entry shown, null for the current prompt
  selected: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(["select", "use"]);
</script>

<template>
  <span class="prompt-history" role="toolbar" aria-label="Prompt history">
    <button type="button" class="chip current" :class="{on: selected === null}" :aria-pressed="selected === null"
            title="The current prompt (editable)" @click="emit('select', null)"><AppIcon name="pencil" :size="11"/></button>
    <button v-for="(entry, index) in entries" :key="entry.time" type="button" class="chip"
            :class="{on: selected === index}" :aria-pressed="selected === index"
            :title="`Prompt generated ${formatHistoryTime(entry.time)}, compared with the current one; double-click to use it`"
            @click="emit('select', index)" @dblclick="emit('use', index)">{{ index + 1 }}</button>
  </span>
</template>

<style scoped>
.prompt-history {
  display: flex;
  min-width: 0;
  overflow: hidden;
  gap: 2px;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border: 1px solid var(--ib-border);
  border-radius: 3px;
  background: var(--ib-surface);
  color: var(--ib-text-2);
  font-family: var(--ib-mono);
  font-size: 9.5px;
  line-height: 1;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--ib-border-2);
  color: var(--ib-text);
}

.chip.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.chip.current {
  margin-right: 2px;
}
</style>
