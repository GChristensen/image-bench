import {defineStore} from "pinia";
import {computed, ref, watch} from "vue";
import {dialog} from "@/dialogs/useDialog.js";
import {requestHost} from "@/hostRequest.js";
import {ensureGenerationIdle} from "@/sdwebui.js";
import {HOST, isComfy} from "@/host.js";
import {KIND_COMPARE, KIND_CONCEPT_TRAY, KIND_IMAGE_TRAY} from "@/consts.js";
import {fetchRestoreChoices, HOST_LABELS, loadUnitFiles, prepareRestore, snapshotToSave} from "@/projectParams.js";
import {onTrayPersisted} from "@/stores/composables/useTrayStoreState.js";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useCompareStore} from "@/stores/compare.js";
import {usePromptHistoryStore} from "@/stores/promptHistory.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

// Trays saved into a project (projects.TRAY_KINDS of the backend)
export const PROJECT_TRAYS = [
  {kind: KIND_IMAGE_TRAY, label: "Image tray"},
  {kind: KIND_CONCEPT_TRAY, label: "Concept tray"},
  {kind: KIND_COMPARE, label: "Compare"}
];

const SELECTED_KEY = "imageBench_librarySelectedProject";
const RECENT_KEY = "imageBench_recentProjects";
// Projects listed by the context menu of the project chip
const RECENT_SIZE = 8;
const STATUS_DELAY = 300;
const CAPTURE_TIMEOUT = 30000;
const RESTORE_TIMEOUT = 180000;

/**
 * Call an action of /image-bench/projects
 * @param {string} action
 * @param {Object} args - Query of a GET, JSON body of a POST
 * @param {{method?: string, form?: FormData}} options
 * @returns {Promise<Object>}
 * @throws {Error} With the message of the backend
 */
async function call(action, args = {}, {method = "POST", form = null} = {}) {
  const query = method === "GET" ? "?" + new URLSearchParams(args) : "";
  const response = await fetch(`/image-bench/projects/${action}${query}`, {
    method,
    // The answers change with the folders; never from the browser cache
    cache: "no-store",
    body: method === "GET" ? undefined : form ?? JSON.stringify(args),
    headers: method === "GET" || form ? undefined : {"Content-Type": "application/json"}
  });

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
 * URL of a file of a project directory (also of its ib_project directory)
 * @param {string} path - Project path relative to the root
 * @param {string} name - File path relative to the project directory
 * @param {{thumb?: boolean, version?: any}} options
 * @returns {string}
 */
export function projectFileUrl(path, name, {thumb = false, version = null} = {}) {
  const params = new URLSearchParams({path, name});

  if (thumb)
    params.set("thumb", "1");

  if (version !== null)
    params.set("v", version);

  return `/image-bench/projects/file?${params}`;
}

/**
 * URL of an image of a saved tray of a project
 * @param {string} path - Project path relative to the root
 * @param {string} kind - image_tray or concept_tray
 * @param {string} member - Path of the image in the saved tray folder (images/<name>)
 * @param {{thumb?: boolean, version?: any}} options
 * @returns {string}
 */
export function trayImageUrl(path, kind, member, {thumb = false, version = null} = {}) {
  const params = new URLSearchParams({path, kind, member});

  if (thumb)
    params.set("thumb", "1");

  if (version !== null)
    params.set("v", version);

  return `/image-bench/projects/tray_image?${params}`;
}

/**
 * Images of a saved tray of a project
 * @returns {Promise<{kind: string, images: {member, name, marking, comment, prompt}[], version: number|null}>}
 */
export function fetchTray(path, kind) {
  return call("tray", {path, kind}, {method: "GET"});
}

/**
 * Last component of a path relative to the root
 * @param {string} path
 * @returns {string}
 */
export const baseName = path => String(path ?? "").split("/").pop();

/**
 * Projects of the Projects tab: the directory tree under the project root, the project shown in the tab, the recent
 * projects and the current project, into which the workspace (the trays, the Generate and ControlNet parameters)
 * is saved. The backend keeps the current project (store/current_project.json) with the state of the trays at the
 * last save, from which it tells the unsaved changes.
 */
export const useProjectsStore = defineStore("projects", () => {
  const storage = useLocalStorage();

  // {root, exists, nodes, trash}, null until loaded
  const tree = ref(null);
  const treeLoading = ref(false);
  const treeError = ref(null);
  // {path: null} or {path, name, exists, savedAt, trays: {kind: {workspace, saved, changed}}, changed}
  const current = ref({path: null});
  const selectedPath = ref(storage.getItem(SELECTED_KEY));
  // Project shown in the Projects tab: {path, name, data, files, trays}
  const project = ref(null);
  const projectError = ref(null);
  // What the store is busy with ("Saving…", "Opening…"), null if idle
  const busy = ref(null);
  // Changes with each change of the final image, against cached images
  const fileVersion = ref(Date.now());
  // Paths of the projects that were current, newest first
  const recent = ref(readRecent());

  const hasCurrent = computed(() => current.value.path !== null && current.value.path !== undefined);
  const unsaved = computed(() => !!current.value.changed);

  const trayStores = () => [useImageTrayStore(), useConceptTrayStore(), useCompareStore()];

  // ---------- Recent projects ----------

  function readRecent() {
    try {
      const paths = JSON.parse(storage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(paths) ? paths.filter(path => typeof path === "string") : [];
    } catch {
      return [];
    }
  }

  function setRecent(paths) {
    recent.value = [...new Set(paths)].slice(0, RECENT_SIZE);
    storage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  }

  watch(() => current.value.path, path => {
    if (path)
      setRecent([path, ...recent.value]);
  });

  // ---------- Loading ----------

  async function loadCurrent() {
    try {
      current.value = await call("current", {}, {method: "GET"});
    } catch (error) {
      console.warn("[Image Bench] Unable to read the current project:", error);
    }
  }

  let statusTimer = null;

  function refreshStatus() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => hasCurrent.value && loadCurrent(), STATUS_DELAY);
  }

  onTrayPersisted(kind => {
    if (PROJECT_TRAYS.some(tray => tray.kind === kind))
      refreshStatus();
  });

  async function loadTree() {
    treeLoading.value = true;
    treeError.value = null;

    try {
      tree.value = await call("tree", {}, {method: "GET"});

      // Projects deleted or moved outside of Image Bench leave the recent list
      if (tree.value.exists !== false)
        setRecent(recent.value.filter(path => findNode(tree.value.nodes ?? [], path)?.type === "project"));
    } catch (error) {
      treeError.value = error.message;
    } finally {
      treeLoading.value = false;
    }
  }

  async function select(path) {
    selectedPath.value = path;
    storage.setItem(SELECTED_KEY, path ?? "");

    if (!path) {
      project.value = null;
      return;
    }

    await loadProject(path);
  }

  async function loadProject(path = selectedPath.value) {
    projectError.value = null;

    try {
      const result = await call("project", {path}, {method: "GET"});

      if (selectedPath.value === path)
        project.value = result;
    } catch (error) {
      if (selectedPath.value === path) {
        project.value = null;
        projectError.value = error.message;
      }
    }
  }

  /**
   * Show changed metadata in the tree without reading it again
   */
  function updateTreeNode(info) {
    const node = findNode(tree.value?.nodes ?? [], info.path);

    if (node?.project)
      Object.assign(node.project, {
        name: info.data.name ?? null,
        tags: info.data.tags ?? [],
        final: info.data.final ?? null,
        prompt: info.data.parameters?.params?.prompt ?? "",
        negativePrompt: info.data.parameters?.params?.negativePrompt ?? "",
        host: info.data.host,
        savedAt: info.data.savedAt
      });
  }

  function findNode(nodes, path) {
    for (const node of nodes) {
      if (node.path === path)
        return node;

      const found = node.children && findNode(node.children, path);

      if (found)
        return found;
    }

    return null;
  }

  function showProject(info) {
    if (selectedPath.value === info.path)
      project.value = info;

    updateTreeNode(info);
  }

  async function run(label, operation) {
    busy.value = label;

    try {
      return await operation();
    } catch (error) {
      await dialog.alert(error.message, {title: "Projects"});
      return null;
    } finally {
      busy.value = null;
    }
  }

  const flushTrays = () => Promise.all(trayStores().map(store => store.flush()));

  // ---------- Save ----------

  /**
   * Save the workspace into a project and make it current
   * @param {string} path - The current project by default
   * @returns {Promise<boolean>} Whether it was saved
   */
  async function save(path = current.value.path) {
    if (path === null || path === undefined)
      return false;

    const result = await run("Saving…", async () => {
      await flushTrays();
      await usePromptHistoryStore().flush();

      const snapshot = await requestHost({type: "PROJECT_CAPTURE"}, CAPTURE_TIMEOUT);
      const {parameters, workflow, files} = snapshotToSave(snapshot);
      const form = new FormData();

      // A file part: the workflow may exceed the size limit of form fields
      form.append("data", new Blob([JSON.stringify({path, snapshot: {parameters, workflow}})], {type: "application/json"}), "data.json");
      files.forEach(file => form.append(file.name, file.blob, file.name));

      return call("save", {}, {form});
    });

    if (!result)
      return false;

    current.value = result.current;
    showProject(result.project);
    return true;
  }

  /**
   * Save the workspace into another project, which becomes current, after a confirmation
   */
  async function saveInto(path) {
    if (path === current.value.path)
      return save(path);

    if (!await dialog.confirm(`Overwrite the trays and parameters of "${baseName(path)}" with the workspace?`,
        {title: "Save workspace here", okText: "Save", danger: true}))
      return false;

    return save(path);
  }

  /**
   * Save the workspace into a new project next to a project, which becomes current
   * @param {string} path
   * @returns {Promise<boolean>} Whether it was saved
   */
  async function saveAs(path) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const name = await dialog.prompt(`Save the workspace as a new project in ${folderLabel(parent)}:`, {
      title: "Save as",
      defaultValue: `${baseName(path)} copy`,
      placeholder: "Project name",
      okText: "Save"
    });

    if (!name)
      return false;

    const result = await run("Creating…", () => call("create_project", {path: parent, name}));

    if (!result)
      return false;

    await loadTree();
    await select(result.path);
    return save(result.path);
  }

  // ---------- Open ----------

  /**
   * Ask what to do with the unsaved changes of the current project before the workspace is replaced
   * @param {string} target - Name of the project opened
   * @returns {Promise<boolean>} Whether to go on
   */
  async function confirmLeave(target) {
    await flushTrays();
    await loadCurrent();

    if (!hasCurrent.value || !current.value.changed)
      return true;

    const lines = PROJECT_TRAYS
      .filter(tray => current.value.trays?.[tray.kind]?.changed)
      .map(tray => {
        const {workspace, saved} = current.value.trays[tray.kind];
        return `• ${tray.label}: ${workspace} in the workspace, ${saved} saved`;
      });

    const answer = await dialog.confirm(
      `These trays changed since the last save:\n${lines.join("\n")}\n\n`
        + `Opening "${target}" replaces the trays and the ${HOST_LABELS[HOST]} inputs.`,
      {title: `Unsaved changes in ${current.value.name}`, okText: "Save and open",
       actions: [{id: "discard", label: "Discard and open"}]});

    if (answer === true)
      return save();

    return answer === "discard";
  }

  /**
   * Open a project: restore its trays (replacing or merged with the workspace) and/or its parameters.
   * Opened with its trays and not merged, it becomes the current project
   * @param {string} path
   * @param {{trays?: boolean, params?: boolean, merge?: boolean}} options
   */
  async function open(path, {trays = true, params = true, merge = false} = {}) {
    const name = baseName(path);

    if (params && !await ensureGenerationIdle())
      return;

    if (trays && !merge && path !== current.value.path && !await confirmLeave(name))
      return;

    if (trays && !merge && path === current.value.path && current.value.changed
        && !await dialog.confirm(`Discard the unsaved changes of "${name}" and restore its saved state?`,
          {title: "Revert", okText: "Revert", danger: true}))
      return;

    const notes = await run("Opening…", async () => {
      let info;

      await flushTrays();

      if (trays) {
        const result = await call("open", {path, trays: true, merge});
        await Promise.all(trayStores().map(store => store.init()));

        // The project's prompt history replaces the workspace's
        if (!merge)
          await usePromptHistoryStore().load();

        current.value = result.current;
        info = result.project;
      }
      else
        info = await call("project", {path}, {method: "GET"});

      showProject(info);
      return params ? restoreParams(info) : [];
    });

    if (notes?.length)
      await dialog.alert(`Some parameters were not restored:\n\n${notes.map(note => `• ${note}`).join("\n")}`,
        {title: `Opened ${name}`});
  }

  /**
   * Restore the parameters of a project through the host page
   * @param {Object} info - Project of /projects/project
   * @returns {Promise<string[]>} Notes on the values not restored
   */
  async function restoreParams(info) {
    const parameters = info.data.parameters;

    if (!parameters)
      return ["The project has no saved parameters"];

    const prepared = prepareRestore(parameters, await fetchRestoreChoices());
    const units = await loadUnitFiles(prepared.units, name => projectFileUrl(info.path, `ib_project/${name}`));
    let workflow = null;

    if (isComfy && parameters.workflow) {
      const response = await fetch(projectFileUrl(info.path, `ib_project/${parameters.workflow}`, {version: Date.now()}));
      workflow = response.ok ? await response.json() : null;

      if (!workflow)
        prepared.notes.push("The workflow file is missing");
    }

    const result = await requestHost({
      type: "PROJECT_RESTORE",
      snapshot: {mode: prepared.mode, params: prepared.params, controlnet: {units}, workflow, name: info.name}
    }, RESTORE_TIMEOUT);

    for (const index of result?.missingUnits ?? [])
      prepared.notes.push(`ControlNet unit ${index + 1} is not found in ${HOST_LABELS[HOST]}`);

    if (prepared.crossHost)
      prepared.notes.unshift(`Saved in ${HOST_LABELS[parameters.host]}: the parameters were mapped`);

    return prepared.notes;
  }

  /**
   * Forget the current project; the workspace stays as it is
   */
  async function close() {
    current.value = await call("set_current", {path: null});
  }

  // ---------- File system ----------

  const folderLabel = path => path ? `"${path}"` : "the project root";

  async function createProject(parent = "") {
    const answer = await dialog.prompt(`New project in ${folderLabel(parent)}:`, {
      title: "New project",
      placeholder: "Project name",
      okText: "Create",
      checkbox: {label: "Save the workspace into it and make it current", checked: true}
    });

    if (!answer)
      return;

    const result = await run("Creating…", () => call("create_project", {path: parent, name: answer.value}));

    if (!result)
      return;

    await loadTree();
    await select(result.path);

    if (answer.checked)
      await save(result.path);
  }

  async function createFolder(parent = "") {
    const name = await dialog.prompt(`New folder in ${folderLabel(parent)}:`,
      {title: "New folder", placeholder: "Folder name", okText: "Create"});

    if (name && await run("Creating…", () => call("create_folder", {path: parent, name})))
      await loadTree();
  }

  // Selection and current project follow a renamed or moved folder
  async function afterMove(oldPath, newPath) {
    const follow = path => path === oldPath || path?.startsWith(oldPath + "/")
      ? newPath + path.slice(oldPath.length) : path;

    setRecent(recent.value.map(follow));

    // The tab bar chip follows the current project at once; the backend has moved it too
    if (hasCurrent.value && follow(current.value.path) !== current.value.path) {
      const path = follow(current.value.path);
      current.value = {...current.value, path, name: baseName(path)};
    }

    await loadTree();
    await loadCurrent();

    if (selectedPath.value && follow(selectedPath.value) !== selectedPath.value)
      await select(follow(selectedPath.value));
  }

  async function rename(path) {
    const name = await dialog.prompt("New name:", {title: `Rename ${baseName(path)}`, defaultValue: baseName(path),
                                                   okText: "Rename"});

    if (!name || name === baseName(path))
      return;

    const result = await run("Renaming…", () => call("rename", {path, name}));

    if (result)
      await afterMove(path, result.path);
  }

  async function move(path, to) {
    const result = await run("Moving…", () => call("move", {path, to}));

    if (result)
      await afterMove(path, result.path);
  }

  async function remove(node) {
    const isProject = node.type === "project";
    const where = tree.value?.trash ? "to the Recycle Bin" : "permanently, without the Recycle Bin";
    const message = isProject
      ? `Delete the project "${node.name}" with all files of its folder ${where}?`
      : `Delete the folder "${node.name}" with all its projects and files ${where}?`;

    if (!await dialog.confirm(message, {title: "Delete", okText: "Delete", danger: true}))
      return;

    if (!await run("Deleting…", () => call("delete", {path: node.path})))
      return;

    const inside = path => path === node.path || path?.startsWith(node.path + "/");

    setRecent(recent.value.filter(path => !inside(path)));

    if (inside(selectedPath.value))
      await select(null);

    await loadTree();
    await loadCurrent();
  }

  async function reveal(path) {
    await run(null, () => call("reveal", {path}));
  }

  // ---------- Metadata ----------

  async function updateProject(path, changes) {
    const result = await run(null, () => call("update", {path, changes}));

    if (result)
      showProject(result);
  }

  /**
   * Make an image the final image of a project: a file of the project directory, an image of a saved tray, or a file
   * @param {string} path
   * @param {{name?: string, kind?: string, member?: string, file?: File}} source - None clears it
   */
  async function setFinal(path, {name = null, kind = null, member = null, file = null} = {}) {
    const result = await run(null, () => {
      if (!file)
        return call("set_final", {path, name, kind, member});

      const form = new FormData();
      form.append("data", JSON.stringify({path}));
      form.append("file", file, file.name || "final.png");
      return call("set_final", {}, {form});
    });

    if (result) {
      fileVersion.value = Date.now();
      showProject(result);
    }
  }

  /**
   * Save an image file into a project directory, under another name if it is taken
   * @param {string} path - The current project by default
   * @param {File} file
   * @returns {Promise<string>} Name of the saved file
   * @throws {Error} With the message of the backend
   */
  async function addFile(file, path = current.value.path) {
    const form = new FormData();
    form.append("data", JSON.stringify({path}));
    form.append("file", file, file.name || "image.png");

    const result = await call("add_file", {}, {form});
    showProject(result.project);
    return result.name;
  }

  /**
   * Delete an image file of a project directory, after a confirmation
   * @param {string} path
   * @param {string} name - Relative to the project directory
   * @returns {Promise<boolean>} Whether it was deleted
   */
  async function deleteFile(path, name) {
    const target = tree.value?.trash ? "moved to the Recycle Bin" : "deleted permanently";

    if (!await dialog.confirm(`Delete "${name}" from the project folder? It is ${target}.`,
      {title: "Delete file", okText: "Delete", danger: true}))
      return false;

    const result = await run(null, () => call("delete_file", {path, name}));

    if (result)
      showProject(result);

    return !!result;
  }

  /**
   * Write an infotext into a PNG file of a project directory (Paste infotext of the image context menu)
   * @param {string} path
   * @param {string} name - Relative to the project directory
   * @param {string} infotext
   * @returns {Promise<{infotext: string, parameters: Object}>}
   * @throws {Error} With the message of the backend
   */
  async function writeInfotext(path, name, infotext) {
    const result = await call("write_infotext", {path, name, infotext});
    showProject(result.project);
    return result;
  }

  async function init() {
    await loadCurrent();
  }

  /**
   * Select a project for the Projects tab (the router is switched by the caller)
   * @param {string|null} path - null keeps the selection
   */
  async function show(path = null) {
    if (path !== null)
      await select(path);
  }

  return {
    tree, treeLoading, treeError, current, selectedPath, project, projectError, busy, fileVersion, recent,
    hasCurrent, unsaved,
    init, loadTree, loadCurrent, loadProject, select, findNode, show,
    save, saveInto, saveAs, open, close,
    createProject, createFolder, rename, move, remove, reveal,
    updateProject, setFinal, addFile, deleteFile, writeInfotext
  };
});
