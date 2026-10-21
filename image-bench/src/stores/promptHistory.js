import {defineStore} from "pinia";
import {ref} from "vue";

const URL = "/image-bench/prompt_history";
const MAX_ENTRIES = 16;

/**
 * @param {number} time
 * @returns {string} The time of a history entry; the date too if not today
 */
export function formatHistoryTime(time) {
  const date = new Date(time);

  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})
    : date.toLocaleString([], {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"});
}

/**
 * The prompts generated from the Generate tab, the latest first: {prompt, negativePrompt, time} entries kept in
 * store/prompt_history.json as {version, entries}. A prompt pair generated again moves to the front.
 * Saved into a project and restored from it, but not part of its unsaved changes
 */
export const usePromptHistoryStore = defineStore("promptHistory", () => {
  const entries = ref([]);
  let saving = Promise.resolve();

  async function load() {
    try {
      const response = await fetch(URL);
      const text = response.ok ? await response.text() : "";
      const data = text.trim() ? JSON.parse(text) : null;

      entries.value = Array.isArray(data?.entries) ? data.entries.slice(0, MAX_ENTRIES) : [];
    } catch (error) {
      console.error("[Image Bench] Unable to load the prompt history:", error);
    }
  }

  function persist() {
    const body = JSON.stringify({version: 1, entries: entries.value});

    saving = saving
      .then(() => fetch(URL, {method: "post", body}))
      .catch(error => console.error("[Image Bench] Unable to save the prompt history:", error));
  }

  /**
   * @param {string} prompt
   * @param {string} negativePrompt
   */
  function record(prompt, negativePrompt) {
    prompt ??= "";
    negativePrompt ??= "";

    if (!prompt.trim() && !negativePrompt.trim())
      return;

    const first = entries.value[0];

    if (first?.prompt === prompt && first?.negativePrompt === negativePrompt)
      return;

    entries.value = [{prompt, negativePrompt, time: Date.now()},
                     ...entries.value.filter(entry => entry.prompt !== prompt || entry.negativePrompt !== negativePrompt)]
      .slice(0, MAX_ENTRIES);
    persist();
  }

  function clear() {
    if (!entries.value.length)
      return;

    entries.value = [];
    persist();
  }

  // Before a project is saved
  const flush = () => saving;

  return {entries, load, record, clear, flush};
});
