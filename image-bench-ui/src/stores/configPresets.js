import {ref} from 'vue'
import {defineStore} from 'pinia'

export const useConfigPresetsStore = defineStore('configPresets', () => {
    const presets = ref([]);

    async function init() {
        if (!presets.value.length) {
            const response = await fetch( "/image-bench/config_presets");

            if (response.ok && response.headers.get("content-length") > 0) {
                presets.value = await response.json();
            }
        }
    }

    return { init, presets }
})
