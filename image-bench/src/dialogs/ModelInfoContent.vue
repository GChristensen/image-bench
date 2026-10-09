<script setup>
/**
 * Body of the modelInfo dialog: Civitai preview, version, base model and trained words
 */
import {ref} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
  info: {
    type: Object,
    required: true,
    validator: info => info.found && typeof info.url === "string"
  }
});

const copied = ref(false);

async function copyTrainedWords() {
  await navigator.clipboard.writeText(props.info.trainedWords.join(", "));
  copied.value = true;
  setTimeout(() => copied.value = false, 1500);
}
</script>

<template>
  <div class="model-info">
    <img v-if="info.previewUrl" class="preview" :src="info.previewUrl" alt="" referrerpolicy="no-referrer">
    <div class="details">
      <div class="version">{{ info.versionName }}</div>
      <div class="meta">
        <span v-if="info.type" class="chip">{{ info.type }}</span>
        <span v-if="info.baseModel" class="chip">{{ info.baseModel }}</span>
      </div>
      <template v-if="info.trainedWords.length">
        <div class="words-header">
          <span class="label-small">Trained words</span>
          <button class="btn small" title="Copy the trained words" @click="copyTrainedWords"
            ><AppIcon name="copy" :size="13"/>{{ copied ? "Copied" : "Copy" }}</button>
        </div>
        <div class="words">
          <span v-for="word in info.trainedWords" :key="word" class="chip">{{ word }}</span>
        </div>
      </template>
      <div v-else class="no-words">No trained words</div>
    </div>
  </div>
</template>

<style scoped>
.model-info {
  display: flex;
  gap: 14px;
}

.preview {
  width: 160px;
  max-height: 240px;
  object-fit: cover;
  border-radius: 5px;
  flex-shrink: 0;
}

.details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.version {
  font-weight: 500;
}

.meta,
.words {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.words {
  max-height: 150px;
  overflow-y: auto;
}

.words-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.no-words {
  color: var(--ib-muted);
}
</style>
