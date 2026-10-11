<script setup>
/**
 * Seed field with buttons for a random seed (-1) and for reusing the seed of the last image
 */
import AppIcon from "@/components/AppIcon.vue";

const model = defineModel({type: [Number, String], default: -1});

defineProps({
  label: {
    type: String,
    default: "Seed"
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['reuse']);
</script>

<template>
  <div class="seed-input">
    <input type="text" inputmode="numeric" :aria-label="label" :disabled="disabled"
           :value="model" @change="e => model = e.target.value.trim() || -1">
    <button class="ib" :disabled="disabled" :title="`Random ${label.toLowerCase()} (-1)`"
            :aria-label="`Random ${label.toLowerCase()}`" @click="model = -1"><AppIcon name="dice"/></button>
    <button class="ib" :disabled="disabled" :title="`Reuse the ${label.toLowerCase()} of the last image`"
            :aria-label="`Reuse ${label.toLowerCase()}`" @click="emit('reuse')"><AppIcon name="recycle"/></button>
  </div>
</template>

<style scoped>
.seed-input {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12px;
}

input:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}
</style>
