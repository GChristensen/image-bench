<script setup>
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import {onBeforeMount, ref} from "vue";
import {useImageTrayStore} from "@/stores/imageTray.js";
import {useGeneratedImagesStore} from "@/stores/generatedImages.js";
import {useUpscaledImagesStore} from "@/stores/upscaled.js";
import {useExploreImagesStore} from "@/stores/explore.js";
import {useConfigPresetsStore} from "@/stores/configPresets.js";
import {generationStateToKind} from "@/consts.js";
import {useSDWebUIStore} from "@/stores/sdwebui.js";
import {sendWebUIMessage} from "@/sdwebui.js";

const route = useRoute();
const router = useRouter();

const exploreTab = ref(null);
const generatedImagesTab = ref(null);
const upscaledImagesTab = ref(null);
const imageTrayTab = ref(null);
const routerView = ref(null);

const exploreImagesStore = useExploreImagesStore();
const generatedImagesStore = useGeneratedImagesStore();
const imageTrayStore = useImageTrayStore();
const upscaledImageStore = useUpscaledImagesStore();
const configPresetsStore = useConfigPresetsStore();
const sdWebUIStore = useSDWebUIStore();

const viewStores = {
  [exploreImagesStore.kind]: exploreImagesStore,
  [generatedImagesStore.kind]: generatedImagesStore,
  [imageTrayStore.kind]: imageTrayStore,
  [upscaledImageStore.kind]: upscaledImageStore,
}

function onClearAllClick(e) {
  e.preventDefault();

  if (confirm("This will clear all images. The image files will remain on disk. Do you want to continue?")) {
    exploreImagesStore.clear();
    generatedImagesStore.clear();
    imageTrayStore.clear();
    upscaledImageStore.clear();
  }
}

async function onSDEvent(e) {
  if (e.type === "SOCKET_CLOSED") {
    alert("Connection with Stable Diffusion WebUI server is lost. Please reload the main WebUI page and reopen this window.");
    return;
  }

  const state = window.getGenerationState();

  if (e.type === "BEGIN_PROCESSING") {
    if (state === "BATCH_GENERATION") {
      if (route.fullPath !== "/generated-images") {
        await router.push("/generated-images");
      }
    } else if (state === "HIRES_FIX") {
      if (route.fullPath !== "/upscaled-images") {
        await router.push("/upscaled-images");
      }
    }
  }

  try {
    routerView.value.onBeforeSDEvent(e);
  } catch (e) {
    console.error(e);
  }

  const store = viewStores[generationStateToKind(state)];
  store?.onSDEvent(e);

  sdWebUIStore.onSDEvent(e);

  routerView.value.onAfterSDEvent(e);
}

window.onSDEvent = onSDEvent;

onBeforeMount(async () => {
  await imageTrayStore.init();
  await configPresetsStore.init();

  sendWebUIMessage({type: "INITIALIZE_PROMPTS"});
});

</script>

<template>
  <div class="tab-container">
    <div class="tabs">
      <RouterLink to="/explore" class="tab" ref="exploreTab">Explore</RouterLink>
      <RouterLink to="/generated-images" class="tab" ref="generatedImagesTab">Generated Images</RouterLink>
      <RouterLink to="/image-tray" class="tab" id="image-tray-tab" ref="imageTrayTab">Image Tray</RouterLink>
      <RouterLink to="/upscaled-images" class="tab" ref="upscaledImagesTab">Upscaled</RouterLink>
      <div class="tab-spacer"></div>
      <div class="toolbar-link-container">
        <a class="toolbar-link clear-all-link" href="#" @click="onClearAllClick">Clear</a>
      </div>
    </div>
    <div id="tab-content">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <component ref="routerView" :is="Component"  :key="$route.fullPath"/>
        </KeepAlive>
      </RouterView>
    </div>
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
</style>