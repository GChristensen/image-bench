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

    const addModelInfoButton = computed({
        get() {
            return _config.addModelInfoButton;
        },
        set(v) {
            _config.addModelInfoButton = v;
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

    // Generate LoRA-free images for each model when exploring LoRAs (enabled unless set to false)
    const exploreLoraFreeImages = computed({
        get() {
            return _config.exploreLoraFreeImages ?? true;
        },
        set(v) {
            _config.exploreLoraFreeImages = v;
            return persist();
        }
    });

    // Remember txt2img prompts and parameters across WebUI reloads (disabled unless set to true)
    const persistGenerationParams = computed({
        get() {
            return _config.persistGenerationParams ?? false;
        },
        set(v) {
            _config.persistGenerationParams = v;
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
        addModelInfoButton,
        automaticallyClearGeneratedImages,
        exploreLoraFreeImages,
        persistGenerationParams
    };
});