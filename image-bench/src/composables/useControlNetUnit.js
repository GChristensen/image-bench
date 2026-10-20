import {computed, reactive, ref, watch} from "vue";
import {useControlNetStore} from "@/stores/controlnet.js";
import {useWebUIBridge} from "@/composables/useWebUIBridge.js";

// A value edited here is not overwritten by the polled host value for this long,
// which covers the send delay and the next poll
const EDIT_HOLD = 2000;
const SEND_DELAY = 250;

const PREPROCESSOR_SLIDERS = ["processorRes", "thresholdA", "thresholdB"];

const NO_IMAGES = {image: null, mask: null, preview: null, pose: null};

/**
 * A ControlNet unit mirrored both ways (CONTROLNET_STATE / CONTROLNET_IMAGES of stores/controlnet.js): the form
 * with its edits, the preprocessor and model choices and the staleness of the preview. Shared by the ControlNet tab
 * and the ControlNet group of the Generate tab; the caller subscribes to the unit.
 * @param {Object} options
 * @param {import("vue").Ref<number>} options.unit - Unit shown
 * @param {import("vue").Ref<string>} options.tab - Generation tab shown ('txt2img' or 'img2img')
 * @param {(name: string) => boolean} options.has - ControlNet feature check (useFeatures)
 */
export function useControlNetUnit({unit, tab, has}) {
  const cn = useControlNetStore();
  const webUI = useWebUIBridge();

  // The state reported by the host is that of the unit and tab shown
  const current = computed(() => cn.unit === unit.value && cn.tab === tab.value);
  const connected = computed(() => current.value && !!cn.params);

  // ---------- Mirrored parameters ----------

  const form = reactive({});
  const editedAt = {};
  let pending = {};
  let sendTimeout = null;
  // Unit and tab of the values in the form
  let formKey = null;

  watch(() => cn.params, params => {
    if (!current.value)
      return;

    const key = `${cn.tab}:${cn.unit}`;

    if (key !== formKey) {
      resetForm();
      formKey = key;
    }

    const now = Date.now();

    for (const [name, value] of Object.entries(params || {}))
      if (!(name in pending) && now - (editedAt[name] || 0) > EDIT_HOLD)
        form[name] = value;
  }, {immediate: true});

  // Another unit or tab: its values are shown as the host reports them
  function resetForm() {
    for (const name of Object.keys(form))
      delete form[name];

    for (const name of Object.keys(editedAt))
      delete editedAt[name];

    formKey = null;
  }

  function setParams(values) {
    const now = Date.now();

    for (const [name, value] of Object.entries(values)) {
      form[name] = value;
      editedAt[name] = now;
      pending[name] = value;
    }

    clearTimeout(sendTimeout);
    sendTimeout = setTimeout(flushParams, SEND_DELAY);
  }

  function setParam(name, value) {
    setParams({[name]: value});
  }

  function flushParams() {
    clearTimeout(sendTimeout);

    if (Object.keys(pending).length)
      webUI.setControlNetParams(unit.value, pending);

    pending = {};
  }

  // The timestep range keeps its start before its end
  function setGuidance(name, value) {
    const number = Number(value);

    if (name === "guidanceStart")
      setParams(number > form.guidanceEnd ? {guidanceStart: number, guidanceEnd: number} : {guidanceStart: number});
    else
      setParams(number < form.guidanceStart ? {guidanceStart: number, guidanceEnd: number} : {guidanceEnd: number});
  }

  // ---------- Choices ----------

  // Preprocessors and models of the control type, as WebUI offers them
  const choices = ref({preprocessors: [], models: []});
  // WebUI offers the models whose file names match the control type, all of them after they are refreshed
  // until the type is changed
  const allModels = ref(false);
  let choicesRequest = 0;

  async function loadChoices(type) {
    const request = ++choicesRequest;
    const query = `type=${encodeURIComponent(type || "All")}&all_models=${allModels.value}`;

    try {
      const response = await fetch(`/image-bench/controlnet/choices?${query}`);
      const data = response.ok ? await response.json() : {preprocessors: [], models: []};

      if (request === choicesRequest)
        choices.value = data;
    } catch (e) {
      console.error("Unable to load the ControlNet choices:", e);
    }
  }

  // Without control types (ComfyUI) all preprocessors and models are listed
  watch(() => form.controlType, (type, oldType) => {
    if (oldType)
      allModels.value = false;

    if (type || !has("controlType"))
      loadChoices(type);
  }, {immediate: true});

  // ComfyUI reports the models of the unit's loader node, which replace the list of the backend
  const modelChoices = computed(() => cn.options.models ?? choices.value.models);

  // ---------- Images ----------

  const images = computed(() => cn.images.tab === tab.value && cn.images.unit === unit.value ? cn.images : NO_IMAGES);

  // The sliders WebUI shows for the preprocessor (Resolution only without Pixel Perfect), with its labels and ranges
  const preprocessorSliders = computed(() => has("preprocessorParams") && current.value
    ? PREPROCESSOR_SLIDERS.filter(name => cn.sliders[name]?.visible).map(name => ({name, ...cn.sliders[name]}))
    : []);

  // The preprocessor and its slider values as the host reports them, taken when a preview arrives;
  // the preview is stale when they change after it was made (WebUI may keep it)
  const preprocessorSignature = computed(() => current.value && cn.params
    ? JSON.stringify([cn.params.preprocessor, ...preprocessorSliders.value.map(slider => cn.params[slider.name])])
    : null);
  const previewSignature = ref(null);

  watch(() => images.value.preview, preview => previewSignature.value = preview ? preprocessorSignature.value : null,
    {immediate: true});

  // A preview reported before the parameters is taken as made with them
  watch(preprocessorSignature, signature => {
    if (images.value.preview && previewSignature.value === null)
      previewSignature.value = signature;
  });

  const previewStale = computed(() => !!images.value.preview && previewSignature.value !== null
    && preprocessorSignature.value !== null && previewSignature.value !== preprocessorSignature.value);

  return {
    current, connected, form, setParams, setParam, flushParams, resetForm, setGuidance,
    choices, allModels, loadChoices, modelChoices, images, preprocessorSliders, previewStale
  };
}
