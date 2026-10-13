<script setup>
/**
 * PNG Info of the Generate tab: the generation parameters of an image chosen, dropped or pasted here
 * (also a card dragged from the image lists), applied to the Generate tab by the groups checked below.
 * The parameters are mapped by src/infotext.js; values not available in the host are listed and left out.
 */
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {fetchImageInfo, infotextToForm, PNG_INFO_GROUPS} from "@/infotext.js";
import {imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";
import {useLocalStorage} from "@/composables/useLocalStorage.js";

// Groups unchecked by the user
const UNCHECKED_KEY = "imageBench_pngInfoUnchecked";

const props = defineProps({
  // Context of infotextToForm(): features, mode and the choices of the Generate tab
  context: {
    type: Object,
    required: true
  },
  // Image to show at once, e.g. dropped on the prompt
  file: {
    type: File,
    default: null
  }
});

const emit = defineEmits(['close', 'apply']);

const storage = useLocalStorage();

const imageUrl = ref(null);
const fileName = ref("");
const info = ref(null);
const error = ref("");
const loading = ref(false);
const dragOver = ref(false);
const showRaw = ref(false);
const unchecked = ref(new Set(storage.getJsonItem(UNCHECKED_KEY, [])));

async function load(file) {
  if (imageUrl.value)
    URL.revokeObjectURL(imageUrl.value);

  imageUrl.value = URL.createObjectURL(file);
  fileName.value = file.name;
  info.value = null;
  error.value = "";
  loading.value = true;

  try {
    info.value = await fetchImageInfo(file);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function onPick() {
  const [file] = await pickImageFiles();

  if (file)
    await load(file);
}

async function onDrop(e) {
  dragOver.value = false;

  const [file] = await imageFilesFromDataTransfer(e.dataTransfer);

  if (file)
    await load(file);
}

async function onPaste(e) {
  const [file] = await imageFilesFromDataTransfer(e.clipboardData);

  if (file) {
    e.preventDefault();
    await load(file);
  }
}

onMounted(() => {
  window.addEventListener("paste", onPaste);

  if (props.file)
    load(props.file);
});

onBeforeUnmount(() => {
  window.removeEventListener("paste", onPaste);

  if (imageUrl.value)
    URL.revokeObjectURL(imageUrl.value);
});

// ---------- Parameters ----------

const parameters = computed(() => info.value?.parameters ?? {});
const hasParameters = computed(() => Object.keys(parameters.value).length > 0);

const formatValue = value => value && typeof value === "object"
  ? Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(", ")
  : String(value);

// The parameter line of the infotext, by key as written there
const otherParameters = computed(() => Object.entries(parameters.value)
  .filter(([key]) => key !== "prompt" && key !== "negative prompt")
  .map(([key, value]) => ({key, value: formatValue(value)})));

const groups = computed(() => hasParameters.value ? infotextToForm(parameters.value, props.context) : {});

const groupItems = computed(() => PNG_INFO_GROUPS.map(({id, label}) => {
  const values = groups.value[id]?.values ?? {};

  return {
    id,
    label: id === "hires" && props.context.mode !== "txt2img" ? "Denoising" : label,
    available: Object.keys(values).length > 0,
    title: Object.entries(values).map(([name, value]) =>
      `${name}: ${Array.isArray(value) ? value.join(", ") : String(value).slice(0, 80)}`).join("\n")
  };
}));

const notes = computed(() => Object.entries(groups.value)
  .filter(([id]) => !unchecked.value.has(id))
  .flatMap(([, group]) => group.notes));

const values = computed(() => Object.assign({}, ...Object.entries(groups.value)
  .filter(([id]) => !unchecked.value.has(id))
  .map(([, group]) => group.values)));

const canApply = computed(() => Object.keys(values.value).length > 0);

function toggleGroup(id) {
  const set = new Set(unchecked.value);

  if (set.has(id))
    set.delete(id);
  else
    set.add(id);

  unchecked.value = set;
}

watch(unchecked, set => storage.setJsonItem(UNCHECKED_KEY, [...set]));

function apply() {
  if (canApply.value)
    emit('apply', values.value);
}

const copied = ref(false);

async function copyInfotext() {
  await navigator.clipboard.writeText(info.value?.infotext ?? "");
  copied.value = true;
  setTimeout(() => copied.value = false, 1200);
}
</script>

<template>
  <Teleport to="body">
    <div class="png-info-container">
      <div class="backdrop" @click="emit('close')"></div>
      <div class="window" role="dialog" aria-modal="true" aria-label="PNG Info">
        <div class="header">
          <h3>PNG Info</h3>
          <span class="file-name" :title="fileName">{{ fileName }}</span>
          <button type="button" class="ib flat" title="Close" aria-label="Close" @click="emit('close')">
            <AppIcon name="close" :size="14"/></button>
        </div>

        <div class="body">
          <button type="button" class="frame" :class="{dragover: dragOver}"
                  title="Click to choose an image, or drop or paste one"
                  @click="onPick" @dragover.prevent="dragOver = true" @dragleave="dragOver = false"
                  @drop.prevent="onDrop">
            <img v-if="imageUrl" :src="imageUrl" alt="">
            <span v-else class="empty"><AppIcon name="upload" :size="22"/>Drop, paste or click to choose an image</span>
          </button>

          <div class="info">
            <div v-if="loading" class="status"><span class="spinner"></span>Reading…</div>
            <div v-else-if="error" class="status error">{{ error }}</div>
            <div v-else-if="!info" class="status">The generation parameters of the image appear here</div>
            <div v-else-if="!hasParameters" class="status">The image has no generation parameters</div>

            <template v-else-if="showRaw">
              <textarea class="raw" readonly :value="info.infotext"></textarea>
            </template>

            <template v-else>
              <div class="section">
                <span class="label-small">Prompt</span>
                <div class="text">{{ parameters["prompt"] }}</div>
              </div>
              <div v-if="parameters['negative prompt']" class="section">
                <span class="label-small">Negative prompt</span>
                <div class="text">{{ parameters["negative prompt"] }}</div>
              </div>
              <dl v-if="otherParameters.length" class="params">
                <template v-for="item in otherParameters" :key="item.key">
                  <dt>{{ item.key }}</dt>
                  <dd>{{ item.value }}</dd>
                </template>
              </dl>
            </template>

            <div v-if="info?.infotext" class="info-actions">
              <button type="button" class="btn outline small" :class="{on: showRaw}" :aria-pressed="showRaw"
                      @click="showRaw = !showRaw">Raw</button>
              <button type="button" class="btn outline small" @click="copyInfotext">
                <AppIcon :name="copied ? 'check' : 'copy'" :size="12"/>Copy</button>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="groups" role="group" aria-label="Parameters to apply">
            <label v-for="item in groupItems" :key="item.id" class="group-check" :class="{off: !item.available}"
                   :title="item.available ? item.title : 'Not in the image, or not available here'">
              <input type="checkbox" :checked="!unchecked.has(item.id)" :disabled="!item.available"
                     @change="toggleGroup(item.id)">{{ item.label }}
            </label>
          </div>
          <div v-if="notes.length" class="notes">
            <span v-for="note in notes" :key="note"><AppIcon name="alert" :size="12"/>{{ note }}</span>
          </div>
          <div class="buttons">
            <button type="button" class="btn outline" @click="emit('close')">Cancel</button>
            <button type="button" class="btn primary" :disabled="!canApply" @click="apply">Apply</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.png-info-container {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
}

.window {
  position: relative;
  width: min(1100px, calc(100vw - 32px));
  height: min(720px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  background: var(--ib-elev);
  border: 1px solid var(--ib-border-2);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  color: var(--ib-text);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 18px;
  border-bottom: 1px solid var(--ib-border);
}

.header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ib-text-2);
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 14px;
  padding: 14px 18px;
}

.frame {
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  background: var(--ib-bg);
  border: 1px dashed var(--ib-border-2);
  border-radius: 6px;
  color: var(--ib-text-2);
  font: inherit;
  cursor: pointer;
}

.frame:hover, .frame.dragover {
  border-color: var(--ib-accent-border);
}

.frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}

.info {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
}

.status.error {
  color: var(--ib-danger-text);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.text {
  padding: 6px 8px;
  background: var(--ib-bg);
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.params {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 12px;
  margin: 0;
}

.params dt {
  color: var(--ib-text-2);
  text-transform: capitalize;
}

.params dd {
  margin: 0;
  overflow-wrap: anywhere;
  user-select: text;
}

.raw {
  flex: 1;
  min-height: 200px;
  resize: none;
  padding: 8px;
  font: inherit;
  background: var(--ib-bg);
  border: 1px solid var(--ib-border);
  border-radius: 5px;
  color: var(--ib-text);
}

.info-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 12px 18px;
  border-top: 1px solid var(--ib-border);
}

.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.group-check {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.group-check.off {
  opacity: 0.45;
  cursor: default;
}

.notes {
  flex-basis: 100%;
  order: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  color: var(--ib-warn);
}

.notes span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
</style>
