<script setup>
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import {onBeforeMount, ref, computed, onMounted, onUnmounted, watch} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {generationStateToKind, KIND_GENERATED, KIND_UPSCALED} from "@/consts.js";
import {flashTrayTab} from "@/components/utils.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useControlNetStore} from "@/stores/controlnet.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import ActionsModal from "@/components/ActionsModal.vue";
import AppIcon from "@/components/AppIcon.vue";
import DialogHost from "@/dialogs/DialogHost.vue";
import {dialog} from "@/dialogs/useDialog.js";
import {hostHas} from "@/host.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

// Messages too frequent to log
const QUIET_EVENTS = ["WEBUI_PARAMS", "LIVE_PROGRESS", "INPUT_IMAGES", "CONTROLNET_STATE", "CONTROLNET_IMAGES"];

const route = useRoute();
const router = useRouter();

const routerView = ref(null);

const appConfigStore = useAppConfigStore();
const exploreImagesStore = useExploreImagesStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const conceptTrayStore = useConceptTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const sdWebUIStateStore = useSDWebUIStateStore();
const controlNetStore = useControlNetStore();
const hasOpener = computed(() => !!window.opener);
// Upscaling is not implemented for ComfyUI
const isWebUI = import.meta.env.MODE === 'webui';

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

watch(() => route.path, path => {
  if (path === "/manual")
    hideManualHint();
});

function openManual() {
  hideManualHint();
  router.push("/manual");
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
  await configPresetsStore.init();

  webUI.initializePrompts();

  // The WebUI prompts are unlocked when the popup closes; lock them again if the user left them locked
  if (hostHas("generate", "promptLock") && sdWebUIStateStore.isPromptsLockRemembered())
    webUI.lockWebUIPrompts(true);
});

async function onSDEvent(e) {
  // Messages from the host page, which must not open dialogs in its own window
  if (e.type === "SHOW_ALERT") {
    dialog.alert(e.message);
    return;
  }

  const state = window.getGenerationState();
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

  const store = viewStores[generationStateToKind(state)];
  store?.onSDEvent(e);

  sdWebUIStateStore.onSDEvent(e);
  controlNetStore.onSDEvent(e);

  try {
    routerView.value?.onAfterSDEvent?.(e);
  } catch (error) {
    console.error('Error in onAfterSDEvent:', error);
  }
}

onMounted(() => {
  window.onSDEvent = onSDEvent;
  initManualHint();
});

onUnmounted(() => {
  clearTimeout(manualHintTimer);
  // Clean up window event handler
  if (window.onSDEvent === onSDEvent) {
    window.onSDEvent = null;
  }
});

// Tabs that receive the images of a generation state
const RESULT_TAB_IDS = {
  [KIND_GENERATED]: "generated-images-tab",
  [KIND_UPSCALED]: "upscaled-images-tab"
};

async function switchTabAccordingToGenerationMode(e, state) {
  // Generations started from the Generate tab stay there, the tab receiving their images flashes
  if (route.path === "/generate") {
    const tabId = RESULT_TAB_IDS[generationStateToKind(state)];

    const disabled = tabId === RESULT_TAB_IDS[KIND_GENERATED] && !appConfigStore.flashGeneratedTab;

    if (e.type === "SAVED_IMAGE" && tabId && !disabled)
      flashTrayTab(tabId);
    return;
  }

  if (e.type === "BEGIN_PROCESSING" && !e.single) {
    if (state === "BATCH_GENERATION" || state === "SEQUENTIAL_GENERATION") {
      if (route.fullPath !== "/generated-images") {
        await router.push("/generated-images");
      }
    } else if (state === "HIRES_FIX") {
      if (route.fullPath !== "/upscaled-images") {
        await router.push("/upscaled-images");
      }
    }
  }
}

</script>

<template>
  <div class="tab-container">
    <nav class="tabs">
      <RouterLink to="/generate" class="tab"><AppIcon name="generate" :size="14"/>Generate</RouterLink>
      <RouterLink to="/controlnet" class="tab" id="controlnet-tab"><AppIcon name="controlnet" :size="14"/>ControlNet</RouterLink>
      <RouterLink to="/explore" class="tab" ref="exploreTab"><AppIcon name="flask" :size="14"/>Explore</RouterLink>
      <RouterLink to="/generated-images" class="tab" id="generated-images-tab" ref="generatedImagesTab"><AppIcon name="images" :size="14"/>Generated<span v-if="generatedImagesStore.images.length" class="count">{{ generatedImagesStore.images.length }}</span></RouterLink>
      <RouterLink to="/concept-tray" class="tab" id="concept-tray-tab" ref="conceptTrayTab"><AppIcon name="concept" :size="14"/>Concept tray<span v-if="conceptTrayStore.images.length" class="count">{{ conceptTrayStore.images.length }}</span></RouterLink>
      <RouterLink to="/image-tray" class="tab" id="image-tray-tab" ref="imageTrayTab"><AppIcon name="palette" :size="14"/>Image tray<span v-if="imageTrayStore.images.length" class="count">{{ imageTrayStore.images.length }}</span></RouterLink>
      <RouterLink v-if="isWebUI" to="/upscaled-images" class="tab" id="upscaled-images-tab" ref="upscaledImagesTab"><AppIcon name="upscale" :size="14"/>Upscaled<span v-if="upscaledImageStore.images.length" class="count">{{ upscaledImageStore.images.length }}</span></RouterLink>
      <div class="tab-spacer"></div>
      <a v-if="showManualHint" href="#" class="manual-hint" @click.prevent="openManual"
        ><AppIcon name="book" :size="13"/>New to Image Bench? Read the manual</a>
      <span v-if="!hasOpener" class="chip window-warning" title="The opener SD WebUI window is closed or was reloaded"
        ><AppIcon name="alert" :size="13"/>Disconnected from WebUI</span>
      <RouterLink to="/settings" class="tab" ref="settingsTab"><AppIcon name="settings" :size="14"/>Settings</RouterLink>
      <RouterLink to="/manual" class="tab"><AppIcon name="book" :size="14"/>Manual</RouterLink>
      <button class="ib flat actions-button" @click="showActionsModal = true"
              title="Maintenance actions (clear outputs, images)" aria-label="Maintenance actions"
        ><AppIcon name="more" :size="16"/></button>
    </nav>
    <div id="tab-content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component ref="routerView" :is="Component"  :key="$route.fullPath"/>
        </KeepAlive>
      </RouterView>
    </div>
  <ActionsModal :show="showActionsModal" @close="showActionsModal = false" />
  <DialogHost />
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

  .tab:hover {
    color: var(--ib-text);
    background: rgba(255, 255, 255, 0.03);
  }

  .tab.router-link-exact-active {
    color: #fff;
    border-bottom-color: var(--ib-accent);
  }

  .tab-spacer {
    flex-grow: 1;
  }

  #tab-content {
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

  .window-warning {
    margin-right: 6px;
    background: #3a2a12;
    color: var(--ib-warn);
    cursor: default;
  }
</style>
