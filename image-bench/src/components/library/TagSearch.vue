<script>
// The query of each list, while the popup is open
const queries = new Map();
</script>

<script setup>
/**
 * Right pane of a tag list (CSV) of the Library docs: a search field over the tags and their aliases, and the
 * matching tags by rank and post count. A click copies the tag with spaces for underscores, as written in prompts.
 */
import {computed, onMounted, ref, watch} from "vue";
import {formatCount, normalizeTag, searchTags, TAG_CATEGORIES} from "@/tagsCsv.js";
import {copyText} from "@/clipboard.js";

const LIMIT = 200;
const COPIED_TIME = 1200;

const props = defineProps({
  // {path, tags} of the docs store
  list: {
    type: Object,
    required: true
  }
});

const query = ref("");
const input = ref(null);
const copied = ref(null);
let copiedTimer = null;

watch(() => props.list.path, (path, previous) => {
  if (previous !== undefined)
    queries.set(previous, query.value);

  query.value = queries.get(path) ?? "";
}, {immediate: true});

const search = computed(() => searchTags(props.list.tags, query.value, LIMIT));

const promptText = name => name.replace(/_/g, " ");

/**
 * Parts of a text with the query (or else its words) marked: [{text, match}]
 * @param {string} text - Shown with spaces for underscores
 */
function highlight(text) {
  const search = normalizeTag(query.value).trim().replace(/\s+/g, " ");
  const key = normalizeTag(text);
  const marked = new Array(text.length).fill(false);

  for (const part of key.includes(search) ? [search] : search.split(" ")) {
    const index = part ? key.indexOf(part) : -1;

    if (index >= 0)
      marked.fill(true, index, index + part.length);
  }

  const parts = [];

  for (let i = 0; i < text.length; i++)
    if (parts.length && parts.at(-1).match === marked[i])
      parts.at(-1).text += text[i];
    else
      parts.push({text: text[i], match: marked[i]});

  return parts;
}

const category = tag => TAG_CATEGORIES[tag.category] ?? {label: `Category ${tag.category}`, color: "var(--ib-muted)"};

async function copy(tag) {
  if (!await copyText(promptText(tag.name)))
    return;

  copied.value = tag.name;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => copied.value = null, COPIED_TIME);
}

onMounted(() => input.value?.focus());
</script>

<template>
  <div class="tag-search">
    <div class="search-bar">
      <input ref="input" v-model="query" type="search" placeholder="Search tags and aliases" spellcheck="false"
             aria-label="Search tags" @keydown.esc.stop="query = ''">
      <span class="total">
        <template v-if="query.trim()">{{ search.total.toLocaleString() }} matches</template>
        <template v-else>{{ list.tags.length.toLocaleString() }} tags</template>
        <template v-if="search.total > LIMIT"> · first {{ LIMIT }}</template>
      </span>
    </div>
    <div v-if="!search.results.length" class="empty">No tags match.</div>
    <ul v-else class="results">
      <li v-for="{tag, alias} in search.results" :key="tag.name">
        <button class="row" :class="{copied: copied === tag.name}" title="Click to copy the tag" @click="copy(tag)">
          <span class="name"
            ><template v-for="(part, i) in highlight(promptText(tag.name))" :key="i"
              ><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template
          ></span>
          <span class="category" :style="{'--category-color': category(tag).color}">{{ category(tag).label }}</span>
          <span v-if="copied === tag.name" class="count copied-mark">Copied</span>
          <span v-else class="count" :title="`${tag.count.toLocaleString()} posts`">{{ formatCount(tag.count) }}</span>
          <span v-if="tag.aliases.length" class="aliases">
            <template v-for="(name, i) in tag.aliases" :key="name"
              >{{ i ? ", " : "" }}<span :class="{alias: name === alias}">{{ promptText(name) }}</span></template>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tag-search {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.search-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--ib-border);
  background: var(--ib-bg);
}

.search-bar input {
  flex: 1;
  max-width: 520px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  outline: none;
  background: var(--ib-surface);
  color: var(--ib-text);
  font: inherit;
  font-size: 13px;
}

.search-bar input:focus {
  border-color: var(--ib-accent-border);
}

.total {
  color: var(--ib-muted);
  font-size: 12px;
  white-space: nowrap;
}

.empty {
  padding: 40px 20px;
  color: var(--ib-muted);
  text-align: center;
}

.results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 6px 12px 24px;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  column-gap: 12px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--ib-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:hover {
  background: var(--ib-surface);
}

.row.copied {
  background: var(--ib-accent-soft);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
}

mark {
  border-radius: 2px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.category {
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--category-color) 45%, transparent);
  border-radius: 3px;
  color: var(--category-color);
  font-size: 10.5px;
  line-height: 16px;
}

.count {
  width: 48px;
  color: var(--ib-muted);
  font-size: 12px;
  text-align: right;
}

/* In place of the post count, which keeps the row as it is */
.copied-mark {
  color: var(--ib-accent);
  font-size: 11px;
}

.aliases {
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
  color: var(--ib-muted);
  font-size: 11.5px;
}

.aliases .alias {
  color: var(--ib-text);
  font-weight: 600;
}
</style>
