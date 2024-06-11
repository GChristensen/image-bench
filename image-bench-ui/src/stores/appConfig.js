import {defineStore} from "pinia";
import {reactive, ref} from "vue";

export const useAppConfigStore = defineStore('appConfig', () => {
    const config = reactive({});

    async function init() {
        const response = await fetch("/image-bench/config.json");

        if (response.ok && response.headers.get("content-length") > 0) {
            Object.assign(config, await response.json())         ;
        }
    }

    async function persist() {
        const payload = JSON.stringify(config);
        await fetch("/image-bench/config.json", {method: "post", body: payload});
    }

    return {config, init, persist};
});