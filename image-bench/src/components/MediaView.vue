<script setup>
  import {onBeforeUnmount, onMounted, ref, watch} from "vue";
  import {AUDIO_PLACEHOLDER, KIND_AUDIO, KIND_VIDEO, getMediaVolume, pauseInlinePlayback, saveMediaVolume}
    from "@/media.js";

  /**
   * A video or audio file in a full view (the image overlay, the file viewer of the projects): it plays at once,
   * with sound, and with the native controls; Space plays and pauses unless the element has the focus (where its
   * controls take it). The volume is kept for the next file
   */

  const props = defineProps({
    src: {
      type: String,
      required: true
    },
    kind: {
      type: String,
      required: true,
      validator: value => [KIND_VIDEO, KIND_AUDIO].includes(value)
    },
    autoplay: {
      type: Boolean,
      default: true
    }
  });

  const element = ref(null);

  function prepare() {
    const media = element.value;

    if (!media)
      return;

    media.muted = false;
    media.volume = getMediaVolume();
  }

  function onKeyDown(e) {
    const media = element.value;

    if (e.code !== "Space" || !media || e.target === media || e.ctrlKey || e.altKey || e.metaKey
        || e.target.closest?.("input, textarea, select, button, [contenteditable]"))
      return;

    e.preventDefault();

    if (media.paused)
      media.play().catch(() => {});
    else
      media.pause();
  }

  watch(() => props.src, () => setTimeout(prepare));

  onMounted(() => {
    // The card that played inline stops for the full view
    pauseInlinePlayback();
    prepare();
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
<div class="media-view" :class="kind">
  <video v-if="kind === 'video'" ref="element" class="media-element" :src="src" :autoplay="autoplay" controls
         playsinline tabindex="-1" @volumechange="saveMediaVolume($event.target)"></video>
  <template v-else>
    <img class="audio-placeholder" :src="AUDIO_PLACEHOLDER" alt="" draggable="false">
    <audio ref="element" class="media-element" :src="src" :autoplay="autoplay" controls tabindex="-1"
           @volumechange="saveMediaVolume($event.target)"></audio>
  </template>
</div>
</template>

<style scoped>
.media-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  cursor: auto;
}

.media-view.video .media-element {
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  background: #000;
}

.audio-placeholder {
  max-width: min(640px, 100%);
  min-height: 0;
  flex: 0 1 auto;
  object-fit: contain;
  border-radius: 6px;
  user-select: none;
}

.media-view.audio .media-element {
  width: min(640px, 100%);
  flex-shrink: 0;
}
</style>
