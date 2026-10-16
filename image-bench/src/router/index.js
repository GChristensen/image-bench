import {createRouter, createWebHashHistory} from 'vue-router'
import Explore from "@/views/Explore.vue";
import GeneratedImages from "@/views/GeneratedImages.vue";
import {KIND_GENERATED, KIND_IMAGE_TRAY, KIND_CONCEPT_TRAY, KIND_UPSCALED} from "@/consts.js";
import Settings from "@/views/Settings.vue";
import Generate from "@/views/Generate.vue";
import ControlNet from "@/views/ControlNet.vue";
import Compare from "@/views/Compare.vue";
import Library from "@/views/Library.vue";
import {EMBEDDED} from "@/hostWindow.js";

const scrollBehavior = (to, from) => {
  if (to.name === from.name) {
    to.meta?.scrollPos && (to.meta.scrollPos.top = 0)
    return { el: ".scrollable", top: 0 }
  }

  const scrollpos = to.meta?.scrollPos || { el: ".scrollable", top: 0 }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const el = document.querySelector(".scrollable");

      if (el)
        el.scrollTop = scrollpos.top;

      resolve(scrollpos)
    }, 0)
  })
};

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  scrollBehavior,
  routes: [
    {
      path: '/',
      redirect: '/generate'
    },
    {
      path: '/generate',
      name: 'generate',
      component: Generate
    },
    {
      path: '/controlnet',
      name: 'controlnet',
      component: ControlNet
    },
    {
      path: '/explore',
      name: 'explore',
      component: Explore,
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/generated-images',
      name: 'generated-images',
      component: GeneratedImages,
      props: {"kind": KIND_GENERATED},
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/compare',
      name: 'compare',
      component: Compare
    },
    {
      path: '/concept-tray',
      name: 'concept-tray',
      component: GeneratedImages,
      props: {"kind": KIND_CONCEPT_TRAY},
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/image-tray',
      name: 'image-tray',
      component: GeneratedImages,
      props: {"kind": KIND_IMAGE_TRAY},
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/upscaled-images',
      name: 'upscaled-images',
      component: GeneratedImages,
      props: {"kind": KIND_UPSCALED},
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/library',
      name: 'library',
      component: Library
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    },
    {
      // The host page of the embedded mode, App.vue shows its iframe (HostFrame.vue) over the empty view
      path: '/host',
      name: 'host',
      component: {render: () => null},
      beforeEnter: () => EMBEDDED || '/generate'
    }
  ]
})

router.beforeEach((to, from) => {
  from.meta?.scrollPos && (from.meta.scrollPos.top = document.querySelector(".scrollable")?.scrollTop || 0);
})


export default router
