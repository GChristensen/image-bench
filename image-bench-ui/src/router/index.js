import {createRouter, createWebHashHistory} from 'vue-router'
import Explore from "@/views/Explore.vue";
import ImagePad from "@/views/ImagePad.vue";
import {KIND_GENERATED, KIND_TRAY, KIND_UPSCALED} from "@/consts.js";
import Settings from "@/views/Settings.vue";

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
      redirect: '/explore'
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
      component: ImagePad,
      props: {"kind": KIND_GENERATED},
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
      component: ImagePad,
      props: {"kind": KIND_TRAY},
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
      component: ImagePad,
      props: {"kind": KIND_UPSCALED},
      meta: {
        scrollPos: {
          el: ".scrollable",
          top: 0
        },
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    }
  ]
})

router.beforeEach((to, from) => {
  from.meta?.scrollPos && (from.meta.scrollPos.top = document.querySelector(".scrollable")?.scrollTop || 0);
})


export default router
