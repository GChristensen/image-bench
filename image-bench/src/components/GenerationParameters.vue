<script setup>
import {computed} from "vue";

  const props = defineProps({
    parameters: {
      type: Object,
      required: true
    }
  });

  // Values longer than this take a whole row of the grid
  const WIDE_LENGTH = 36;

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  const prompts = computed(() =>
    [["Prompt", props.parameters["prompt"]], ["Negative prompt", props.parameters["negative prompt"]]]
      .filter(([, text]) => text));

  // The other parameters as grid items; objects (e.g. lora hashes) as one wide item with their entries
  const items = computed(() => {
    const result = [];

    for (const [key, value] of Object.entries(props.parameters)) {
      if (key === "prompt" || key === "negative prompt")
        continue;

      if (value && typeof value === "object")
        result.push({key: capitalize(key), entries: Object.entries(value).map(([k, v]) => `${k}: ${v}`), wide: true});
      else {
        const text = String(value);
        result.push({key: capitalize(key), value: text, wide: text.length > WIDE_LENGTH});
      }
    }

    return result;
  });
</script>

<template>
  <div class="generation-parameters">
    <section v-for="[label, text] in prompts" :key="label" class="params-section">
      <div class="params-label">{{ label }}</div>
      <div class="params-prompt">{{ text }}</div>
    </section>
    <div v-if="items.length" class="params-grid">
      <div v-for="item in items" :key="item.key" class="param" :class="{wide: item.wide}">
        <span class="param-key">{{ item.key }}</span>
        <span v-if="item.entries" class="param-entries">
          <span v-for="entry in item.entries" :key="entry" class="param-entry">{{ entry }}</span>
        </span>
        <span v-else class="param-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.generation-parameters {
  color: var(--ib-text);
  font-size: 13px;
  line-height: 1.45;
}

.params-section + .params-section,
.params-section + .params-grid {
  margin-top: 12px;
}

.params-label {
  margin-bottom: 3px;
  color: var(--ib-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.params-prompt {
  padding: 6px 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-elev);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Several columns of short "key value" items; long values and objects take a whole row */
.params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 3px 16px;
  padding-top: 10px;
  border-top: 1px solid var(--ib-border);
}

.param {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.param.wide {
  grid-column: 1 / -1;
}

.param-key {
  flex: none;
  color: var(--ib-text-2);
}

.param-value {
  min-width: 0;
  font-family: var(--ib-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.param-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 6px;
  min-width: 0;
}

.param-entry {
  padding: 0 5px;
  border: 1px solid var(--ib-border);
  border-radius: 4px;
  font-family: var(--ib-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
