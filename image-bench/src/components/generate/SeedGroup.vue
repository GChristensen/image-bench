<script setup>
/**
 * Seed parameters of the Generate tab: seed, and the variation seed and strength where the host has them
 */
import NumberStepper from "@/components/NumberStepper.vue";
import SeedInput from "@/components/SeedInput.vue";

defineProps({
  form: {
    type: Object,
    required: true
  },
  // Feature check (useFeatures)
  has: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['set', 'reuse']);
</script>

<template>
  <div class="group">
    <div class="group-header label-small">Seed</div>
    <label class="field">Seed
      <SeedInput :model-value="form.seed ?? -1" label="Seed"
                 @update:model-value="v => emit('set', 'seed', v)" @reuse="emit('reuse', 'seed')"/>
    </label>
    <template v-if="has('variationSeed')">
      <label class="field">Variation seed
        <SeedInput :model-value="form.subseed ?? -1" label="Variation seed"
                   @update:model-value="v => emit('set', 'subseed', v)" @reuse="emit('reuse', 'subseed')"/>
      </label>
      <label class="field">Variation strength
        <NumberStepper :model-value="form.subseedStrength ?? ''" :min="0" :max="1" :step="0.01"
                       label="Variation strength" @update:model-value="v => emit('set', 'subseedStrength', v)"/>
      </label>
    </template>
  </div>
</template>

<style scoped src="./groups.css"></style>
