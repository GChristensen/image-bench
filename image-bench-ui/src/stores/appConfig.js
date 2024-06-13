import {defineStore} from "pinia";
import {computed} from "vue";

export const useAppConfigStore = defineStore('appConfig', () => {
    const _config = {};

    const automaticallyClearGeneratedImages = computed({
        get() {
            return _config.automaticallyClearGeneratedImages;
        },
        set(v) {
            _config.automaticallyClearGeneratedImages = v;
            return persist();
        }
    });

    const repositionConfigPresetsDropdown = computed({
        get() {
            return _config.repositionConfigPresetsDropdown;
        },
        set(v) {
            _config.repositionConfigPresetsDropdown = v;
            return persist();
        }
    });

    async function init() {
        const response = await fetch("/image-bench/config.json");

        if (response.ok && response.headers.get("content-length") > 0) {
            Object.assign(_config, await response.json())         ;
        }
    }

    async function persist() {
        const payload = JSON.stringify(_config);
        await fetch("/image-bench/config.json", {method: "post", body: payload});
    }

    return {
        init, persist,
        repositionConfigPresetsDropdown,
        automaticallyClearGeneratedImages
    };
});