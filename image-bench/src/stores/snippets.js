import {defineStore} from "pinia";
import {computed, ref, triggerRef} from "vue";

const PERSIST_DELAY = 500;

/**
 * Snippets of the Library tab: prompt text with an optional negative part, inserted into the prompts of the
 * Generate tab from its Snippets panel. Kept in store/snippets.json as {version, items}: an item is a folder
 * {id, name, children} or a snippet {id, name, prompt, negative}. "{}" or "{prompt}" (as in WebUI styles) in a
 * snippet stands for the selected prompt text, which it wraps.
 */

// The first one in a snippet is used
const PLACEHOLDER = /\{(?:prompt)?\}/;

/**
 * @param {string} text
 * @returns {boolean} Whether the snippet text has a placeholder for the selected prompt text
 */
export function hasPlaceholder(text) {
  return PLACEHOLDER.test(text ?? "");
}

export const useSnippetsStore = defineStore("snippets", () => {
  const items = ref([]);
  const loaded = ref(false);
  // Snippet id the Library is asked to show (from the Snippets panel), true for the snippets only;
  // cleared by the Library
  const revealed = ref(null);
  let persistTimer = null;
  let loading = null;

  // Nodes of TreeView: folders have children
  const nodes = computed(() => {
    const toNode = item => item.children
      ? {key: item.id, name: item.name, children: item.children.map(toNode), item}
      : {key: item.id, name: item.name, item};

    return items.value.map(toNode);
  });

  const count = computed(() => {
    const countIn = list => list.reduce((n, item) => n + (item.children ? countIn(item.children) : 1), 0);
    return countIn(items.value);
  });

  function load() {
    loading ??= fetch("/image-bench/snippets")
      .then(r => r.ok && r.headers.get("content-length") !== "0" ? r.text() : "")
      .then(text => {
        const data = text.trim() ? JSON.parse(text) : null;
        items.value = Array.isArray(data?.items) ? data.items : [];
      })
      .catch(error => console.error("[Image Bench] Unable to load the snippets:", error))
      .finally(() => loaded.value = true);

    return loading;
  }

  function persist() {
    triggerRef(items);
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      fetch("/image-bench/snippets", {method: "post", body: JSON.stringify({version: 1, items: items.value})})
        .catch(error => console.error("[Image Bench] Unable to save the snippets:", error));
    }, PERSIST_DELAY);
  }

  const createId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /**
   * @returns {{item: Object, list: Object[]}|null} The item and the list that holds it
   */
  function locate(id, list = items.value) {
    for (const item of list) {
      if (item.id === id)
        return {item, list};

      const found = item.children && locate(id, item.children);

      if (found)
        return found;
    }

    return null;
  }

  const find = id => locate(id)?.item ?? null;

  // The children of a folder, the top level for null
  function listOf(folderId) {
    const folder = folderId ? find(folderId) : null;
    return folder?.children ?? items.value;
  }

  /**
   * The folder an item is in: the item itself if it is a folder, null for the top level
   */
  function folderFor(id) {
    if (!id)
      return null;

    const item = find(id);

    if (item?.children)
      return item.id;

    const parent = findParent(id);
    return parent?.id ?? null;
  }

  function findParent(id, list = items.value, parent = null) {
    for (const item of list) {
      if (item.id === id)
        return parent;

      const found = item.children && findParent(id, item.children, item);

      if (found !== undefined)
        return found;
    }

    return undefined;
  }

  function addSnippet(folderId, {name, prompt = "", negative = ""}) {
    const snippet = {id: createId(), name, prompt, negative};
    listOf(folderId).push(snippet);
    persist();
    return snippet;
  }

  function addFolder(folderId, name) {
    const folder = {id: createId(), name, children: []};
    listOf(folderId).push(folder);
    persist();
    return folder;
  }

  function update(id, changes) {
    const item = find(id);

    if (item) {
      Object.assign(item, changes);
      persist();
    }
  }

  function remove(id) {
    const found = locate(id);

    if (found) {
      found.list.splice(found.list.indexOf(found.item), 1);
      persist();
    }
  }

  function duplicate(id) {
    const found = locate(id);

    if (!found || found.item.children)
      return null;

    const copy = {...found.item, id: createId(), name: `${found.item.name} copy`};
    found.list.splice(found.list.indexOf(found.item) + 1, 0, copy);
    persist();
    return copy;
  }

  /**
   * Move an item into a folder (target folder, position "inside"; null target: the top level)
   * or before another item (position "before")
   */
  function move(id, targetId, position) {
    const source = locate(id);

    if (!source || id === targetId)
      return;

    source.list.splice(source.list.indexOf(source.item), 1);

    if (position === "before" && targetId) {
      const target = locate(targetId);
      target.list.splice(target.list.indexOf(target.item), 0, source.item);
    }
    else
      listOf(targetId).push(source.item);

    persist();
  }

  /**
   * Add styles (of WebUI's styles.csv) as snippets to a folder, which is created if missing;
   * styles already there by name are skipped
   * @param {{name: string, prompt: string, negative_prompt: string}[]} styles
   * @param {string} folderName
   * @returns {number} Number of the added snippets
   */
  function importStyles(styles, folderName) {
    let folder = items.value.find(item => item.children && item.name === folderName);

    if (!folder) {
      folder = {id: createId(), name: folderName, children: []};
      items.value.push(folder);
    }

    const names = new Set(folder.children.map(item => item.name));
    let added = 0;

    for (const style of styles) {
      if (!style.name || names.has(style.name))
        continue;

      folder.children.push({id: createId(), name: style.name, prompt: style.prompt ?? "",
                            negative: style.negative_prompt ?? ""});
      names.add(style.name);
      added++;
    }

    persist();
    return added;
  }

  return {items, nodes, count, loaded, revealed, load, find, findParent, folderFor, addSnippet, addFolder, update, remove,
          duplicate, move, importStyles};
});

/**
 * Parse the styles of a WebUI styles.csv file (name, prompt, negative_prompt)
 * @param {string} text
 * @returns {{name: string, prompt: string, negative_prompt: string}[]}
 */
export function parseStylesCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      }
      else if (char === '"')
        quoted = false;
      else
        field += char;
    }
    else if (char === '"')
      quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n")
        i++;

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    }
    else
      field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = (rows.shift() ?? []).map(name => name.trim().toLowerCase());
  const column = name => header.indexOf(name);

  return rows
    .filter(cells => cells.some(cell => cell.trim()))
    .map(cells => ({
      name: (cells[column("name")] ?? "").trim(),
      prompt: cells[column("prompt")] ?? "",
      negative_prompt: cells[column("negative_prompt")] ?? ""
    }))
    .filter(style => style.name && style.name !== "None");
}

/**
 * Insert snippet text into a prompt textarea at its caret, as typing would, so that Ctrl+Z undoes it.
 * Commas separate it from the neighbouring text. The placeholder ("{}" or "{prompt}") in the text is replaced by
 * the selected text (wrap) or removed, the caret then stands there
 * @param {HTMLTextAreaElement} textarea
 * @param {string} text
 * @param {boolean} wrap - Wrap the selected text with the text around the placeholder; else the selection is kept
 *                          and the text inserted after it
 */
export function insertIntoTextarea(textarea, text, wrap) {
  textarea.focus();

  const value = textarea.value;
  let start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const selected = value.slice(start, end);
  const match = text.match(PLACEHOLDER);
  const placeholder = match ? match.index : -1;
  let insert = text;
  let caret = null;

  if (wrap && match) {
    insert = text.replace(PLACEHOLDER, () => selected);
    caret = placeholder + selected.length;
  }
  else {
    // Inserted after the selection, which stays
    start = end;

    if (match) {
      insert = text.replace(PLACEHOLDER, "");
      caret = placeholder;
    }
  }

  const before = value.slice(0, start).replace(/\s+$/, "");
  const after = value.slice(end).replace(/^\s+/, "");
  const prefix = before && !/[,(\[{<\n]$/.test(before) ? ", " : before && /,$/.test(before) ? " " : "";
  const suffix = after && !/^[,)\]}>\n]/.test(after) ? ", " : "";
  const replaceFrom = before.length;
  const replaceTo = value.length - after.length;
  const replacement = prefix + insert + suffix;

  textarea.setSelectionRange(replaceFrom, replaceTo);

  // The edit goes into the undo history of the textarea; setRangeText() if the browser has no insertText
  if (!document.execCommand("insertText", false, replacement)) {
    textarea.setRangeText(replacement, replaceFrom, replaceTo, "end");
    textarea.dispatchEvent(new Event("input", {bubbles: true}));
  }

  const position = replaceFrom + prefix.length + (caret ?? insert.length);
  textarea.setSelectionRange(position, position);
}

/**
 * Append snippet text to the end of a prompt, after a comma
 * @param {string} prompt
 * @param {string} text
 * @returns {string}
 */
export function appendToPrompt(prompt, text) {
  const base = String(prompt ?? "").replace(/\s+$/, "");
  text = text.replace(PLACEHOLDER, "");

  if (!base)
    return text;

  return base + (base.endsWith(",") ? " " : ", ") + text;
}
