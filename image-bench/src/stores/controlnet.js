import {defineStore} from "pinia";
import {ref} from "vue";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

const UNIT_KEY = "imageBench_controlNetUnit";

/**
 * State of the ControlNet unit mirrored by the ControlNet tab, as the host page reports it
 */
export const useControlNetStore = defineStore('controlNet', () => {
    const storage = useLocalStorage();
    // Unit chosen in the ControlNet tab (0-based, WebUI labels the units from 1), which also receives
    // the images sent to ControlNet from the image lists and Photoshop
    const selectedUnit = ref(Math.max(0, parseInt(storage.getItem(UNIT_KEY)) || 0))
    // Generation tab whose ControlNet is mirrored: "txt2img" or "img2img"
    const tab = ref("txt2img")
    const unit = ref(0)
    // Units of the tab: [{enabled}]
    const units = ref([])
    // Whether WebUI has the unit (Forge ControlNet Integrated), null until reported
    const available = ref(null)
    // Parameters of the unit (CONTROLNET_STATE), null until received: enabled, pixelPerfect, allowPreview, useMask,
    // independent (img2img, else null), controlType, preprocessor, model, weight, guidanceStart, guidanceEnd,
    // controlMode, resizeMode, processorRes, thresholdA, thresholdB (WebUI, null without the slider)
    const params = ref(null)
    // Radio choices: controlType, controlMode, resizeMode
    const options = ref({controlType: [], controlMode: [], resizeMode: []})
    // Preprocessor sliders as WebUI shows them for the preprocessor: {processorRes, thresholdA, thresholdB},
    // each {label, min, max, step, visible} or null if absent; their values are in params
    const sliders = ref({})
    // Features the host page reports as present or missing ({name: boolean}), null if it reports none (WebUI)
    const features = ref(null)
    // The preprocessor is running
    const running = ref(false)
    // Images of the unit (CONTROLNET_IMAGES): sources, null where there is none;
    // pose is the OpenPose JSON of the preview as a data URL (WebUI, openpose preprocessors)
    const images = ref({tab: null, unit: null, image: null, mask: null, preview: null, pose: null})

    function onSDEvent(e) {
        if (e.type === "CONTROLNET_STATE") {
            tab.value = e.tab;
            unit.value = e.unit;
            units.value = e.units;
            available.value = e.available;
            params.value = e.available ? e.params : null;
            options.value = e.options ?? {controlType: [], controlMode: [], resizeMode: []};
            sliders.value = e.sliders ?? {};
            features.value = e.features ?? null;
            running.value = e.running;
        }
        else if (e.type === "CONTROLNET_IMAGES") {
            images.value = {tab: e.tab, unit: e.unit, image: e.image, mask: e.mask, preview: e.preview, pose: e.pose ?? null};
        }
    }

    function selectUnit(index) {
        selectedUnit.value = index;
        storage.setItem(UNIT_KEY, String(index));
    }

    return {selectedUnit, tab, unit, units, available, params, options, sliders, features, running, images, onSDEvent, selectUnit};
})
