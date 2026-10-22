<script setup>
/**
 * Labelled prompt textarea with the token count reported by the host; the textarea fills the field height.
 * Ctrl+Up/Down changes the attention weight as in WebUI. The label row has a slot after the label
 * (e.g. the prompt history), and the "view" slot takes the place of the textarea (a read-only prompt)
 */
import {nextTick, ref} from "vue";
import {editAttention, isEditAttentionKey} from "@/editAttention.js";

let fieldCount = 0;

const model = defineModel({type: String, default: ""});

defineProps({
  label: {
    type: String,
    required: true
  },
  // e.g. "41/75", hidden if null
  tokens: {
    type: String,
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const textarea = ref(null);
// The label names the textarea by its id: the label row holds buttons, which a wrapping label would activate
const id = `prompt-field-${++fieldCount}`;

async function onKeydown(e) {
  if (!isEditAttentionKey(e))
    return;

  e.preventDefault();

  const element = textarea.value;
  const edit = editAttention(element.value, element.selectionStart, element.selectionEnd, e.key === "ArrowUp");

  if (edit.text !== element.value) {
    model.value = edit.text;
    await nextTick();
  }

  element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

// The Snippets panel inserts at the caret of the textarea
defineExpose({textarea});
</script>

<template>
  <div class="prompt-field">
    <div class="prompt-label">
      <label :for="id">{{ label }}</label>
      <slot name="after-label"/>
      <span v-if="tokens" class="tokens" title="Tokens">{{ tokens }}</span>
    </div>
    <slot name="view">
      <textarea :id="id" ref="textarea" v-model="model" :disabled="disabled" spellcheck="false"
                @keydown="onKeydown"></textarea>
    </slot>
  </div>
</template>

<style scoped>
.prompt-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.prompt-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  font-size: 11px;
  color: var(--ib-text-2);
}

.tokens {
  margin-left: auto;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--ib-elev);
  color: var(--ib-text-2);
  font-family: var(--ib-mono);
  font-size: 10.5px;
}

textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  padding: 8px 10px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  color: var(--ib-text);
  font: inherit;
  line-height: 1.5;
}

textarea:focus {
  outline: none;
  border-color: var(--ib-accent-border);
}
</style>
