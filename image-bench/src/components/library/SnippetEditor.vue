<script setup>
/**
 * Editor of the snippet selected in the Library: name, positive and negative text (saved as they are typed),
 * and a preview of the text it adds to the current prompts
 */
import {computed} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {appendToPrompt, useSnippetsStore} from "@/stores/snippets.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";

const props = defineProps({
  id: {
    type: String,
    default: null
  }
});

const emit = defineEmits(["delete", "duplicate"]);

const store = useSnippetsStore();
const sdWebUI = useSDWebUIStateStore();

const item = computed(() => props.id ? store.find(props.id) : null);
const folder = computed(() => item.value ? store.findParent(item.value.id) : null);

const update = (name, value) => store.update(props.id, {[name]: value});

const sample = computed(() => ({
  prompt: sdWebUI.params?.prompt || "portrait of a woman, detailed face",
  negative: sdWebUI.params?.negativePrompt || "lowres, blurry"
}));

// The text the snippet adds at the end of the prompts; at the caret it is placed the same way
const preview = computed(() => {
  const prompt = item.value?.prompt ?? "";
  const negative = item.value?.negative ?? "";

  return {
    prompt: prompt ? appendToPrompt(sample.value.prompt, prompt).slice(sample.value.prompt.replace(/\s+$/, "").length) : "",
    negative: negative ? appendToPrompt(sample.value.negative, negative).slice(sample.value.negative.replace(/\s+$/, "").length) : ""
  };
});
</script>

<template>
  <div v-if="item && !item.children" class="snippet-editor">
    <header class="header">
      <div class="title">
        <div class="breadcrumb">{{ folder ? folder.name + " /" : "/" }}</div>
        <input class="name" :value="item.name" aria-label="Snippet name" spellcheck="false"
               @change="e => e.target.value.trim() && update('name', e.target.value.trim())">
      </div>
      <button class="btn outline" @click="emit('duplicate', item.id)"><AppIcon name="copy" :size="14"/>Duplicate</button>
      <button class="ib danger" aria-label="Delete the snippet" title="Delete the snippet" @click="emit('delete', item.id)"
        ><AppIcon name="trash" :size="14"/></button>
    </header>

    <label class="field">
      <span class="label-small">Positive</span>
      <textarea :value="item.prompt" rows="4" spellcheck="false" placeholder="Text inserted into the prompt"
                @input="e => update('prompt', e.target.value)"></textarea>
    </label>
    <label class="field">
      <span class="label-small">Negative <span class="hint">optional · added to the other prompt</span></span>
      <textarea :value="item.negative" rows="2" spellcheck="false" placeholder="Text added to the negative prompt"
                @input="e => update('negative', e.target.value)"></textarea>
    </label>
    <p class="hint">Put <code>{}</code> into the text to make it wrap the selected prompt text on Shift+click,
      e.g. <code>(({}:1.2))</code>.</p>

    <section class="preview" aria-label="Preview">
      <span class="label-small">Preview <span class="hint">with the current prompts</span></span>
      <div class="preview-line"><span class="preview-label">Positive</span><span>{{ sample.prompt }}<mark>{{ preview.prompt }}</mark></span></div>
      <div class="preview-line"><span class="preview-label">Negative</span><span>{{ sample.negative }}<mark>{{ preview.negative }}</mark></span></div>
    </section>

    <section class="usage" aria-label="Usage">
      <div><b>Click</b><span>Inserts the part of the focused prompt at its caret and adds the other part to the other prompt</span></div>
      <div><b>Middle-click</b><span>Inserts only the part of the focused prompt</span></div>
      <div><b>Shift+click</b><span>Wraps the selected prompt text where the snippet has <code>{}</code></span></div>
    </section>
  </div>
  <div v-else-if="item" class="placeholder">
    <AppIcon name="folder" :size="26"/>
    <p>{{ item.name }}: {{ item.children.length }} {{ item.children.length === 1 ? "item" : "items" }}</p>
  </div>
  <div v-else class="placeholder">
    <AppIcon name="snippet" :size="26"/>
    <p>Snippets are prompt text inserted at the caret from the Snippets panel of the Generate tab
      (the <AppIcon name="snippet" :size="12" class="inline"/> button above the prompts).</p>
  </div>
</template>

<style scoped>
.snippet-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 900px;
  padding: 14px 18px 18px;
}

.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--ib-muted);
  text-align: center;
}

.placeholder p {
  max-width: 380px;
  margin: 0;
}

.inline {
  display: inline-block;
  vertical-align: -2px;
}

.header {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.title {
  flex: 1;
  min-width: 0;
}

.breadcrumb {
  color: var(--ib-muted);
  font-size: 12px;
}

.name {
  width: 100%;
  max-width: 460px;
  padding: 0 0 2px;
  border: 0;
  border-bottom: 1px dashed var(--ib-border-2);
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 19px;
  font-weight: 600;
  outline: none;
}

.name:focus {
  border-bottom-color: var(--ib-accent);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

textarea {
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid var(--ib-border-2);
  border-radius: 6px;
  background: var(--ib-bg);
  color: var(--ib-text);
  font-family: var(--ib-mono);
  font-size: 12.5px;
  line-height: 1.5;
  outline: none;
}

textarea:focus {
  border-color: var(--ib-accent-border);
}

.hint {
  margin: 0;
  color: var(--ib-muted);
  font-size: 11.5px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

code {
  font-family: var(--ib-mono);
  color: var(--ib-accent);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.preview-line {
  display: flex;
  gap: 8px;
  color: var(--ib-text-2);
  font-size: 12.5px;
  line-height: 1.5;
}

.preview-label {
  flex: none;
  width: 64px;
  color: var(--ib-muted);
  font-size: 11px;
  line-height: 19px;
}

mark {
  border-radius: 2px;
  background: var(--ib-accent-soft);
  color: var(--ib-text);
}

.usage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.usage div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  font-size: 12px;
}

.usage span {
  color: var(--ib-muted);
}
</style>
