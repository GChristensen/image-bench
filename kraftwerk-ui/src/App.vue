<script setup>
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import {ref} from "vue";

const route = useRoute();
const router = useRouter();

const exploreTab = ref(null);
const generatedImagesTab = ref(null);
const upscaledImagesTab = ref(null);
const imageTrayTab = ref(null);
const routerView = ref(null);

async function onSDEvent(e) {
  const state = window.getGenerationState();

  if (state === "BATCH_GENERATION") {
    if (route.fullPath !== "/generated-images") {
      await router.push("/generated-images");
    }
  }
  else if (state === "HIRES_FIX") {
    if (route.fullPath !== "/upscaled-images") {
      await router.push("/upscaled-images");
    }
  }

  routerView.value.onSDEvent(e);
}

window.onSDEvent = onSDEvent;

</script>

<template>
  <div class="tab-container">
    <div class="tabs">
      <RouterLink to="/explore" class="tab" ref="exploreTab">Explore</RouterLink>
      <RouterLink to="/generated-images" class="tab" ref="generatedImagesTab">Generated Images</RouterLink>
      <RouterLink to="/image-tray" class="tab" ref="imageTrayTab">Image Tray</RouterLink>
      <RouterLink to="/upscaled-images" class="tab" ref="upscaledImagesTab">Upscaled</RouterLink>
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
  }

  .tab:hover {
    background-color: #f0f0f0;
    color: var(--vt-c-black);
  }

  .tab.router-link-exact-active {
    font-weight: bold;
  }

  #tab-content {
    flex-grow: 1;
  }
</style>