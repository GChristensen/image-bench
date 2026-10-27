<script setup>
/**
 * Project shown in the Projects tab: open/save actions, tags, the final image, the saved parameters (prompts,
 * generation parameters, ControlNet units, trays), and the images of its saved trays and of the project folder,
 * any of which may be made the final image
 */
import {computed, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import FileViewer from "@/components/projects/FileViewer.vue";
import MediaPlayback from "@/components/MediaPlayback.vue";
import {AUDIO_PLACEHOLDER, KIND_AUDIO, KIND_IMAGE, KIND_VIDEO, mediaKindOfName} from "@/media.js";
import ImageActionButtons from "@/components/ImageActionButtons.vue";
import {canPasteInfotext, copyInfotext, pasteInfotext} from "@/infotextClipboard.js";
import ParametersOverlay from "@/components/ParametersOverlay.vue";
import {canReuseParameters, reuseParameters, runImageAction, visibleActionGroups} from "@/imageActions.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import {baseName, fetchTray, formatSavedAt, PROJECT_TRAYS, projectFileUrl, trayImageUrl, useProjectsStore} from "@/stores/projects.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useCompareStore} from "@/stores/compare.js";
import {HOST_LABELS, summarizeParams} from "@/projectParams.js";
import {HOST, isComfy} from "@/host.js";
import {openContextMenu} from "@/contextMenu.js";
import {toastError} from "@/toast.js";
import {imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";
import {editorIcon, editorName, sendUrlToEditor} from "@/editor.js";
import {flashTrayTab} from "@/components/utils.js";
import {animateColors} from "@/utils_html.js";
import {startBlankWorkspace} from "@/workspace.js";

const props = defineProps({
  // All tags of the projects, offered when tagging
  allTags: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["filter-tag"]);

const store = useProjectsStore();
const compareStore = useCompareStore();

const project = computed(() => store.project);
const data = computed(() => project.value?.data ?? {});
const isCurrent = computed(() => !!project.value && project.value.path === store.current.path);
const parameters = computed(() => data.value.parameters ?? null);
const params = computed(() => parameters.value?.params ?? {});
const summary = computed(() => summarizeParams(params.value));
const units = computed(() => parameters.value?.controlnet?.units ?? []);
const otherHost = computed(() => data.value.host && data.value.host !== HOST);
// The name the project was saved under differs from its folder (renamed or copied outside Image Bench)
const nameMismatch = computed(() => !!data.value.name && data.value.name !== project.value?.name);
const folder = computed(() => project.value?.path.includes("/") ? project.value.path.slice(0, project.value.path.lastIndexOf("/")) : "");

const fileUrl = (name, options) => projectFileUrl(project.value.path, name, options);

const formatDate = formatSavedAt;

const changedTrays = computed(() => isCurrent.value
  ? PROJECT_TRAYS.filter(tray => store.current.trays?.[tray.kind]?.changed).map(tray => tray.label)
  : []);

// ---------- Actions ----------

function onOpenMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const position = {preventDefault() {}, clientX: rect.right - 300, clientY: rect.bottom + 4};
  const path = project.value.path;

  openContextMenu(position, [
    {icon: "upload", label: "Open: trays and parameters", run: () => store.open(path)},
    {icon: "tray", label: "Trays only", run: () => store.open(path, {params: false})},
    {icon: "sliders", label: "Parameters only", run: () => store.open(path, {trays: false})},
    {separator: true},
    {icon: "plus", label: "Merge trays into the workspace", run: () => store.open(path, {params: false, merge: true})}
  ]);
}

function onSaveMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const position = {preventDefault() {}, clientX: rect.right - 220, clientY: rect.bottom + 4};
  const path = project.value.path;

  openContextMenu(position, [
    {icon: "save", label: "Save as new project…", run: () => store.saveAs(path)}
  ]);
}

function onMoreMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const position = {preventDefault() {}, clientX: rect.right - 220, clientY: rect.bottom + 4};
  const path = project.value.path;
  const items = [
    {icon: "pencil", label: "Rename…", run: () => store.rename(path)},
    {icon: "trash", label: "Delete…", danger: true, run: () => store.remove({type: "project", path, name: project.value.name})}
  ];

  if (isCurrent.value)
    items.unshift({icon: "close", label: "Close project (keep the workspace)", run: () => store.close()},
                  {icon: "broom", label: "Close project and clear the workspace…", run: () => startBlankWorkspace()},
                  {separator: true});

  openContextMenu(position, items);
}

// ---------- Tags ----------

const tagInput = ref("");

function addTag() {
  const tags = tagInput.value.split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean);
  tagInput.value = "";

  if (tags.length)
    store.updateProject(project.value.path, {tags: [...(data.value.tags ?? []), ...tags]});
}

function removeTag(tag) {
  store.updateProject(project.value.path, {tags: (data.value.tags ?? []).filter(item => item !== tag)});
}

function onTagKeydown(e) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTag();
  }
  else if (e.key === "Backspace" && !tagInput.value && data.value.tags?.length)
    removeTag(data.value.tags.at(-1));
}

const tagSuggestions = computed(() => props.allTags.filter(tag => !(data.value.tags ?? []).includes(tag)));

// ---------- Notes ----------

const notes = ref("");

watch(() => [project.value?.path, data.value.notes], () => notes.value = data.value.notes ?? "", {immediate: true});

function saveNotes() {
  if (project.value && notes.value !== (data.value.notes ?? ""))
    store.updateProject(project.value.path, {notes: notes.value});
}

// ---------- Final image ----------

const finalUrl = computed(() => data.value.final ? fileUrl(data.value.final, {version: store.fileVersion}) : null);
// A video or audio final plays in its card (the only playable card of the project); a video shows its thumbnail
const finalKind = computed(() => data.value.final ? mediaKindOfName(data.value.final) : KIND_IMAGE);
const finalPreview = computed(() => finalKind.value === KIND_VIDEO
  ? fileUrl(data.value.final, {thumb: true, version: store.fileVersion})
  : finalKind.value === KIND_AUDIO ? AUDIO_PLACEHOLDER : finalUrl.value);
const dropActive = ref(false);

async function changeFinal() {
  const [file] = await pickImageFiles(false, {media: true});

  if (file)
    await store.setFinal(project.value.path, {file});
}

async function onFinalDrop(e) {
  dropActive.value = false;

  const [file] = await imageFilesFromDataTransfer(e.dataTransfer, {media: true});

  if (file)
    await store.setFinal(project.value.path, {file});
}

function onFinalDragOver(e) {
  if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list")) {
    e.preventDefault();
    dropActive.value = true;
  }
}

// ---------- Images: saved trays and files ----------

const IMAGE_TAB_KEY = "imageBench_libraryImageTab";
// Tabs of the image grid; the trays are those saved with the project
const IMAGE_TABS = [
  ...PROJECT_TRAYS.map(tray => ({id: tray.kind, label: tray.label})),
  {id: "files", label: "Files"}
];
const TRAY_KINDS = PROJECT_TRAYS.map(tray => tray.kind);

const storage = useLocalStorage();
// The tab chosen by the user, kept; without one, the first tab with images is shown
const chosenTab = ref(IMAGE_TABS.some(tab => tab.id === storage.getItem(IMAGE_TAB_KEY)) ? storage.getItem(IMAGE_TAB_KEY) : null);
const imageTab = computed(() => chosenTab.value ?? IMAGE_TABS.find(tab => tabCount(tab.id) > 0)?.id ?? IMAGE_TABS[0].id);
// Saved trays by kind: {images, version}, null while loading
const trays = ref({});

function chooseTab(id) {
  chosenTab.value = id;
  storage.setItem(IMAGE_TAB_KEY, id);
}

// Read again when another project is shown or the project is saved
watch(() => [project.value?.path, data.value.savedAt], async ([path]) => {
  trays.value = {};

  if (!path)
    return;

  for (const kind of TRAY_KINDS) {
    try {
      const tray = await fetchTray(path, kind);

      if (project.value?.path === path)
        trays.value = {...trays.value, [kind]: tray};
    } catch (error) {
      console.warn("[Image Bench] Unable to read the saved tray:", error);
    }
  }
}, {immediate: true});

const tabCount = id => id === "files" ? project.value?.files.length ?? 0 : trays.value[id]?.images.length ?? data.value.trays?.[id]?.count ?? 0;

// Label of the source of the final image ("image_tray:name.png" for a tray image)
const finalSourceLabel = computed(() => {
  const source = data.value.finalSource || "";
  const tray = IMAGE_TABS.find(tab => tab.id !== "files" && source.startsWith(tab.id + ":"));
  return tray ? `${tray.label} · ${source.slice(tray.id.length + 1)}` : source;
});

/**
 * Items of the image grid of the shown tab: {key, name, kind, url, thumb, marking, comment, title, final, image}
 * (kind: image, video or audio, which shows a placeholder; final: the source passed to setFinal; image: the image
 * of the image actions, with the generation parameters of a tray image)
 */
const gridItems = computed(() => {
  if (!project.value)
    return [];

  if (imageTab.value === "files")
    return files.value.map(file => mediaItem(file.name, {
      key: file.name, name: file.name, url: fileUrl(file.name),
      thumb: fileUrl(file.name, {thumb: true, version: file.modified}),
      title: [file.name, file.parameters?.prompt].filter(Boolean).join("\n\n"), final: {name: file.name},
      // The generation parameters read from the file (infotext, or the prompt of a ComfyUI image)
      image: {imageUrl: fileUrl(file.name), imagePath: baseName(file.name), parameters: file.parameters,
              projectFile: {project: project.value.path, name: file.name}}
    }));

  const tray = trays.value[imageTab.value];
  const kind = imageTab.value;

  return (tray?.images ?? []).map(image => {
    const url = trayImageUrl(project.value.path, kind, image.member, {version: tray.version});

    return mediaItem(image.name, {
      key: image.member, name: image.name, url,
      thumb: trayImageUrl(project.value.path, kind, image.member, {thumb: true, version: tray.version}),
      marking: image.marking, comment: image.comment,
      title: [image.name, image.comment, image.prompt].filter(Boolean).join("\n\n"),
      final: {kind, member: image.member},
      image: {imageUrl: url, imagePath: image.name, parameters: image.parameters, img2img: image.img2img,
              generationId: image.generationId, controlnet: image.controlnet}
    });
  });
});

// The kind of a grid item by its file name: audio has no thumbnail but the placeholder
function mediaItem(name, item) {
  const kind = mediaKindOfName(name);

  if (kind === KIND_IMAGE)
    return {...item, kind};

  return {...item, kind, thumb: kind === KIND_AUDIO ? AUDIO_PLACEHOLDER : item.thumb,
          image: {...item.image, mediaType: kind}};
}

// ---------- Image actions ----------

// Generation parameters, send to inpaint, ControlNet and the editor; the tray actions (Compare, trays) need
// the image file in the workspace, so the cards add to Compare by uploading
const CARD_ACTIONS = ["params", "inpaint", "controlnet", "editor"];

const shiftKey = useShiftKey();
const paramsImage = ref(null);

const actionContext = {
  kind: "project",
  isTray: false,
  upscalable: false,
  handlers: {showParams: image => paramsImage.value = image}
};

const actionGroups = (image, side) => visibleActionGroups(image, actionContext, side)
  .map(group => group.filter(action => CARD_ACTIONS.includes(action.id)))
  .filter(group => group.length);

function onImageAction(item, action, alt) {
  runImageAction(action, item.image, actionContext, alt);
}

// Prompts and all the parameters the host can set
const canReuseAll = item => canReuseParameters(item.image);

function reuseAll(item) {
  reuseParameters(item.image, true);
}

function onParamsKeydown(e) {
  if (paramsImage.value && (e.key === "Escape" || e.key === "Esc")) {
    e.preventDefault();
    paramsImage.value = null;
  }
}

watch(paramsImage, image => image
  ? document.addEventListener("keydown", onParamsKeydown)
  : document.removeEventListener("keydown", onParamsKeydown));

const emptyText = computed(() => imageTab.value === "files" ? "No image files in the project folder."
  : trays.value[imageTab.value] ? "No images in this tray of the saved project." : "Loading…");

const extensionOf = name => name.split(".").pop().toLowerCase().replace("jpeg", "jpg");
const fileFilter = ref("all");
const fileSort = ref("modified");

const extensions = computed(() => {
  const counts = new Map();

  for (const file of project.value?.files ?? [])
    counts.set(extensionOf(file.name), (counts.get(extensionOf(file.name)) ?? 0) + 1);

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});

const files = computed(() => {
  const list = (project.value?.files ?? []).filter(file => fileFilter.value === "all" || extensionOf(file.name) === fileFilter.value);

  return fileSort.value === "name"
    ? [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}))
    : list;
});

watch(() => project.value?.path, () => fileFilter.value = "all");

// Read the project again for the files added, changed or removed outside Image Bench
const refreshingFiles = ref(false);

async function refreshFiles() {
  refreshingFiles.value = true;

  try {
    await store.loadProject(project.value.path);
  } finally {
    refreshingFiles.value = false;
  }
}

const viewerIndex = ref(null);
const viewerFiles = ref([]);

// The viewer covers the tab bar, so its buttons flash as the tabs do to show that the action was taken
function flashButton(e) {
  animateColors(e.currentTarget, 0.7);
}

function viewFiles(list, index) {
  viewerFiles.value = list;
  viewerIndex.value = index;
}

function openItem(index) {
  viewFiles(gridItems.value.map(item => ({name: item.name, url: item.url, kind: item.kind, item})), index);
}

function openFinal() {
  if (finalUrl.value)
    viewFiles([{name: finalSourceLabel.value || "Final image", url: finalUrl.value, kind: finalKind.value}], 0);
}

async function addToCompare(url, name) {
  try {
    const blob = await (await fetch(url)).blob();
    const form = new FormData();
    form.append("file", blob, baseName(name).replace(/\.(psd|tiff?)$/i, ".png"));

    const result = await (await fetch("/image-bench/compare_upload", {method: "post", body: form})).json();

    if (result.error)
      throw new Error(result.error);

    await compareStore.addImage(result);
    flashTrayTab("compare-tab");
  } catch (error) {
    toastError(error.message, {title: "Add to compare"});
  }
}

// A new document, or a layer of the active document on a middle click or Shift+click
async function sendToEditor(url, name, e) {
  if (e && e.button !== 0 && e.button !== 1)
    return;

  const newLayer = !!e && (e.button === 1 || e.shiftKey);
  const error = await sendUrlToEditor(url, baseName(name), !newLayer);

  if (error)
    toastError(error, {title: editorName.value});
}

function onItemMenu(e, item) {
  // Compare and the editor take images only
  const still = item.kind === KIND_IMAGE;
  const items = [
    {icon: "star", label: "Set as the final image", run: () => store.setFinal(project.value.path, item.final)},
    ...still ? [
      {icon: "compare", label: "Add to compare", run: () => addToCompare(item.url, item.name)},
      {icon: editorIcon(), label: `Send to ${editorName.value} as a new document`, run: () => sendToEditor(item.url, item.name)},
      {icon: "layers", label: `Send to ${editorName.value} as a new layer`, run: () => sendToEditor(item.url, item.name, {button: 1})}
    ] : [],
    {separator: true},
    {icon: "external", label: "Open in new window", hint: "Middle-click", run: () => window.open(item.url, "_blank")},
    ...still ? [{icon: "params", label: "Copy infotext", run: () => copyInfotext(item.image)}] : [],
    ...canPasteInfotext(item.image, actionContext)
      ? [{icon: "paste", label: "Paste infotext…", run: () => pasteInfotext(item.image)}] : []
  ];

  // Files of the project folder only; the images of the saved trays are in their own folders
  if (imageTab.value === "files")
    items.push({separator: true},
      {icon: "trash", label: "Delete file…", danger: true, run: () => store.deleteFile(project.value.path, item.name)});

  openContextMenu(e, items);
}

function onItemAuxClick(e, item) {
  if (e.button === 1)
    window.open(item.url, "_blank");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The clipboard needs a secure context or a user gesture
  }
}

const unitLabel = unit => [unit.params.preprocessor, unit.params.model].filter(value => value && value !== "None").join(" · ")
  || "No preprocessor or model";

const unitDetails = unit => [
  unit.params.weight !== null && unit.params.weight !== undefined && `weight ${unit.params.weight}`,
  unit.params.guidanceStart !== undefined && unit.params.guidanceEnd !== undefined
    && `${unit.params.guidanceStart}–${unit.params.guidanceEnd}`,
  unit.mask && "mask",
  unit.pose && "edited pose"
].filter(Boolean).join(" · ");
</script>

<template>
  <div v-if="project" class="project-detail">
    <header class="header">
      <div class="title">
        <div class="breadcrumb">{{ folder ? folder.split("/").join(" / ") + " /" : "/" }}</div>
        <div class="name-line">
          <h2>{{ project.name }}</h2>
          <span class="host" :class="data.host">{{ HOST_LABELS[data.host] ?? "WebUI" }}</span>
          <span v-if="isCurrent" class="current-chip">Current</span>
        </div>
      </div>
      <div class="actions">
        <div class="buttons">
          <div class="split">
            <button class="btn" :class="isCurrent ? 'outline' : 'primary'" :disabled="!!store.busy"
                    :title="isCurrent ? 'Restore the saved trays and parameters' : 'Restore the trays and parameters of the project'"
                    @click="store.open(project.path)"><AppIcon name="upload" :size="14"/>{{ isCurrent ? "Revert" : "Open" }}</button>
            <button class="btn" :class="isCurrent ? 'outline' : 'primary'" :disabled="!!store.busy" aria-label="Open options"
                    title="Open the trays or the parameters only, or merge the trays"
                    @click="onOpenMenu"><AppIcon name="chevron" :size="14"/></button>
          </div>
          <div class="split">
            <button class="btn" :class="isCurrent ? 'primary' : 'outline'" :disabled="!!store.busy"
                    :title="isCurrent ? 'Save the workspace into the project (Ctrl+S)' : 'Save the workspace into this project'"
                    @click="store.saveInto(project.path)"><AppIcon name="save" :size="14"/>{{ isCurrent ? "Save" : "Save here" }}</button>
            <button class="btn" :class="isCurrent ? 'primary' : 'outline'" :disabled="!!store.busy" aria-label="Save options"
                    title="Save the workspace as a new project" @click="onSaveMenu"><AppIcon name="chevron" :size="14"/></button>
          </div>
          <button class="ib" aria-label="More project actions" @click="onMoreMenu"><AppIcon name="more" :size="14"/></button>
        </div>
        <div class="saved">
          <template v-if="data.savedAt">Saved {{ formatDate(data.savedAt) }}</template>
          <template v-else>Not saved yet</template>
          <span v-if="changedTrays.length" class="changed"> · {{ changedTrays.join(", ") }} changed</span>
        </div>
      </div>
    </header>

    <div v-if="nameMismatch" class="note warn">
      <AppIcon name="alert" :size="14"/>
      <span class="note-text">Saved as <b>{{ data.name }}</b>: the folder was renamed or copied outside Image Bench.
        If it is a copy, the trays and parameters are those of the original.</span>
      <button class="btn outline small" title="Take the folder name as the name of the project"
              @click="store.updateProject(project.path, {name: true})">Use the folder name</button>
    </div>

    <div v-if="otherHost" class="note">
      <AppIcon name="alert" :size="14"/>
      Saved in {{ HOST_LABELS[data.host] }}.
      <template v-if="isComfy">The parameters are mapped where ComfyUI has them.</template>
      <template v-else>The workflow is ignored here and the parameters are mapped where possible.</template>
      Skipped items are listed after opening.
    </div>

    <div class="tags">
      <AppIcon name="tag" :size="14" class="tags-icon"/>
      <span v-for="tag in data.tags ?? []" :key="tag" class="tag">
        <button class="tag-name" :title="`Show the projects tagged #${tag}`" @click="emit('filter-tag', tag)">#{{ tag }}</button>
        <button class="tag-remove" :aria-label="`Remove the tag ${tag}`" @click="removeTag(tag)"><AppIcon name="close" :size="10"/></button>
      </span>
      <input v-model="tagInput" class="tag-input" type="text" placeholder="Add tag…" aria-label="Add tag"
             list="library-tag-suggestions" @keydown="onTagKeydown" @change="addTag">
      <datalist id="library-tag-suggestions">
        <option v-for="tag in tagSuggestions" :key="tag" :value="tag"/>
      </datalist>
    </div>

    <div class="main">
      <section class="final" aria-label="Final image">
        <div class="final-image" :class="{drop: dropActive}" @dragover="onFinalDragOver" @dragleave="dropActive = false"
             @drop.prevent="onFinalDrop">
          <template v-if="finalUrl">
            <img :src="finalPreview" alt="Final image" @click="openFinal">
            <MediaPlayback v-if="finalKind !== KIND_IMAGE" :src="finalUrl" :kind="finalKind" @open="openFinal"/>
          </template>
          <div v-else class="final-empty">
            <AppIcon name="star" :size="22"/>
            <span>Drop the final image here, choose it, or set an image of the trays or files below as final.</span>
          </div>
          <span class="final-label label-small">Final</span>
        </div>
        <div class="final-bar">
          <span class="final-source" :title="finalSourceLabel">{{ finalSourceLabel }}</span>
          <button class="btn outline small" @click="changeFinal">Choose…</button>
          <button v-if="finalUrl && finalKind === KIND_IMAGE" class="ib sm" :title="`Left: send to ${editorName} as a new image, Middle/Shift: send to ${editorName} as a new layer`"
                  :aria-label="`Send the final image to ${editorName}`"
                  @click="sendToEditor(finalUrl, data.final, $event)" @mousedown.middle.prevent
                  @auxclick="sendToEditor(finalUrl, data.final, $event)"><AppIcon :name="editorIcon()" :size="13"/></button>
          <button v-if="finalUrl" class="ib sm danger" title="Remove the final image" aria-label="Remove the final image"
                  @click="store.setFinal(project.path)"><AppIcon name="close" :size="13"/></button>
        </div>
      </section>

      <section class="parameters" aria-label="Parameters">
        <div class="section-head">
          <span class="label-small">Parameters</span>
          <span v-if="parameters" class="muted">snapshot at the last save · {{ parameters.mode }}</span>
          <span class="spacer"></span>
          <button v-if="parameters" class="btn outline small" :disabled="!!store.busy"
                  title="Restore the saved parameters of the Generate and ControlNet tabs; the trays stay as they are"
                  @click="store.open(project.path, {trays: false})">Apply to Generate</button>
        </div>

        <p v-if="!parameters" class="muted empty-params">
          Not saved yet. Saving the workspace into the project keeps its trays and the parameters of the Generate
          and ControlNet tabs.
        </p>
        <template v-else>
          <div class="prompts">
            <div class="prompt">
              <span class="prompt-text">{{ params.prompt || "No prompt" }}</span>
              <button class="ib flat sm" title="Copy the prompt" aria-label="Copy the prompt" @click="copyText(params.prompt ?? '')"
                ><AppIcon name="copy" :size="12"/></button>
            </div>
            <div v-if="params.negativePrompt" class="prompt negative">
              <span class="prompt-text"><span class="muted">Negative </span>{{ params.negativePrompt }}</span>
              <button class="ib flat sm" title="Copy the negative prompt" aria-label="Copy the negative prompt"
                      @click="copyText(params.negativePrompt)"><AppIcon name="copy" :size="12"/></button>
            </div>
          </div>

          <dl class="summary">
            <div v-for="[label, value] in summary" :key="label" :class="{wide: value.length > 24}">
              <dt>{{ label }}</dt>
              <dd :title="value">{{ value }}</dd>
            </div>
          </dl>

          <div v-if="units.length" class="units">
            <span class="label-small">ControlNet</span>
            <div v-for="unit in units" :key="unit.index" class="unit">
              <span class="unit-index">{{ unit.index + 1 }}</span>
              <img v-if="unit.image" :src="fileUrl(`ib_project/${unit.image}`, {version: data.savedAt})" alt="" loading="lazy">
              <span v-else class="unit-thumb"></span>
              <div class="unit-text">
                <span class="unit-label">{{ unitLabel(unit) }}</span>
                <span class="muted">{{ unitDetails(unit) }}</span>
              </div>
            </div>
          </div>
        </template>

        <label class="notes">
          <span class="label-small">Notes</span>
          <textarea v-model="notes" rows="2" placeholder="Notes on the project" spellcheck="false" @blur="saveNotes"></textarea>
        </label>
      </section>
    </div>

    <section class="files" aria-label="Project images">
      <div class="section-head">
        <div class="image-tabs" role="tablist" aria-label="Images of the project">
          <button v-for="tab in IMAGE_TABS" :key="tab.id" role="tab" class="image-tab" :class="{on: imageTab === tab.id}"
                  :aria-selected="imageTab === tab.id" @click="chooseTab(tab.id)"
            >{{ tab.label }}<span class="count">{{ tabCount(tab.id) }}</span></button>
        </div>
        <span v-if="imageTab !== 'files'" class="muted">saved</span>
        <span class="spacer"></span>
        <div v-if="imageTab === 'files' && extensions.length > 1" class="file-filters">
          <button class="filter" :class="{on: fileFilter === 'all'}" @click="fileFilter = 'all'">All</button>
          <button v-for="[ext, count] in extensions" :key="ext" class="filter" :class="{on: fileFilter === ext}"
                  @click="fileFilter = ext">{{ ext.toUpperCase() }} <span>{{ count }}</span></button>
        </div>
        <div v-if="imageTab === 'files'" class="select-wrap sort">
          <select v-model="fileSort" aria-label="Sort the files">
            <option value="modified">Modified</option>
            <option value="name">Name</option>
          </select>
          <AppIcon name="chevron" :size="14"/>
        </div>
        <button v-if="imageTab === 'files'" class="ib sm" title="Refresh the files of the project folder"
                aria-label="Refresh the files" :disabled="refreshingFiles" @click="refreshFiles"
          ><AppIcon name="refresh" :size="13"/></button>
      </div>
      <div v-if="gridItems.length" class="file-grid">
        <div v-for="(item, index) in gridItems" :key="item.key" class="file" :title="item.title"
             @click="openItem(index)" @mousedown.middle.prevent @auxclick="e => onItemAuxClick(e, item)"
             @contextmenu.prevent="e => onItemMenu(e, item)">
          <div class="file-image">
            <img :src="item.thumb" alt="" loading="lazy" draggable="false">
            <span v-if="item.kind !== KIND_IMAGE" class="file-kind" :title="item.kind === KIND_VIDEO ? 'Video' : 'Audio'"
              ><AppIcon :name="item.kind" :size="12"/></span>
            <span v-if="item.marking" class="file-marking">{{ item.marking }}</span>
            <div class="file-actions left" @click.stop>
              <ImageActionButtons :groups="actionGroups(item.image, 'left')" :show-alt="shiftKey"
                                  @run="(action, alt) => onImageAction(item, action, alt)"/>
            </div>
            <div class="file-actions right" @click.stop>
              <button v-if="canReuseAll(item)" class="ib sm" title="Reuse the prompts and all parameters"
                      aria-label="Reuse the prompts and all parameters" @click="reuseAll(item)"
                ><AppIcon name="sliders" :size="12"/></button>
              <button class="ib sm" title="Set as the final image" aria-label="Set as the final image"
                      @click="store.setFinal(project.path, item.final)"><AppIcon name="star" :size="12"/></button>
            </div>
            <div class="file-actions bottom" @click.stop>
              <button v-if="item.kind === KIND_IMAGE" class="ib sm" title="Add to compare" aria-label="Add to compare"
                      @click="addToCompare(item.url, item.name)"><AppIcon name="compare" :size="12"/></button>
              <ImageActionButtons :groups="actionGroups(item.image, 'right')" :show-alt="shiftKey"
                                  @run="(action, alt) => onImageAction(item, action, alt)"/>
            </div>
          </div>
          <span class="file-name">{{ baseName(item.name) }}</span>
        </div>
      </div>
      <p v-else class="muted">{{ emptyText }}</p>
    </section>

    <FileViewer v-if="viewerIndex !== null" v-model:index="viewerIndex" :files="viewerFiles" :paused="!!paramsImage"
                @close="viewerIndex = null">
      <!-- The buttons of the cards in one row: parameters | final | compare and send -->
      <template #actions="{file}">
        <template v-if="file?.item">
          <ImageActionButtons :groups="actionGroups(file.item.image, 'left')" :show-alt="shiftKey" flash
                              @run="(action, alt) => onImageAction(file.item, action, alt)"/>
          <button v-if="canReuseAll(file.item)" class="ib sm viewer-button" title="Reuse the prompts and all parameters"
                  aria-label="Reuse the prompts and all parameters" @click="flashButton($event); reuseAll(file.item)"
            ><AppIcon name="sliders" :size="13"/></button>
          <span v-if="file.item.image.parameters" class="viewer-sep"></span>
          <button class="ib sm viewer-button" title="Set as the final image" aria-label="Set as the final image"
                  @click="flashButton($event); store.setFinal(project.path, file.item.final)"
            ><AppIcon name="star" :size="13"/></button>
          <span v-if="file.item.kind === KIND_IMAGE" class="viewer-sep"></span>
          <button v-if="file.item.kind === KIND_IMAGE" class="ib sm viewer-button" title="Add to compare" aria-label="Add to compare"
                  @click="flashButton($event); addToCompare(file.item.url, file.item.name)"
            ><AppIcon name="compare" :size="13"/></button>
          <ImageActionButtons :groups="actionGroups(file.item.image, 'right')" :show-alt="shiftKey" flash
                              @run="(action, alt) => onImageAction(file.item, action, alt)"/>
        </template>
      </template>
    </FileViewer>
    <ParametersOverlay v-if="paramsImage" :image="paramsImage"
                       @hide-overlay="paramsImage = null"/>
  </div>
  <div v-else-if="store.projectError" class="placeholder">{{ store.projectError }}</div>
  <div v-else class="placeholder">
    <AppIcon name="box" :size="26"/>
    <p>Select a project in the tree, or create one: it keeps the trays and the parameters of the workspace.</p>
  </div>
</template>

<style scoped>
.project-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  max-width: 360px;
  margin: 0;
}

.muted {
  color: var(--ib-muted);
  font-size: 11.5px;
}

.spacer {
  flex: 1;
}

/* ---------- Header ---------- */

.header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.title {
  flex: 1;
  min-width: 0;
}

.breadcrumb {
  color: var(--ib-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

h2 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 19px;
  font-weight: 600;
}

.host {
  padding: 0 6px;
  border: 1px solid rgba(90, 169, 255, 0.45);
  border-radius: 3px;
  color: var(--ib-info);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 16px;
  text-transform: uppercase;
}

.host.comfy {
  border-color: rgba(196, 166, 255, 0.45);
  color: #c4a6ff;
}

.current-chip {
  padding: 0 7px;
  border: 1px solid var(--ib-accent-border);
  border-radius: 9px;
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
  font-size: 11px;
  line-height: 16px;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.buttons {
  display: flex;
  gap: 6px;
}

.split {
  display: flex;
}

.split .btn:first-child {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.split .btn:last-child {
  padding: 0 5px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid rgba(0, 0, 0, 0.25);
}

.split .btn.outline:last-child {
  border-left-color: var(--ib-border);
}

.saved {
  color: var(--ib-muted);
  font-size: 11.5px;
}

.changed {
  color: var(--ib-warn);
}

.note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(196, 166, 255, 0.35);
  border-radius: 6px;
  background: rgba(196, 166, 255, 0.07);
  font-size: 12.5px;
}

.note .app-icon {
  color: #c4a6ff;
}

.note.warn {
  border-color: rgba(240, 164, 49, 0.45);
  background: rgba(240, 164, 49, 0.07);
}

.note.warn .app-icon {
  color: var(--ib-warn);
}

.note-text {
  flex: 1;
}

/* ---------- Tags ---------- */

.tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.tags-icon {
  color: var(--ib-muted);
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  border-radius: 11px;
  background: var(--ib-elev-2);
}

.tag-name,
.tag-remove {
  height: 100%;
  border: 0;
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.tag-name {
  padding: 0 4px 0 9px;
}

.tag-name:hover {
  color: var(--ib-accent);
}

.tag-remove {
  display: flex;
  align-items: center;
  padding: 0 7px 0 3px;
  color: var(--ib-muted);
}

.tag-remove:hover {
  color: var(--ib-danger-text);
}

.tag-input {
  width: 120px;
  height: 22px;
  padding: 0 9px;
  border: 1px dashed var(--ib-border-2);
  border-radius: 11px;
  background: none;
  color: var(--ib-text);
  font: inherit;
  font-size: 12px;
  outline: none;
}

.tag-input:focus {
  border-style: solid;
  border-color: var(--ib-accent-border);
}

/* ---------- Final image and parameters ---------- */

.main {
  display: grid;
  grid-template-columns: minmax(200px, 300px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.final {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.final-image {
  position: relative;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  overflow: hidden;
}

.final-image.drop {
  border-color: var(--ib-accent);
  box-shadow: inset 0 0 0 1px var(--ib-accent);
}

.final-image img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  cursor: zoom-in;
}

.final-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: var(--ib-muted);
  font-size: 12px;
  text-align: center;
}

.final-label {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(17, 19, 23, 0.75);
  color: var(--ib-text);
}

.final-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.final-source {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 11px;
}

.parameters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.empty-params {
  margin: 0;
  line-height: 1.5;
}

.prompts {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.prompt {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 6px 7px 10px;
}

.prompt + .prompt {
  border-top: 1px solid var(--ib-border);
}

.prompt-text {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  overflow-y: auto;
  font-size: 12.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.prompt.negative .prompt-text {
  color: var(--ib-text-2);
}

.summary {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px 14px;
}

.summary div {
  min-width: 0;
}

.summary .wide {
  grid-column: span 2;
}

.summary dt {
  color: var(--ib-muted);
  font-size: 11px;
}

.summary dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.units {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.unit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.unit-index {
  color: var(--ib-muted);
  font-family: var(--ib-mono);
  font-size: 12px;
}

.unit img,
.unit-thumb {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 1px solid var(--ib-border-2);
  border-radius: 3px;
  background: #0d0e10;
  object-fit: cover;
}

.unit-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.unit-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notes textarea {
  resize: vertical;
  min-height: 44px;
  padding: 6px 9px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
  color: var(--ib-text);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.45;
  outline: none;
}

.notes textarea:focus {
  border-color: var(--ib-accent-border);
}

/* ---------- Files ---------- */

.files {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-filters {
  display: flex;
  gap: 4px;
}

.filter {
  height: 20px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--ib-elev-2);
  color: var(--ib-text-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.filter span {
  color: var(--ib-muted);
}

.filter.on {
  border-color: var(--ib-accent-border);
  background: var(--ib-accent-soft);
  color: var(--ib-accent);
}

.sort {
  flex: none;
  width: 110px;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.viewer-button {
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.viewer-sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.25);
}

.file-image {
  position: relative;
}

.file {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  cursor: zoom-in;
}

.file img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--ib-surface);
  object-fit: cover;
}

.file:hover img {
  outline: 1px solid var(--ib-border-2);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-text-2);
  font-family: var(--ib-mono);
  font-size: 10.5px;
}

.image-tabs {
  display: flex;
  gap: 14px;
}

.image-tab {
  height: 24px;
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ib-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.image-tab:hover {
  color: var(--ib-text-2);
}

.image-tab.on {
  border-bottom-color: var(--ib-accent);
  color: var(--ib-text);
}

/* Video or audio: the thumbnail or placeholder does not play here (only the final image does) */
.file-kind {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  padding: 2px 4px;
  border-radius: 3px;
  background: rgba(17, 19, 23, 0.75);
  color: var(--ib-text);
}

.file:hover .file-kind {
  display: none;
}

.file-marking {
  position: absolute;
  bottom: 6px;
  left: 4px;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(17, 19, 23, 0.75);
  font-size: 12px;
  line-height: 18px;
}

.file-actions {
  position: absolute;
  display: none;
  gap: 3px;
}

.file-actions.left {
  top: 4px;
  left: 4px;
}

.file-actions.right {
  top: 4px;
  right: 4px;
}

.file-actions.bottom {
  bottom: 6px;
  right: 4px;
}

.file:hover .file-actions {
  display: flex;
}

.file-actions.right .ib,
.file-actions.bottom > .ib {
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}
</style>
