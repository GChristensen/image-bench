<script setup>
/**
 * Inline stroke icon (Lucide-style); color follows currentColor
 */
import {ICON_PATHS} from "@/components/icons.js";

defineProps({
  name: {
    type: String,
    required: true,
    validator: name => name in ICON_PATHS
  },
  size: {
    type: Number,
    default: 15
  }
});
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
       v-html="ICON_PATHS[name]"></svg>
</template>

<style scoped>
.app-icon {
  flex-shrink: 0;
  display: block;
}
</style>
