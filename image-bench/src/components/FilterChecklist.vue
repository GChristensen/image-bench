<script setup>
/**
 * Checklist with a filter: items in optional groups, each checked or not.
 * The checked values are kept in the order they were checked. The filter only hides items:
 * a hidden item stays checked.
 */
import {computed, nextTick, onMounted, ref} from "vue";

const model = defineModel({type: Array, default: () => []});
const filter = defineModel("filter", {type: String, default: ""});

const props = defineProps({
  // {value, label, group?, note?}
  items: {
    type: Array,
    required: true
  },
  // Group key -> heading, in the order the groups are shown; items of other groups follow without a heading
  groups: {
    type: Object,
    default: () => ({})
  },
  emptyText: {
    type: String,
    default: "Nothing to choose"
  },
  autofocus: {
    type: Boolean,
    default: false
  }
});

const filterInput = ref(null);

const shownGroups = computed(() => {
  const text = filter.value.trim().toLowerCase();
  const items = props.items.filter(item => !text || item.label.toLowerCase().includes(text));
  const keys = [...Object.keys(props.groups), ...new Set(items.map(item => item.group ?? ""))];

  return [...new Set(keys)]
    .map(key => ({key, label: props.groups[key] ?? "", items: items.filter(item => (item.group ?? "") === key)}))
    .filter(group => group.items.length);
});

function toggle(value, checked) {
  model.value = checked ? [...model.value.filter(v => v !== value), value] : model.value.filter(v => v !== value);
}

onMounted(() => props.autofocus && nextTick(() => filterInput.value?.focus()));

defineExpose({focus: () => filterInput.value?.focus(), input: filterInput});
</script>

<template>
  <div class="filter-checklist">
    <input ref="filterInput" v-model="filter" class="filter" type="search" placeholder="Filter…" aria-label="Filter">
    <div class="list" role="group">
      <template v-for="group in shownGroups" :key="group.key">
        <div v-if="group.label" class="group label-small">{{ group.label }}</div>
        <label v-for="item in group.items" :key="item.value" class="item" :title="item.value">
          <input type="checkbox" :checked="model.includes(item.value)"
                 @change="e => toggle(item.value, e.target.checked)">
          <span class="label">{{ item.label }}</span>
          <span v-if="item.note" class="note">{{ item.note }}</span>
        </label>
      </template>
      <div v-if="!shownGroups.length" class="empty">{{ items.length ? "No matches" : emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.filter-checklist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.filter {
  height: 26px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  background: var(--ib-bg);
  color: var(--ib-text);
  font: inherit;
  outline: none;
}

.filter:focus {
  border-color: var(--ib-accent-border);
}

.list {
  overflow-y: auto;
  min-height: 0;
  max-height: 320px;
}

.group {
  padding: 6px 6px 2px;
  color: var(--ib-muted);
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 6px;
  border-radius: 4px;
  cursor: pointer;
}

.item:hover {
  background: var(--ib-hover);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  flex-shrink: 0;
  color: var(--ib-muted);
  font-size: 11px;
}

.empty {
  padding: 8px 6px;
  color: var(--ib-muted);
}
</style>
