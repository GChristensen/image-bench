/**
 * The mouse grammar: what a middle click and Shift+click do, by what is under the pointer. Listed once for the
 * cheat sheet (ShortcutTables.vue) and the manual; tools/check_gestures.py fails on a file with a middle click or a
 * Shift+click handler that no `source` here (or in shortcuts.js) names.
 *
 *   Control (button, rim sector, tree item): middle = Shift+click = the alternative of its action
 *   Image (card, image view, Compare, project file): click opens it, middle toggles its action rim
 *   Tab or chip (tab bar, marking badge): middle acts on it without going there
 *
 * A new gesture follows its clause; one that cannot is added to EXCEPTIONS.
 */

export const CLAUSES = [
  {id: "control", title: "Buttons", rule: "Middle click or Shift+click: the alternative of the action"},
  {id: "image", title: "Images", rule: "Click: view it · Middle click: its action rim"},
  {id: "tab", title: "Tabs and badges", rule: "Middle click: act on it without going there"}
];

export const GESTURES = [
  {clause: "control", target: "Rim sector, image action button", does: "The alternative, e.g. send as a new layer",
    source: ["components/ActionRim.vue", "components/ImageActionButtons.vue", "imageActions.js"]},
  {clause: "control", target: "Stop (while generating)", does: "Stop and generate again (Ctrl+click too)",
    source: ["views/Generate.vue", "components/RunControl.vue"]},
  {clause: "control", target: "Clear", does: "Choose which images to remove", source: ["components/ClearButton.vue"]},
  {clause: "control", target: "LoRA info", does: "Open its Civitai page", source: ["views/Generate.vue"]},
  {clause: "control", target: "Copy tab of the prompts", does: "Copy the prompt and the negative prompt, without the menu",
    source: ["views/Generate.vue"]},
  {clause: "control", target: "Send to the editor", does: "As a new layer",
    source: ["views/ControlNet.vue", "components/projects/ProjectDetail.vue"]},
  {clause: "control", target: "Snippet", does: "Insert only the part of this prompt",
    source: ["components/generate/SnippetsPanel.vue", "components/TreeView.vue"]},
  {clause: "control", target: "Rim center", does: "Show only this marking (middle click)",
    source: ["components/ActionRim.vue"]},

  {clause: "image", target: "Image card, Generate result", does: "Toggle the action rim (with rim on hover: hide it)",
    source: ["components/GeneratedImage.vue", "components/GenerateImageCell.vue", "components/MediaPlayback.vue"]},
  {clause: "image", target: "Session filmstrip image", does: "Toggle the action rim (over its neighbors)",
    source: ["components/generate/SessionStrip.vue"]},
  {clause: "image", target: "Image view", does: "Press: the rim at the pointer, release on a sector to run it",
    source: ["components/ImageOverlay.vue"]},
  {clause: "image", target: "Compare image, crop", does: "Toggle the action rim (Ctrl held shows it too)",
    source: ["views/Compare.vue", "components/compare/CompareItem.vue", "components/compare/CropGrid.vue"]},
  {clause: "image", target: "Project file", does: "Toggle the action rim (or its corner button)",
    source: ["components/projects/ProjectDetail.vue"]},
  {clause: "image", target: "Project file view", does: "Press: the rim at the pointer, as in the image view",
    source: ["components/projects/FileViewer.vue"]},

  {clause: "tab", target: "Tab of a run", does: "Stop the run (Shift+click too)", source: ["App.vue"]},
  {clause: "tab", target: "Host tab", does: "Show or hide the console (Shift+click too)", source: ["App.vue"]},
  {clause: "tab", target: "Marking badge", does: "Remove the marking",
    source: ["components/GeneratedImage.vue", "components/compare/CompareChrome.vue"]}
];

export const EXCEPTIONS = [
  {target: "ControlNet sweep cell", does: "Middle click opens the image in a new window (no rim)",
    source: ["components/GeneratedImage.vue"]}
];

/**
 * Title of a control with an alternative: the label, then the alternative on its own line
 * @param {string} label
 * @param {string} alt - What a middle click or Shift+click does
 */
export function gestureTitle(label, alt) {
  return alt ? `${label}\nMiddle or Shift+click: ${alt}` : label;
}
