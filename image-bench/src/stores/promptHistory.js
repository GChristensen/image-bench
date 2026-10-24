import {defineStore} from "pinia";
import {computed, ref} from "vue";

const URL = "/image-bench/prompt_history";
const MAX_ENTRIES = 20;

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

const GROUPS = ["txt2img", "img2img"];

/**
 * @param {string} mode - Generation mode of the Generate tab
 * @returns {string} Its history group: txt2img, or img2img for img2img, inpaint and the other img2img tabs
 */
export function historyGroup(mode) {
  return mode === "txt2img" ? "txt2img" : "img2img";
}

/**
 * @param {*} history - {entries, variants} as read from the file
 * @returns {{entries: Array, variants: Array}}
 */
function readHistory(history) {
  return {entries: Array.isArray(history?.entries) ? history.entries.slice(0, MAX_ENTRIES) : [],
          variants: Array.isArray(history?.variants) ? history.variants : []};
}

/**
 * The prompts generated from the Generate tab, the latest first, per history group (txt2img; img2img for img2img and
 * inpaint): {prompt, negativePrompt, time} entries kept in store/prompt_history.json as
 * {version: 2, txt2img: {entries, variants}, img2img: {entries, variants}} (version 1, a single {entries, variants},
 * is read into both groups). A prompt pair generated again moves to the front. Variants are history prompts forked
 * under a name ({name, prompt, negativePrompt, time}, in the order of forking), kept until the history is cleared.
 * entries and variants are those of the group of the mode shown (setMode). Saved into a project and restored from it,
 * but not part of its unsaved changes
 */
export const usePromptHistoryStore = defineStore("promptHistory", () => {
  const histories = ref(Object.fromEntries(GROUPS.map(name => [name, readHistory(null)])));
  const group = ref(GROUPS[0]);
  const entries = computed(() => histories.value[group.value].entries);
  const variants = computed(() => histories.value[group.value].variants);
  let saving = Promise.resolve();

  async function load() {
    try {
      const response = await fetch(URL);
      const text = response.ok ? await response.text() : "";
      const data = text.trim() ? JSON.parse(text) : null;

      histories.value = Object.fromEntries(GROUPS.map(name =>
        [name, readHistory(data?.version >= 2 ? data[name] : data)]));
    } catch (error) {
      console.error("[Image Bench] Unable to load the prompt history:", error);
    }
  }

  function setMode(mode) {
    group.value = historyGroup(mode);
  }

  // Replaces the lists of the current group
  function update(changes) {
    histories.value = {...histories.value, [group.value]: {...histories.value[group.value], ...changes}};
    persist();
  }

  function persist() {
    const body = JSON.stringify({version: 2, ...histories.value});

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

    update({entries: [{prompt, negativePrompt, time: Date.now()},
                      ...entries.value.filter(entry => entry.prompt !== prompt || entry.negativePrompt !== negativePrompt)]
      .slice(0, MAX_ENTRIES)});
  }

  /**
   * @param {string} name
   * @param {{prompt: string, negativePrompt: string}} entry - The forked prompts
   */
  function fork(name, {prompt, negativePrompt}) {
    update({variants: [...variants.value, {name, prompt, negativePrompt, time: Date.now()}]});
  }

  function renameVariant(index, name) {
    update({variants: variants.value.map((variant, i) => i === index ? {...variant, name} : variant)});
  }

  function removeVariant(index) {
    update({variants: variants.value.filter((_, i) => i !== index)});
  }

  // Both groups
  function clear() {
    if (Object.values(histories.value).every(history => !history.entries.length && !history.variants.length))
      return;

    histories.value = Object.fromEntries(GROUPS.map(name => [name, readHistory(null)]));
    persist();
  }

  // Before a project is saved
  const flush = () => saving;

  return {entries, variants, load, setMode, record, fork, renameVariant, removeVariant, clear, flush};
});
