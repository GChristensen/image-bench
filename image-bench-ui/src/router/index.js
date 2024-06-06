import {createRouter, createWebHashHistory} from 'vue-router'
import Explore from "@/views/Explore.vue";
import GeneratedImages from "@/views/GeneratedImages.vue";
import UpscaledImages from "@/views/UpscaledImages.vue";

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
      component: GeneratedImages
    },
    {
      path: '/image-tray',
      name: 'image-tray',
      component: GeneratedImages,
      props: {isTray: true}
    },
    {
      path: '/upscaled-images',
      name: 'upscaled-images',
      component: UpscaledImages
    }
  ]
})

export default router
