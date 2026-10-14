import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { APP_TITLE } from './host.js'

// The popups of the WebUI and ComfyUI extensions are told apart by the host in the title
document.title = APP_TITLE

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
