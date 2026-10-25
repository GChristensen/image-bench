<script setup>
/**
 * Reference images of the edit models (Forge ImageStitch of the shown WebUI tab, or the LoadImage nodes marked
 * ib:ref in ComfyUI), named Image 1, 2, ...
 * as edit prompts refer to them. Images are added by browsing, dropping (also from the Generated tab
 * and the trays) or pasting, and from the editor if it sends here.
 * A ComfyUI video workflow also has reference videos and audio (ib:vref, ib:aref), checked against the limits of the
 * node that takes them, and the video an "Extend video" continues (ib:ext).
 */
import {computed, reactive, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";
import {editorName, editorShortName} from "@/editor.js";
import NumberStepper from "@/components/NumberStepper.vue";
import {imageFilesFromDataTransfer, pickImageFiles} from "@/imageFiles.js";
import {peekDraggedImages} from "@/imageDrag.js";
import {AUDIO_PLACEHOLDER, isStill, videoThumbUrl} from "@/media.js";

const props = defineProps({
  // {enabled, images: [src], maxSize}; in ComfyUI also videos, audios ([{url, name, limits}], null without slots),
  // hasContinuation and continuation ({url, name} of the video to extend)
  references: {
    type: Object,
    required: true
  },
  // Frames of the Video tab, compared with the length of a guide video
  frames: {
    type: Number,
    default: null
  },
  // Where images sent from the editor go: input or reference
  editorTarget: {
    type: String,
    required: true,
    validator: value => ["input", "reference"].includes(value)
  },
  // Feature check (useFeatures): referencesEnabled, referenceMaxSize
  has: {
    type: Function,
    default: () => true
  }
});

const emit = defineEmits(['add', 'remove', 'clear', 'enabled', 'max-size', 'editor-target']);

const dragOver = ref(false);

// The workflow takes video or audio files too
const media = computed(() => !!(props.references.videos || props.references.audios));

const hasReferences = computed(() => !!(props.references.images.length || props.references.videos?.length
  || props.references.audios?.length));

async function onBrowse() {
  const files = await pickImageFiles(true, {media: media.value});

  if (files.length)
    emit('add', files);
}

// The files of dragged video and audio cards (their native URL is that of the thumbnail)
async function draggedMediaFiles() {
  const files = [];

  for (const image of peekDraggedImages().filter(image => !isStill(image))) {
    const blob = await (await fetch(image.imageUrl)).blob();
    const name = new URL(image.imageUrl, location.href).searchParams.get("filename") || image.fileName || "video.mp4";
    files.push(new File([blob], name, {type: blob.type}));
  }

  return files;
}

async function onDrop(e) {
  dragOver.value = false;

  const dragged = media.value ? await draggedMediaFiles() : [];
  const files = dragged.length ? dragged : await imageFilesFromDataTransfer(e.dataTransfer, {media: media.value});

  if (files.length)
    emit('add', files);
}

async function onPaste(e) {
  const files = await imageFilesFromDataTransfer(e.clipboardData, {media: media.value});

  if (files.length) {
    e.preventDefault();
    emit('add', files);
  }
}

// ---------- Clips ----------

// Duration, frame rate and frame count of the clips by URL (/image-bench/media/info), null while unknown
const clipInfo = reactive({});

watch(() => [...props.references.videos ?? [], ...props.references.audios ?? []].map(clip => clip.url), urls => {
  for (const url of urls)
    if (url && !(url in clipInfo)) {
      clipInfo[url] = null;
      fetch(`/image-bench/media/info?url=${encodeURIComponent(url)}`)
        .then(response => response.ok ? response.json() : null)
        .then(info => clipInfo[url] = info)
        .catch(() => {});
    }
}, {immediate: true});

const formatSeconds = seconds => `${Number(seconds.toFixed(1))} s`;

function describeClip(clip) {
  const info = clipInfo[clip.url];

  if (!info)
    return "";

  return [info.duration && formatSeconds(info.duration), info.fps && `${Number(info.fps.toFixed(2))} fps`,
    info.audio && info.kind === "video" && "sound"].filter(Boolean).join(" · ");
}

// Seconds of the clips of a kind by the node that takes them
function totalSeconds(clips) {
  const totals = {};

  for (const clip of clips ?? []) {
    const duration = clipInfo[clip.url]?.duration;

    if (clip.limits && duration)
      totals[clip.limits.consumer] = (totals[clip.limits.consumer] ?? 0) + duration;
  }

  return totals;
}

const videoTotals = computed(() => totalSeconds(props.references.videos));
const audioTotals = computed(() => totalSeconds(props.references.audios));

/**
 * What a clip breaks of the limits of the node that takes it (node_config.json), empty if nothing or unknown
 * @param {Object} clip - {url, limits}
 * @param {Object} totals - Seconds by consumer of the clips of its kind
 * @returns {string[]}
 */
function clipWarnings(clip, totals) {
  const info = clipInfo[clip.url];
  const limits = clip.limits;

  if (!info || !limits)
    return [];

  const warnings = [];

  if (limits.minSeconds && info.duration && info.duration < limits.minSeconds)
    warnings.push(`shorter than ${limits.minSeconds} s`);

  if (limits.maxSeconds && info.duration && info.duration > limits.maxSeconds)
    warnings.push(`longer than ${limits.maxSeconds} s`);

  if (limits.totalSeconds && totals[limits.consumer] > limits.totalSeconds)
    warnings.push(`all clips together ${formatSeconds(totals[limits.consumer])}, at most ${limits.totalSeconds} s`);

  if (limits.fps && info.fps && Math.abs(info.fps - limits.fps) > 0.5)
    warnings.push(`read as ${limits.fps} fps: plays ${info.fps > limits.fps ? "slower" : "faster"}`);

  if (limits.minFrames === "frames" && props.frames && info.frames && info.frames < props.frames)
    warnings.push(`${info.frames} frames, the video has ${props.frames}`);

  return warnings;
}
</script>

<template>
  <div class="references" @paste="onPaste">
    <div class="row">
      <label v-if="has('referencesEnabled')" class="check" title="Pass the images to the model (ImageStitch Integrated)">
        <input type="checkbox" :checked="references.enabled" @change="e => emit('enabled', e.target.checked)">Use
      </label>
      <span class="spacer"></span>
      <label v-if="has('referenceMaxSize')" class="max-size" title="Maximum side length of the references, 0 for no limit">Max side
        <NumberStepper :model-value="references.maxSize ?? ''" :min="0" :max="2048" :step="256" label="Maximum side length"
                       @update:model-value="v => emit('max-size', v)"/>
      </label>
      <button v-if="has('referenceMaxSize')" class="ib sm" :disabled="references.maxSize === 0"
              title="Any side (no size limit)" aria-label="Reset the maximum side to no limit"
              @click="emit('max-size', 0)"><AppIcon name="infinity" :size="13"/></button>
      <button class="ib sm" :disabled="!hasReferences" title="Remove all references"
              aria-label="Remove all references" @click="emit('clear')"><AppIcon name="trash" :size="13"/></button>
    </div>

    <ol class="slots" aria-label="References">
      <li v-for="(src, index) in references.images" :key="`${index}:${src}`" class="slot">
        <img :src="src" alt="">
        <span class="name">Image {{ index + 1 }}</span>
        <button class="ib sm" :aria-label="`Remove image ${index + 1}`" title="Remove"
                @click="emit('remove', index)"><AppIcon name="close" :size="13"/></button>
      </li>
      <li v-for="(clip, index) in references.videos ?? []" :key="`video:${index}:${clip.url}`" class="slot">
        <img :src="videoThumbUrl(clip.url)" alt="">
        <span class="name">Video {{ index + 1 }}
          <small :title="clip.name">{{ clip.name }}</small>
          <small v-if="describeClip(clip)">{{ describeClip(clip) }}</small>
          <small v-for="warning in clipWarnings(clip, videoTotals)" :key="warning" class="warning">{{ warning }}</small>
        </span>
        <button class="ib sm" :aria-label="`Remove video ${index + 1}`" title="Remove"
                @click="emit('remove', index, 'video')"><AppIcon name="close" :size="13"/></button>
      </li>
      <li v-for="(clip, index) in references.audios ?? []" :key="`audio:${index}:${clip.url}`" class="slot">
        <img :src="AUDIO_PLACEHOLDER" alt="">
        <span class="name">Audio {{ index + 1 }}
          <small :title="clip.name">{{ clip.name }}</small>
          <small v-if="describeClip(clip)">{{ describeClip(clip) }}</small>
          <small v-for="warning in clipWarnings(clip, audioTotals)" :key="warning" class="warning">{{ warning }}</small>
        </span>
        <button class="ib sm" :aria-label="`Remove audio ${index + 1}`" title="Remove"
                @click="emit('remove', index, 'audio')"><AppIcon name="close" :size="13"/></button>
      </li>
      <li v-if="references.continuation" class="slot continuation">
        <img :src="videoThumbUrl(references.continuation.url)" alt="">
        <span class="name">Extends
          <small :title="references.continuation.name">{{ references.continuation.name }}</small>
        </span>
        <button class="ib sm" aria-label="Do not extend the video" title="Remove"
                @click="emit('remove', 0, 'continuation')"><AppIcon name="close" :size="13"/></button>
      </li>
    </ol>

    <button type="button" class="drop" :class="{over: dragOver}" @click="onBrowse"
            @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <span><AppIcon name="upload" :size="14"/>Drop, paste or browse</span>
      <small>{{ media ? "images, videos or audio; also from Generated and the trays"
        : "or drag from Generated and the trays" }}</small>
    </button>

    <label class="row editor">
      <span class="ps">{{ editorShortName() }}</span>sends to
      <span class="select-wrap">
        <select :value="editorTarget" :aria-label="`Where images from ${editorName} go`"
                @change="e => emit('editor-target', e.target.value)">
          <option value="input">Input image</option>
          <option value="reference">New reference</option>
        </select>
        <AppIcon name="chevron" :size="14"/>
      </span>
    </label>
  </div>
</template>

<style scoped>
.references {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--ib-border);
  border-radius: 6px;
  background: var(--ib-surface);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ib-text-2);
  font-size: 12px;
}

.spacer {
  flex: 1;
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ib-text);
}

.max-size {
  display: flex;
  align-items: center;
  gap: 6px;
}

.max-size :deep(.stepper input) {
  width: 44px;
}

.slots {
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px;
  border-radius: 5px;
}

.slot:hover {
  background: var(--ib-hover);
}

.slot img {
  width: 44px;
  height: 44px;
  flex: none;
  object-fit: cover;
  border-radius: 4px;
  background: var(--ib-elev);
}

.name {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 12.5px;
}

.name small {
  overflow: hidden;
  color: var(--ib-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name small.warning {
  color: var(--ib-warn);
}

.continuation {
  border-top: 1px solid var(--ib-border);
}

.drop {
  flex: 1 0 52px;
  max-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px dashed var(--ib-border-2);
  border-radius: 6px;
  background: none;
  color: var(--ib-text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.drop span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drop small {
  color: var(--ib-muted);
  font-size: 11px;
}

.drop:hover,
.drop.over {
  border-color: var(--ib-accent-border);
  color: var(--ib-text);
}

.editor {
  padding-top: 6px;
  border-top: 1px solid var(--ib-border);
  font-size: 11px;
}

.ps {
  padding: 0 4px;
  border-radius: 3px;
  background: #31a8ff;
  color: #001e36;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
}
</style>
