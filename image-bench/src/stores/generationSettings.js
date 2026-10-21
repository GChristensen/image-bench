import {defineStore} from "pinia";
import {reactive, ref} from "vue";

const URL = "/image-bench/generation_settings";
const PERSIST_DELAY = 500;

const DEFAULTS = {
  variationStrength: "0.12",
  varyingSteps: "24, 26, 28, 30, 32",
  varyingDenoising: "0.42, 0.46, 0.5, 0.54, 0.6",
  // File names of the text encoders checked last in "Generate with text encoders"
  varyingTextEncoders: [],
  // Config preset by image kind
  configPresets: {}
};

// Where the settings were kept before store/generation_settings.json; taken over once
const LEGACY_KEYS = {
  variationStrength: "imageBench_variationStrength",
  varyingSteps: "imageBench_varyingSteps",
  varyingDenoising: "imageBench_varyingDenoising",
  varyingTextEncoders: "imageBench_varyingTextEncoders"
};
const LEGACY_PRESET_KEY = /^imageBench_(\w+)_configPreset$/;

function readLegacySettings() {
  const settings = {};

  try {
    for (const [name, key] of Object.entries(LEGACY_KEYS)) {
      const value = localStorage.getItem(key);

      if (value !== null)
        settings[name] = name === "varyingTextEncoders" ? JSON.parse(value) : value;
    }

    for (let i = 0; i < localStorage.length; i++) {
      const kind = LEGACY_PRESET_KEY.exec(localStorage.key(i))?.[1];

      if (kind)
        (settings.configPresets ??= {})[kind] = localStorage.getItem(localStorage.key(i));
    }
  } catch (error) {
    console.error("[Image Bench] Unable to read the generation settings of localStorage:", error);
  }

  return settings;
}

/**
 * Values of the generation dialogs and toolbars, global (not saved with the projects):
 * store/generation_settings.json as {version, settings}
 */
export const useGenerationSettingsStore = defineStore("generationSettings", () => {
  const settings = reactive({...DEFAULTS});
  const loaded = ref(false);
  let persistTimer = null;

  async function init() {
    if (loaded.value)
      return;

    try {
      const response = await fetch(URL);
      const text = response.ok ? await response.text() : "";

      if (text.trim())
        Object.assign(settings, JSON.parse(text).settings);
      else if (response.ok) {
        const legacy = readLegacySettings();

        if (Object.keys(legacy).length) {
          Object.assign(settings, legacy);
          persist();
        }
      }
    } catch (error) {
      console.error("[Image Bench] Unable to load the generation settings:", error);
    } finally {
      loaded.value = true;
    }
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      fetch(URL, {method: "post", body: JSON.stringify({version: 1, settings})})
        .catch(error => console.error("[Image Bench] Unable to save the generation settings:", error));
    }, PERSIST_DELAY);
  }

  function set(name, value) {
    settings[name] = value;
    persist();
  }

  const configPreset = kind => settings.configPresets?.[kind] ?? null;

  function setConfigPreset(kind, preset) {
    set("configPresets", {...settings.configPresets, [kind]: preset});
  }

  return {settings, loaded, init, set, configPreset, setConfigPreset};
});
