import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from "vite-plugin-singlefile"


export default ({ mode }) => {
// https://vitejs.dev/config/

  return defineConfig({
    build: {
      // Set to false to disable JS/CSS minification
      minify: false,
    },
    plugins: [
      vue(),
      VueDevTools(),
      viteSingleFile(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  });
}
