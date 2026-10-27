import {defineStore} from "pinia";
import {ref, watch} from "vue";
import {isComfy} from "@/host.js";

/**
 * Chapters of the manual, in the order of the text: the id of a chapter is that of its element (manual-<id>) in
 * ManualViewer.vue, the icon that of its row in the contents of the Library
 */
export const MANUAL_SECTIONS = [
  {id: "overview", title: "What it is for", icon: "help"},
  {id: "window", title: "The window", icon: "fit"},
  {id: "input", title: "Mouse and keys", icon: "help"},
  {id: "workflow", title: "Typical workflow", icon: "steps"},
  {id: "images", title: "Working with images", icon: "layers"},
  {id: "generate", title: "Generate", icon: "generate"},
  {id: "controlnet", title: "ControlNet", icon: "controlnet"},
  {id: "explore", title: "Explore", icon: "flask"},
  {id: "generated", title: "Generated", icon: "images"},
  {id: "compare", title: "Compare", icon: "compare"},
  {id: "trays", title: "Concept & image trays", icon: "palette"},
  {id: "upscaled", title: "Upscaled", icon: "upscale"},
  {id: "library", title: "Library", icon: "library", children: [
    {id: "library-docs", title: "Docs", icon: "book"},
    {id: "library-snippets", title: "Snippets", icon: "snippet"},
    {id: "library-manual", title: "Manual", icon: "help"},
  ]},
  {id: "projects", title: "Projects", icon: "box"},
  {id: "settings", title: "Settings & actions", icon: "settings"},
  {id: "editors", title: "Editors", icon: "layers", children: [
    {id: "editor-photoshop", title: "Photoshop", icon: "photoshop"},
    {id: "photoshop-canny", title: "Canny Edges plugin", icon: "controlnet"},
    {id: "editor-krita", title: "Krita", icon: "krita"},
    {id: "editor-gimp", title: "GIMP", icon: "gimp"},
  ]},
  ...(isComfy ? [{id: "comfy-setup", title: "ComfyUI setup", icon: "puzzle", children: [
    {id: "comfy-markers", title: "Markers in detail", icon: "tag"},
    {id: "comfy-prompt", title: "Image Bench Prompt node", icon: "pencil"},
    {id: "comfy-params", title: "Generation parameters", icon: "sliders"},
    {id: "comfy-images", title: "Input images & inpainting", icon: "brush"},
    {id: "comfy-references", title: "References", icon: "images"},
    {id: "comfy-controlnet", title: "ControlNet units", icon: "controlnet"},
    {id: "comfy-subgraphs", title: "Subgraphs", icon: "box"},
    {id: "comfy-files", title: "Files written", icon: "folder"},
  ]}] : []),
  {id: "shortcuts", title: "Keyboard & mouse", icon: "zap"},
];

const SCROLL_KEY = "imageBench_manualScrollTop";

function readScrollTop() {
  try {
    return Number(sessionStorage.getItem(SCROLL_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Manual section of the Library: the contents (ManualBrowser.vue) and the text (ManualViewer.vue) share the
 * chapter being read and the chapter to scroll to
 */
export const useManualStore = defineStore("manual", () => {
  // Chapter at the top of the text
  const active = ref(MANUAL_SECTIONS[0].id);
  // Chapter to scroll to, a new object per request
  const target = ref(null);
  // Scroll position of the text, kept for the browser session (reloads of the window, not browser restarts)
  const scrollTop = ref(readScrollTop());
  watch(scrollTop, value => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(value)));
    } catch {
      // Storage unavailable: the position is kept in memory only
    }
  });
  // The Library is asked to show the manual; cleared by the Library
  const revealed = ref(false);
  // The manual has been shown in this session
  const opened = ref(false);

  function goTo(id) {
    target.value = {id};
  }

  /**
   * Show the manual in the Library, at a chapter if given (the router is switched by the caller)
   * @param {string} [id]
   */
  function reveal(id) {
    revealed.value = true;

    if (id)
      goTo(id);
  }

  return {active, target, scrollTop, revealed, opened, goTo, reveal};
});