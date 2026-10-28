<script setup>
/**
 * What an empty view shows: how images get there, with the keys of the fast ways, and a book button after the title
 * that opens its chapter of the manual
 */
import {computed} from "vue";
import {useRouter} from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import {MANUAL_SECTIONS, useManualStore} from "@/stores/manual.js";

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  // [{text, key?}]: key is shown after the text as a key cap
  ways: {
    type: Array,
    default: () => []
  },
  // Id of the chapter of the manual (MANUAL_SECTIONS)
  chapter: {
    type: String,
    default: null
  }
});

const router = useRouter();
const manual = useManualStore();

const chapterTitle = computed(() => {
  const section = MANUAL_SECTIONS.find(s => s.id === props.chapter);
  return section ? `Manual: ${section.title}` : "Manual";
});

function openChapter() {
  manual.reveal(props.chapter);
  router.push("/library");
}
</script>

<template>
  <div class="empty-state">
    <AppIcon :name="icon" :size="30" class="empty-icon"/>
    <div class="empty-title">
      {{ title }}
      <button v-if="chapter" type="button" class="empty-manual" :title="chapterTitle" :aria-label="chapterTitle"
              @click="openChapter">
        <AppIcon name="book" :size="14"/>
      </button>
    </div>
    <ul v-if="ways.length" class="empty-ways">
      <li v-for="way in ways" :key="way.text">{{ way.text }}<span v-if="way.key" class="key">{{ way.key }}</span></li>
    </ul>
  </div>
</template>

<style scoped>
.empty-state {
  margin: auto;
  padding: 40px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 520px;
  color: var(--ib-text-2);
  text-align: center;
}

.empty-icon {
  color: var(--ib-border-2);
}

.empty-title {
  color: var(--ib-text);
  font-size: 15px;
  font-weight: 600;
}

.empty-ways {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.5;
}

.key {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--ib-border-2);
  border-radius: 3px;
  background: var(--ib-elev-2);
  color: var(--ib-text-2);
  font: 11px/16px var(--ib-mono);
}

.empty-manual {
  margin-left: 4px;
  padding: 2px;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--ib-text-2);
  opacity: 0.55;
  vertical-align: -2px;
  cursor: pointer;
}

.empty-manual:hover,
.empty-manual:focus-visible {
  color: var(--ib-accent);
  opacity: 1;
}
</style>
