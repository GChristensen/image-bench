<script setup>
/**
 * Body of the hostErrors dialog: the nodes of a refused or failed run with their errors, and the nodes and files the
 * workflow uses that the host does not have (the error and the problems of stores/hostErrors.js)
 */
import {computed} from "vue";
import {HOST_NAME} from "@/host.js";

const props = defineProps({
  error: {
    type: Object,
    default: null,
    validator: error => typeof error.message === "string" && Array.isArray(error.nodes)
  },
  problems: {
    type: Object,
    default: null,
    validator: problems => Array.isArray(problems.missingNodes) && Array.isArray(problems.missingFiles)
  }
});

const emit = defineEmits(["show"]);

// The error message stands alone when no node error repeats it
const showMessage = computed(() => props.error
  && !props.error.nodes.some(node => node.errors?.some(item => item.message === props.error.message)));

const missing = computed(() => [
  ...(props.problems?.missingNodes ?? []).map(node => ({...node, text: `Node type not installed`})),
  ...(props.problems?.missingFiles ?? []).map(node => ({...node, text: `${node.input}: ${node.value} is not in the list`}))
]);
</script>

<template>
  <div class="host-errors">
    <section v-if="error">
      <p v-if="showMessage" class="message">{{ error.message }}</p>
      <div v-for="node in error.nodes" :key="node.id" class="node">
        <div class="node-header">
          <span class="node-title">{{ node.title }}</span>
          <span v-if="node.type && node.type !== node.title" class="chip">{{ node.type }}</span>
          <button type="button" class="btn small" :title="`Select the node in ${HOST_NAME}`"
                  @click="emit('show', node.id)">Show in {{ HOST_NAME }}</button>
        </div>
        <div v-for="(item, index) in node.errors ?? []" :key="index" class="node-error">
          <span v-if="item.input" class="input">{{ item.input }}<template v-if="item.value != null">: {{ item.value }}</template></span>
          <span>{{ item.message }}</span>
          <span v-if="item.details && item.details !== item.message" class="details">{{ item.details }}</span>
        </div>
      </div>
    </section>
    <section v-if="missing.length">
      <h4>{{ error ? "The workflow also uses" : "The workflow uses" }} what {{ HOST_NAME }} does not have</h4>
      <div v-for="node in missing" :key="`${node.id}/${node.input ?? ''}`" class="node">
        <div class="node-header">
          <span class="node-title">{{ node.title }}</span>
          <span v-if="node.type && node.type !== node.title" class="chip">{{ node.type }}</span>
          <button type="button" class="btn small" :title="`Select the node in ${HOST_NAME}`"
                  @click="emit('show', node.id)">Show in {{ HOST_NAME }}</button>
        </div>
        <div class="node-error">{{ node.text }}</div>
      </div>
      <p class="hint">A file added since the {{ HOST_NAME }} page was loaded is listed until the model lists are
        refreshed (the button of the status pill).</p>
    </section>
  </div>
</template>

<style scoped>
.host-errors {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
}

section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--ib-text-2);
}

.message {
  margin: 0;
  color: var(--ib-text-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-bg);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.node-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-header .btn {
  margin-left: auto;
  flex-shrink: 0;
}

.node-error {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--ib-text-2);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.input {
  font-family: var(--ib-mono);
  font-size: 12px;
  color: var(--ib-text);
}

.details,
.hint {
  font-size: 12px;
  color: var(--ib-muted);
}

.hint {
  margin: 0;
}
</style>
