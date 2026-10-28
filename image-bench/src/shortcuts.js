/**
 * The keys of the app, listed once for the cheat sheet (ShortcutTables.vue) and the manual. The keys of the image
 * actions are not here: the sheet reads them from imageActions.js.
 *
 * Entries are {id, keys, label, scope, source}: keys is the text shown, scope where the key acts, source the file of
 * its handler (checked by tools/check_gestures.py). An entry with `match` ({codes, ctrl, shift}) is also what its
 * handler matches (matchesKey()), so the text and the key cannot part.
 */

export const KEY_SCOPES = [
  {id: "global", title: "Anywhere"},
  {id: "image", title: "Over an image card"},
  {id: "overlay", title: "In the image view"},
  {id: "compare", title: "Compare"}
];

const ENTER = ["Enter", "NumpadEnter"];

export const KEYS = [
  {
    id: "generate", keys: "Ctrl+Enter", label: "Generate, or stop the run", scope: "global",
    match: {codes: ENTER, ctrl: true, shift: false}, source: "generationKeys.js"
  },
  {
    id: "restart", keys: "Ctrl+Shift+Enter", label: "Stop and generate again", scope: "global",
    match: {codes: ENTER, ctrl: true, shift: true}, source: "generationKeys.js"
  },
  {
    id: "skip", keys: "Ctrl+Shift+Backspace", label: "Skip the image being generated", scope: "global",
    match: {codes: ["Backspace"], ctrl: true, shift: true}, source: "generationKeys.js"
  },
  {id: "save", keys: "Ctrl+S", label: "Save the project", scope: "global", source: "App.vue"},
  {id: "console", keys: "Ctrl+`", label: "Show or hide the console", scope: "global", source: "consoleDrawer.js"},
  {id: "clear", keys: "Shift+Del", label: "Clear the images of the view", scope: "global", source: "composables/useClearKey.js"},
  {id: "help", keys: "?", label: "This sheet", scope: "global", source: "shortcutSheet.js"},

  {id: "view", keys: "V", label: "View the image large", scope: "image", source: "composables/useImageActionKeys.js"},
  {id: "delete", keys: "Del", label: "Delete the image (Compare: remove it)", scope: "image",
    source: "composables/useImageActionKeys.js"},
  {id: "markings", keys: "1–9 · 0", label: "Set a marking · remove it", scope: "image",
    source: "composables/useImageActionKeys.js"},
  {id: "alt", keys: "Shift+key", label: "The alternative of an image action", scope: "image",
    source: "composables/useImageActionKeys.js"},

  {id: "navigate", keys: "← → · wheel", label: "Previous / next image", scope: "overlay", source: "components/ImageOverlay.vue"},
  {id: "ends", keys: "Home · End", label: "First / last image", scope: "overlay", source: "components/ImageOverlay.vue"},
  {id: "play", keys: "Space", label: "Play or pause a video", scope: "overlay", source: "components/MediaView.vue"},
  {id: "close", keys: "Esc", label: "Close the rim, then the view", scope: "overlay", source: "components/ImageOverlay.vue"},

  {id: "region", keys: "R", label: "Select a region", scope: "compare", source: "views/Compare.vue"},
  {id: "crops", keys: "X", label: "Show the crops of the region", scope: "compare", source: "views/Compare.vue"},
  {id: "reorder", keys: "← →", label: "Move the hovered image", scope: "compare", source: "views/Compare.vue"}
];

export function findKey(id) {
  return KEYS.find(entry => entry.id === id);
}

/**
 * Whether a keydown event is the key of an entry with `match` (Ctrl stands for Cmd too; Alt never matches)
 */
export function matchesKey(entry, e) {
  const {codes, ctrl = false, shift = false} = entry.match;

  return codes.includes(e.code) && !!(e.ctrlKey || e.metaKey) === ctrl && e.shiftKey === shift && !e.altKey;
}
