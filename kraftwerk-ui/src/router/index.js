import {createRouter, createWebHashHistory} from 'vue-router'

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
      component: () => import('../views/Explore.vue')
    },
    {
      path: '/generated-images',
      name: 'generated-images',
      component: () => import('../views/GeneratedImages.vue')
    },
    {
      path: '/upscaled-images',
      name: 'upscaled-images',
      component: () => import('../views/UpscaledImages.vue')
    }
  ]
})

export default router
