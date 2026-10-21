<script setup>
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import {onBeforeMount, ref, computed, onMounted, onUnmounted, watch} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {useGenerationSettingsStore} from "@/stores/generationSettings.js";
import {usePromptHistoryStore} from "@/stores/promptHistory.js";
import {generationStateToKind, KIND_GENERATED, KIND_UPSCALED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_COMPARE} from "@/consts.js";
import {canDropOn, isMoveTo, dropImages} from "@/imageDrag.js";
import {flashTrayTab} from "@/components/utils.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useControlNetStore} from "@/stores/controlnet.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useCompareStore} from "@/stores/compare.js";
import {useSessionImagesStore} from "@/stores/session.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import ActionsModal from "@/components/ActionsModal.vue";
import AppIcon from "@/components/AppIcon.vue";
import DialogHost from "@/dialogs/DialogHost.vue";
import ImageContextMenu from "@/components/ImageContextMenu.vue";
import ToastHost from "@/components/ToastHost.vue";
import ProjectChip from "@/components/ProjectChip.vue";
import {installImageActionKeys} from "@/composables/useImageActionKeys.js";
import {dialog} from "@/dialogs/useDialog.js";
import {hostHas} from "@/host.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";
import {useProjectsStore} from "@/stores/projects.js";
import {useManualStore} from "@/stores/manual.js";
import {handleHostResponse} from "@/hostRequest.js";
import {EMBEDDED, handleHostAttachment, hostConnected} from "@/hostWindow.js";
import {getGenerationState} from "@/sdwebui.js";
import HostFrame from "@/components/HostFrame.vue";
import {HOST_NAME} from "@/host.js";
import {backendConnected, onBackendReconnected, startBackendMonitor} from "@/backendStatus.js";
import {backendDownTitle, canRestart, restartHost, restarting, startHostRestart} from "@/hostRestart.js";
import {resyncHost} from "@/hostResync.js";
import {toast} from "@/toast.js";
import ConsoleDrawer from "@/components/ConsoleDrawer.vue";
import {consoleOpen, onConsoleKey, toggleConsole} from "@/consoleDrawer.js";
import {useShiftKey} from "@/composables/useShiftKey.js";

// Messages too frequent to log
const QUIET_EVENTS = ["WEBUI_PARAMS", "LIVE_PROGRESS", "INPUT_IMAGES", "CONTROLNET_STATE", "CONTROLNET_IMAGES"];

const route = useRoute();
const router = useRouter();

const routerView = ref(null);

const appConfigStore = useAppConfigStore();
const exploreImagesStore = useExploreImagesStore();
const generatedImagesStore = useGeneratedImagesStore();
// Batch separators are entries of the Generated store too
const generatedCount = computed(() => generatedImagesStore.images.filter(i => !i.separator).length);
const imageTrayStore = useImageTrayStore();
const conceptTrayStore = useConceptTrayStore();
const compareStore = useCompareStore();
const sessionImagesStore = useSessionImagesStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const sdWebUIStateStore = useSDWebUIStateStore();
const controlNetStore = useControlNetStore();
const projectsStore = useProjectsStore();
const manualStore = useManualStore();

// Composables
const webUI = useWebUIBridge();
const showActionsModal = ref(false);

// A link to the manual is shown for a minute on the first opening after installation
const MANUAL_HINT_KEY = "imageBench_manualHintShown";
const MANUAL_HINT_DURATION = 60_000;
const storage = useLocalStorage();
const showManualHint = ref(false);
let manualHintTimer = null;

function initManualHint() {
  if (storage.getItem(MANUAL_HINT_KEY))
    return;
  storage.setItem(MANUAL_HINT_KEY, "true");
  showManualHint.value = true;
  manualHintTimer = setTimeout(hideManualHint, MANUAL_HINT_DURATION);
}

function hideManualHint() {
  clearTimeout(manualHintTimer);
  showManualHint.value = false;
}

watch(() => manualStore.opened, opened => opened && hideManualHint());

// The manual is a section of the Library
function openManual() {
  hideManualHint();
  manualStore.reveal();
  router.push("/library");
}

const viewStores = {
  [exploreImagesStore.kind]: exploreImagesStore,
  [generatedImagesStore.kind]: generatedImagesStore,
  [imageTrayStore.kind]: imageTrayStore,
  [upscaledImageStore.kind]: upscaledImageStore,
}

onBeforeMount(async () => {
  await appConfigStore.init();
  await imageTrayStore.init();
  await conceptTrayStore.init();
  await compareStore.init();
  await upscaledImageStore.init();
  await configPresetsStore.init();
  await useGenerationSettingsStore().init();
  await usePromptHistoryStore().load();
  await projectsStore.init();

  // The host page of the embedded mode is initialized when it attaches (HOST_READY)
  if (!EMBEDDED)
    initHostPage();
});

// Tell a host page the state of the popup it does not know
function initHostPage() {
  webUI.initializePrompts();

  // The WebUI prompts are unlocked when the popup closes; lock them again if the user left them locked
  if (hostHas("generate", "promptLock") && sdWebUIStateStore.isPromptsLockRemembered())
    webUI.lockWebUIPrompts(true);
}

// ---------- Host tab (embedded mode) ----------

const HOST_ROUTE = "/host";
const hostTabActive = computed(() => route.path === HOST_ROUTE);
// The tab to return to from the host tab
let lastAppRoute = "/generate";

watch(() => route.fullPath, path => {
  if (route.path !== HOST_ROUTE)
    lastAppRoute = path;
});

// The Image Bench button of the host page in the iframe shows the popup's own tabs (shared_frontend/popup.js)
function showAppTabs() {
  if (hostTabActive.value)
    router.push(lastAppRoute);
}

// Dragging an image card over the host tab shows the host page, to drop it into an image input there
const HOST_TAB_DRAG_DELAY = 500;
let hostTabDragTimer = null;

function onHostTabDragEnter() {
  clearTimeout(hostTabDragTimer);
  hostTabDragTimer = setTimeout(() => router.push(HOST_ROUTE), HOST_TAB_DRAG_DELAY);
}

function onHostTabDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget))
    clearTimeout(hostTabDragTimer);
}

// A middle click or Shift+click on the host tab toggles the console instead; its icon shows that only while the tab
// is hovered with Shift held, since Shift is held all the time while typing
const shiftDown = useShiftKey();
const hostTabHovered = ref(false);

function onHostTabClick(e) {
  // RouterLink leaves a Shift+click to the browser, which would open the host UI in a new window
  if (e.shiftKey) {
    e.preventDefault();
    toggleConsole();
  }
}

function onHostTabAuxClick(e) {
  if (e.button === 1) {
    e.preventDefault();
    toggleConsole();
  }
}

// ---------- Backend restart ----------

// Whether a run of the host page has begun and not finished: a restart of the backend ends it without a word
let runActive = false;

onBackendReconnected(async () => {
  const interrupted = runActive;
  await resyncHost();

  // A ComfyUI page ends its run itself (hostResync.js), a reloaded WebUI page knows nothing of it
  if (runActive)
    await onSDEvent({type: "GENERATION_FINISHED"});

  toast(interrupted ? `${HOST_NAME} is back. The run was interrupted by the restart` : `${HOST_NAME} is back`);
});

function trackRun(e) {
  if (e.type === "BEGIN_PROCESSING")
    runActive = true;
  else if (e.type === "GENERATION_FINISHED")
    runActive = false;
}

async function onSDEvent(e) {
  trackRun(e);

  // Answers to requests of the popup (hostRequest.js)
  if (handleHostResponse(e))
    return;

  // The host page in the iframe attached or left (embedded mode)
  if (handleHostAttachment(e)) {
    if (e.type === "HOST_READY")
      initHostPage();
    return;
  }

  // Messages from the host page, which must not open dialogs in its own window
  if (e.type === "SHOW_ALERT") {
    dialog.alert(e.message);
    return;
  }

  const state = getGenerationState();
  await switchTabAccordingToGenerationMode(e, state);

  // The Generate tab receives the WebUI state several times per second
  if (!QUIET_EVENTS.includes(e.type))
    console.log(e);

  // Notify child component if it has handlers
  try {
    routerView.value?.onBeforeSDEvent?.(e);
  } catch (error) {
    console.error('Error in onBeforeSDEvent:', error);
  }

  const kind = generationStateToKind(state);
  const store = viewStores[kind];
  store?.onSDEvent(e);

  if (kind === KIND_GENERATED)
    sessionImagesStore.onSDEvent(e);

  sdWebUIStateStore.onSDEvent(e);
  controlNetStore.onSDEvent(e);
  compareStore.onSDEvent(e);

  try {
    routerView.value?.onAfterSDEvent?.(e);
  } catch (error) {
    console.error('Error in onAfterSDEvent:', error);
  }
}

// Ctrl+S saves the current project, instead of the page
function onSaveKey(e) {
  if (e.code === "KeyS" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    e.preventDefault();

    if (projectsStore.hasCurrent && !projectsStore.busy)
      projectsStore.save();
  }
}

onMounted(() => {
  window.onSDEvent = onSDEvent;
  startBackendMonitor();
  startHostRestart();
  if (EMBEDDED)
    window.imageBenchShowApp = showAppTabs;
  initManualHint();
  installImageActionKeys();
  window.addEventListener("keydown", onSaveKey);
  window.addEventListener("keydown", onConsoleKey);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onSaveKey);
  window.removeEventListener("keydown", onConsoleKey);
  clearTimeout(manualHintTimer);
  clearTimeout(hostTabDragTimer);
  // Clean up window event handler
  if (window.onSDEvent === onSDEvent) {
    window.onSDEvent = null;
  }
});

// The tray tabs receive image cards dragged from any view
const dropTargetKind = ref(null);

function onTrayDragOver(e, kind) {
  if (!canDropOn(e, kind))
    return;

  e.preventDefault();
  e.dataTransfer.dropEffect = isMoveTo(kind) ? "move" : "copy";
  dropTargetKind.value = kind;
}

// Moving between the children of the tab also leaves the tab
function onTrayDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget))
    dropTargetKind.value = null;
}

function onTrayDrop(kind) {
  dropTargetKind.value = null;
  dropImages(kind);
}

// Tabs that receive the images of a generation state
const RESULT_TAB_IDS = {
  [KIND_GENERATED]: "generated-images-tab",
  [KIND_UPSCALED]: "upscaled-images-tab"
};

// Route of each tab receiving images
const RESULT_TAB_ROUTES = {
  [KIND_GENERATED]: "/generated-images",
  [KIND_UPSCALED]: "/upscaled-images"
};

/**
 * The popup never switches to the Generated tab: the tab flashes when an image arrives while another one is shown
 * (as the setting allows). Upscaling started from the popup (not from the Generate tab or the host page) shows the
 * Upscaled tab
 */
async function switchTabAccordingToGenerationMode(e, state) {
  if (e.type === "SAVED_IMAGE") {
    const kind = generationStateToKind(state);
    const tabId = RESULT_TAB_IDS[kind];
    const disabled = tabId === RESULT_TAB_IDS[KIND_GENERATED] && !appConfigStore.flashGeneratedTab;

    if (tabId && !disabled && route.path !== RESULT_TAB_ROUTES[kind])
      flashTrayTab(tabId);
    return;
  }

  if (route.path === "/generate")
    return;

  if (e.type === "BEGIN_PROCESSING" && !e.single && !e.host && state === "HIRES_FIX"
      && route.fullPath !== "/upscaled-images")
    await router.push("/upscaled-images");
}

</script>

<template>
  <div class="tab-container">
    <nav class="tabs">
      <RouterLink to="/generate" class="tab" id="generate-tab"><AppIcon name="generate" :size="14"/>Generate</RouterLink>
      <RouterLink to="/controlnet" class="tab" id="controlnet-tab"><AppIcon name="controlnet" :size="14"/>ControlNet</RouterLink>
      <RouterLink to="/explore" class="tab" ref="exploreTab"><AppIcon name="flask" :size="14"/>Explore</RouterLink>
      <RouterLink to="/generated-images" class="tab" id="generated-images-tab" ref="generatedImagesTab"><AppIcon name="images" :size="14"/>Generated<span v-if="generatedCount" class="count">{{ generatedCount }}</span></RouterLink>
      <RouterLink to="/compare" class="tab" id="compare-tab"
                  :class="{'drop-target': dropTargetKind === KIND_COMPARE}"
                  @dragover="onTrayDragOver($event, KIND_COMPARE)" @dragleave="onTrayDragLeave"
                  @drop.prevent="onTrayDrop(KIND_COMPARE)"><AppIcon name="compare" :size="14"/>Compare<span v-if="compareStore.images.length" class="count">{{ compareStore.images.length }}</span></RouterLink>
      <RouterLink to="/concept-tray" class="tab" id="concept-tray-tab"
                  :class="{'drop-target': dropTargetKind === KIND_CONCEPT_TRAY}"
                  @dragover="onTrayDragOver($event, KIND_CONCEPT_TRAY)" @dragleave="onTrayDragLeave"
                  @drop.prevent="onTrayDrop(KIND_CONCEPT_TRAY)" ref="conceptTrayTab"><AppIcon name="concept" :size="14"/>Concept tray<span v-if="conceptTrayStore.images.length" class="count">{{ conceptTrayStore.images.length }}</span></RouterLink>
      <RouterLink to="/image-tray" class="tab" id="image-tray-tab"
                  :class="{'drop-target': dropTargetKind === KIND_IMAGE_TRAY}"
                  @dragover="onTrayDragOver($event, KIND_IMAGE_TRAY)" @dragleave="onTrayDragLeave"
                  @drop.prevent="onTrayDrop(KIND_IMAGE_TRAY)" ref="imageTrayTab"><AppIcon name="palette" :size="14"/>Image tray<span v-if="imageTrayStore.images.length" class="count">{{ imageTrayStore.images.length }}</span></RouterLink>
      <RouterLink to="/upscaled-images" class="tab" id="upscaled-images-tab" ref="upscaledImagesTab"><AppIcon name="upscale" :size="14"/>Upscaled<span v-if="upscaledImageStore.images.length" class="count">{{ upscaledImageStore.images.length }}</span></RouterLink>
      <RouterLink to="/library" class="tab" id="library-tab"><AppIcon name="library" :size="14"/>Library</RouterLink>
      <button v-if="!backendConnected && canRestart" type="button" class="backend-down restartable"
              :class="{restarting}" :title="backendDownTitle" :aria-label="backendDownTitle" :disabled="restarting"
              @click="restartHost"><AppIcon :name="restarting ? 'power' : 'unplug'" :size="15"/></button>
      <span v-else-if="!backendConnected" class="backend-down" role="status" :title="backendDownTitle"
            :aria-label="`${HOST_NAME} is not running`"><AppIcon name="unplug" :size="15"/></span>
      <div class="tab-spacer"></div>
      <a v-if="showManualHint" href="#" class="manual-hint" @click.prevent="openManual"
        ><AppIcon name="help" :size="13"/>New to Image Bench? Read the manual</a>
      <RouterLink v-if="!hostConnected && EMBEDDED" :to="HOST_ROUTE" class="chip window-warning"
                  :title="`${HOST_NAME} is loading in the ${HOST_NAME} tab`"
        ><AppIcon name="alert" :size="13"/>Connecting to {{ HOST_NAME }}</RouterLink>
      <span v-else-if="!hostConnected" class="chip window-warning"
            :title="`The opener ${HOST_NAME} window is closed or was reloaded`"
        ><AppIcon name="alert" :size="13"/>Disconnected from {{ HOST_NAME }}</span>
      <ProjectChip/>
      <RouterLink to="/settings" class="tab icon-tab" ref="settingsTab" title="Settings" aria-label="Settings"
        ><AppIcon name="settings" :size="15"/></RouterLink>
      <RouterLink v-if="EMBEDDED" :to="HOST_ROUTE" class="tab icon-tab" id="host-tab"                  :title="`${HOST_NAME}\nMiddle-click or Shift+click: console (Ctrl+\`)`"
                  :aria-label="HOST_NAME" @dragenter="onHostTabDragEnter" @dragleave="onHostTabDragLeave"
                  @click="onHostTabClick" @auxclick="onHostTabAuxClick" @mousedown.middle.prevent
                  @mouseenter="hostTabHovered = true" @mouseleave="hostTabHovered = false"
        ><AppIcon :name="hostTabHovered && shiftDown ? 'terminal' : 'appWindow'" :size="15"/></RouterLink>
      <button class="ib flat actions-button" @click="showActionsModal = true"
              title="Clean up (clear images, delete outputs, reset parameters)" aria-label="Clean up"
        ><AppIcon name="broom" :size="16"/></button>
    </nav>
    <div id="tab-content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component ref="routerView" :is="Component"  :key="$route.fullPath"/>
        </KeepAlive>
      </RouterView>
      <HostFrame v-if="EMBEDDED" :active="hostTabActive"/>
      <ConsoleDrawer v-if="consoleOpen" @close="toggleConsole"/>
    </div>
  <ActionsModal :show="showActionsModal" @close="showActionsModal = false" />
  <ImageContextMenu />
  <DialogHost />
  <ToastHost />
  </div>
</template>

<style scoped>
  .tab-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--ib-bg);
  }

  .tabs {
    display: flex;
    align-items: center;
    width: 100%;
    height: 37px;
    flex-shrink: 0;
    padding: 0 6px;
    background: var(--ib-surface);
    border-bottom: 1px solid var(--ib-border);
  }

  .tab {
    height: 36px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ib-text-2);
    text-decoration: none;
    font-weight: 500;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }

  /* Settings: icon only, the tab bar is full at 1200 px */
  .tab.icon-tab {
    padding: 0 8px;
  }

  .tab:hover {
    color: var(--ib-text);
    background: rgba(255, 255, 255, 0.03);
  }

  .tab.router-link-exact-active {
    color: #fff;
    border-bottom-color: var(--ib-accent);
  }

  .tab.drop-target {
    color: var(--ib-text);
    background: var(--ib-accent-soft);
    box-shadow: inset 0 0 0 1px var(--ib-accent-border);
  }

  .tab-spacer {
    flex-grow: 1;
  }

  #tab-content {
    position: relative;
    isolation: isolate;
    flex-grow: 1;
    min-height: 0;
  }

  .actions-button {
    margin-left: 2px;
  }

  .manual-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-right: 8px;
    color: var(--ib-accent);
    white-space: nowrap;
    text-decoration: none;
  }

  .manual-hint:hover {
    text-decoration: underline;
  }

  .backend-down {
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    color: var(--ib-warn);
    cursor: default;
  }

  .backend-down.restartable {
    border: none;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }

  .backend-down.restartable:hover {
    background: var(--ib-accent-soft);
  }

  .backend-down.restarting {
    cursor: progress;
    animation: backend-restarting 1.2s ease-in-out infinite alternate;
  }

  @keyframes backend-restarting {
    to { opacity: 0.35; }
  }

  .window-warning {
    margin-right: 6px;
    background: #3a2a12;
    color: var(--ib-warn);
    cursor: default;
  }

  a.window-warning {
    text-decoration: none;
    cursor: pointer;
  }
</style>
