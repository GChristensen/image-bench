import {defineStore} from "pinia";
import {ref, shallowRef, watch} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {parseTagsCsv} from "@/tagsCsv.js";

const SELECTED_KEY = "imageBench_librarySelectedDoc";

/**
 * GET an action of /image-bench/projects (the docs actions of projects.dispatch)
 * @param {string} action
 * @param {Object} args
 * @returns {Promise<Object>}
 * @throws {Error} With the message of the backend
 */
async function get(action, args = {}) {
  const response = await fetch(`/image-bench/projects/${action}?${new URLSearchParams(args)}`);
  let result = null;

  try {
    result = await response.json();
  } catch {
    // Not JSON: an error page
  }

  if (!response.ok || !result)
    throw new Error(result?.error || `The request failed (${response.status}).`);

  return result;
}

/**
 * URL of a file under the docs root (an image referenced by a doc)
 * @param {string} path - Relative to the docs root
 * @returns {string}
 */
export const docAssetUrl = path => `/image-bench/projects/doc_asset?${new URLSearchParams({path})}`;

/**
 * Check a docs root
 * @param {string} root - Empty: the docs folder of the extension
 * @returns {Promise<{exists: boolean, docs: number, default: string, error?: string}>}
 */
export const checkDocsRoot = root => get("docs_check", {root});

const isTagList = path => /\.csv$/i.test(path);

/**
 * Content of a tag list (CSV)
 * @param {string} path
 * @returns {Promise<{path: string, kind: "tags", name: string, tags: Object[]}>}
 */
async function fetchTagList(path) {
  const response = await fetch(docAssetUrl(path), {cache: "no-cache"});

  if (!response.ok)
    throw new Error(`The tag list could not be read (${response.status}).`);

  return {path, kind: "tags", name: path.split("/").pop(), tags: parseTagsCsv(await response.text())};
}

/**
 * Docs of the Library tab: the Markdown files and tag lists (CSV) under the docs root (read-only), and the one shown
 */
export const useDocsStore = defineStore("docs", () => {
  const storage = useLocalStorage();

  // {root, default, exists, nodes}, null until loaded
  const tree = ref(null);
  const treeError = ref(null);
  const selectedPath = ref(storage.getItem(SELECTED_KEY) || null);
  // Markdown: {path, kind: "markdown", name, text, modified}; tag list: {path, kind: "tags", name, tags}
  const doc = shallowRef(null);
  const docError = ref(null);
  const loading = ref(false);

  watch(selectedPath, path => storage.setItem(SELECTED_KEY, path ?? ""));

  async function loadTree() {
    try {
      tree.value = await get("docs_tree");
      treeError.value = null;
    } catch (error) {
      treeError.value = error.message;
    }
  }

  /**
   * Show a doc
   * @param {string|null} path - Relative to the docs root; null shows none
   */
  async function open(path = selectedPath.value) {
    selectedPath.value = path || null;

    if (!path) {
      doc.value = null;
      docError.value = null;
      return;
    }

    loading.value = true;

    try {
      const result = isTagList(path) ? await fetchTagList(path) : {...await get("doc", {path}), kind: "markdown"};

      // A later request won
      if (selectedPath.value === path) {
        doc.value = result;
        docError.value = null;
      }
    } catch (error) {
      if (selectedPath.value === path) {
        doc.value = null;
        docError.value = error.message;
      }
    } finally {
      loading.value = false;
    }
  }

  return {tree, treeError, selectedPath, doc, docError, loading, loadTree, open};
});
