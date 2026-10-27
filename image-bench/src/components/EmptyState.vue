<script setup>
/**
 * What an empty view shows: how images get there, with the keys of the fast ways, and a link to its chapter of the
 * manual
 */
import {useRouter} from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import {useManualStore} from "@/stores/manual.js";

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
  },
  chapterText: {
    type: String,
    default: "How it works"
  }
});

const router = useRouter();
const manual = useManualStore();

function openChapter() {
  manual.reveal(props.chapter);
  router.push("/library");
}
</script>

<template>
  <div class="empty-state">
    <AppIcon :name="icon" :size="30" class="empty-icon"/>
    <div class="empty-title">{{ title }}</div>
    <ul v-if="ways.length" class="empty-ways">
      <li v-for="way in ways" :key="way.text">{{ way.text }}<span v-if="way.key" class="key">{{ way.key }}</span></li>
    </ul>
    <a v-if="chapter" href="#" class="empty-link" @click.prevent="openChapter">{{ chapterText }} →</a>
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

.empty-link {
  color: var(--ib-accent);
  font-size: 12.5px;
  text-decoration: none;
}

.empty-link:hover {
  text-decoration: underline;
}
</style>
