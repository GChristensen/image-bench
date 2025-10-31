<script setup>
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import {onBeforeMount, ref, computed, onMounted, onUnmounted} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {generationStateToKind} from "@/consts.js";
import {useSDWebUIStateStore} from "@/stores/sdwebui.js";
import {useAppConfigStore} from "@/stores/appConfig.js";
import {useConceptTrayStore} from "@/stores/conceptTray.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";
import ActionsModal from "@/components/ActionsModal.vue";

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
const hasOpener = computed(() => !!window.opener);

// Composables
const webUI = useWebUIBridge();
const showActionsModal = ref(false);

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
});

async function onSDEvent(e) {
  const state = window.getGenerationState();
  await switchTabAccordingToGenerationMode(e, state);

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

  try {
    routerView.value?.onAfterSDEvent?.(e);
  } catch (error) {
    console.error('Error in onAfterSDEvent:', error);
  }
}

onMounted(() => {
  window.onSDEvent = onSDEvent;
});

onUnmounted(() => {
  // Clean up window event handler
  if (window.onSDEvent === onSDEvent) {
    window.onSDEvent = null;
  }
});

async function switchTabAccordingToGenerationMode(e, state) {
  if (e.type === "BEGIN_PROCESSING") {
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
    <div class="tabs">
      <RouterLink to="/explore" class="tab" ref="exploreTab">Explore</RouterLink>
      <RouterLink to="/generated-images" class="tab" ref="generatedImagesTab">Generated Images</RouterLink>
      <RouterLink to="/concept-tray" class="tab" id="concept-tray-tab" ref="conceptTrayTab">Concept Tray</RouterLink>
      <RouterLink to="/image-tray" class="tab" id="image-tray-tab" ref="imageTrayTab">Image Tray</RouterLink>
      <RouterLink to="/upscaled-images" class="tab" ref="upscaledImagesTab">Upscaled</RouterLink>
      <div class="tab-spacer"></div>
      <span v-if="!hasOpener" class="window-warning" title="Lost connection with the SD WebUI">&nbsp;⚠️&nbsp;</span>
      <RouterLink to="/settings" class="tab" ref="settingsTab">Settings</RouterLink>
      <button class="actions-button" @click="showActionsModal = true" title="Actions">☢️</button>
    </div>
    <div id="tab-content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component ref="routerView" :is="Component"  :key="$route.fullPath"/>
        </KeepAlive>
      </RouterView>
    </div>
  <ActionsModal :show="showActionsModal" @close="showActionsModal = false" />
  </div>
</template>

<style scoped>
  a {
    text-decoration: none;
    color: hsla(160, 100%, 37%, 1);
    transition: 0.4s;
    padding: 3px;
  }

  a:hover {
    background-color: hsla(160, 100%, 37%, 0.2);
  }

  .tab-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #ccc;
    width: 100%;
  }

  .tab {
    padding: 10px 15px;
    cursor: pointer;
    text-decoration: none;
    color: white;
    font-weight: bold;
  }

  .tab-spacer {
    flex-grow: 1;
  }

  .tab:hover {
    background-color: #f0f0f0;
    color: var(--vt-c-black);
  }

  .tab.router-link-exact-active {
    font-weight: bold;
    background-color: #f0f0f0;
    color: var(--vt-c-black);
  }

  #tab-content {
    flex-grow: 1;
  }

  .toolbar-link-container {
    display: flex;
  }

  .toolbar-link {
    align-self: center;
  }


.actions-button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 8px 12px;
  transition: background-color 0.2s;
  align-self: center;
}

.actions-button:hover {
  background-color: #f0f0f0;
}

  .window-warning {
    align-self: center;
    color: initial;
    cursor: default;
  }
</style>
