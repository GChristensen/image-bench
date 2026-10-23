import {defineStore} from "pinia";
import {computed, reactive} from "vue";
import {ACCENT_COLORS, DEFAULT_ACCENT_COLOR, DEFAULT_GENERATE_PRESET_IMAGES, DEFAULT_GENERATE_UI_PRESETS} from "@/consts.js";

const DEFAULT_INPAINT_RESET_SIZE = 1024;

export const useAppConfigStore = defineStore('appConfig', () => {
    const _config = reactive({});

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

    // Open Image Bench in a popup window instead of a browser tab (disabled unless set to true)
    const openInWindow = computed({
        get() {
            return _config.openInWindow ?? false;
        },
        set(v) {
            _config.openInWindow = v;
            return persist();
        }
    });

    // The Image Bench button of the host UI opens Image Bench from that page; unset, it shows the link to the app
    // (/image-bench/app), which loads the host UI in its iframe
    const openFromHostUI = computed({
        get() {
            return _config.openFromHostUI ?? false;
        },
        set(v) {
            _config.openFromHostUI = v;
            return persist();
        }
    });

    // Civitai domain of the model pages: "com" or "red"
    const civitaiDomain = computed({
        get() {
            return _config.civitaiDomain === "red" ? "red" : "com";
        },
        set(v) {
            _config.civitaiDomain = v;
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

    // Flash the Generated tab when an image of a generation started from the Generate tab arrives
    // (enabled unless set to false)
    const flashGeneratedTab = computed({
        get() {
            return _config.flashGeneratedTab ?? true;
        },
        set(v) {
            _config.flashGeneratedTab = v;
            return persist();
        }
    });

    // Keep the session filmstrip of the Generate tab shown when a batch ends (disabled unless set to true)
    const keepSessionStrip = computed({
        get() {
            return _config.keepSessionStrip ?? false;
        },
        set(v) {
            _config.keepSessionStrip = v;
            return persist();
        }
    });

    // Show only the common sizes in the size picker of the Generate tab: 1:1, A4 and the ratios of a medium
    // (enabled unless set to false)
    const commonSizesOnly = computed({
        get() {
            return _config.commonSizesOnly ?? true;
        },
        set(v) {
            _config.commonSizesOnly = v;
            return persist();
        }
    });

    // Show the action rim of an image on hover, not only while Ctrl is held (disabled unless set to true)
    const rimOnHover = computed({
        get() {
            return _config.rimOnHover ?? false;
        },
        set(v) {
            _config.rimOnHover = v;
            return persist();
        }
    });

    // Remember txt2img prompts and parameters across WebUI reloads (enabled unless set to false)
    const persistGenerationParams = computed({
        get() {
            return _config.persistGenerationParams ?? true;
        },
        set(v) {
            _config.persistGenerationParams = v;
            return persist();
        }
    });

    // The four UI presets shown as buttons in the Generate tab
    const generateUiPresets = computed({
        get() {
            const presets = _config.generateUiPresets;
            return Array.isArray(presets) && presets.length === DEFAULT_GENERATE_UI_PRESETS.length
                ? presets
                : DEFAULT_GENERATE_UI_PRESETS;
        },
        set(v) {
            _config.generateUiPresets = v;
            return persist();
        }
    });

    // Number of images set by the preset count button of the Generate tab
    const generatePresetImages = computed({
        get() {
            const images = parseInt(_config.generatePresetImages);
            return images > 1 ? images : DEFAULT_GENERATE_PRESET_IMAGES;
        },
        set(v) {
            const images = parseInt(v);
            _config.generatePresetImages = images > 1 ? images : DEFAULT_GENERATE_PRESET_IMAGES;
            return persist();
        }
    });

    // Resize to set by the reset button of the inpaint crop in the Generate tab (1024 × 1024 unless set)
    const inpaintResetWidth = computed({
        get() {
            return parseInt(_config.inpaintResetWidth) > 0 ? parseInt(_config.inpaintResetWidth) : DEFAULT_INPAINT_RESET_SIZE;
        },
        set(v) {
            _config.inpaintResetWidth = parseInt(v) > 0 ? parseInt(v) : DEFAULT_INPAINT_RESET_SIZE;
            return persist();
        }
    });

    const inpaintResetHeight = computed({
        get() {
            return parseInt(_config.inpaintResetHeight) > 0 ? parseInt(_config.inpaintResetHeight) : DEFAULT_INPAINT_RESET_SIZE;
        },
        set(v) {
            _config.inpaintResetHeight = parseInt(v) > 0 ? parseInt(v) : DEFAULT_INPAINT_RESET_SIZE;
            return persist();
        }
    });

    // Root directory of the projects of the Library tab, as the server sees it (local or UNC path)
    const projectRoot = computed({
        get() {
            return _config.projectRoot ?? "";
        },
        set(v) {
            _config.projectRoot = String(v ?? "").trim();
            return persist();
        }
    });

    // Folder of the Markdown docs of the Library tab; empty: the docs folder of the extension
    const docsRoot = computed({
        get() {
            return _config.docsRoot ?? "";
        },
        set(v) {
            _config.docsRoot = String(v ?? "").trim();
            return persist();
        }
    });

    const accentColor = computed({
        get() {
            return ACCENT_COLORS[_config.accentColor] ? _config.accentColor : DEFAULT_ACCENT_COLOR;
        },
        set(v) {
            _config.accentColor = v;
            applyAccentColor();
            return persist();
        }
    });

    function applyAccentColor() {
        const color = ACCENT_COLORS[accentColor.value];
        const style = document.documentElement.style;
        style.setProperty("--ib-accent", color.accent);
        style.setProperty("--ib-accent-hover", color.hover);
        style.setProperty("--ib-accent-ink", color.ink);
        style.setProperty("--ib-accent-soft", `rgba(${color.rgb}, 0.13)`);
        style.setProperty("--ib-accent-border", `rgba(${color.rgb}, 0.4)`);
    }

    async function init() {
        const response = await fetch("/image-bench/config.json");

        if (response.ok && response.headers.get("content-length") > 0) {
            Object.assign(_config, await response.json())         ;
        }

        applyAccentColor();
    }

    async function persist() {
        const payload = JSON.stringify(_config);
        await fetch("/image-bench/config.json", {method: "post", body: payload});
    }

    return {
        init, persist,
        repositionConfigPresetsDropdown,
        addModelInfoButton,
        openInWindow,
        openFromHostUI,
        civitaiDomain,
        automaticallyClearGeneratedImages,
        exploreLoraFreeImages,
        flashGeneratedTab,
        keepSessionStrip,
        commonSizesOnly,
        rimOnHover,
        persistGenerationParams,
        generateUiPresets,
        generatePresetImages,
        inpaintResetWidth,
        inpaintResetHeight,
        projectRoot,
        docsRoot,
        accentColor
    };
});