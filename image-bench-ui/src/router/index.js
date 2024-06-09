import {createRouter, createWebHashHistory} from 'vue-router'
import Explore from "@/views/Explore.vue";
import ImagePad from "@/views/ImagePad.vue";
import {KIND_GENERATED, KIND_TRAY, KIND_UPSCALED} from "@/consts.js";


const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/explore'
    },
    {
      path: '/explore',
      name: 'explore',
      component: Explore
    },
    {
      path: '/generated-images',
      name: 'generated-images',
      component: ImagePad,
      props: {"kind": KIND_GENERATED}
    },
    {
      path: '/image-tray',
      name: 'image-tray',
      component: ImagePad,
      props: {"kind": KIND_TRAY}
    },
    {
      path: '/upscaled-images',
      name: 'upscaled-images',
      component: ImagePad,
      props: {"kind": KIND_UPSCALED}
    }
  ]
})

export default router
