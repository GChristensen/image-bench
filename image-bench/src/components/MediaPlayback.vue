<script setup>
  import {computed, nextTick, onBeforeUnmount, ref} from "vue";
  import {KIND_AUDIO, KIND_VIDEO, getMediaVolume, startedPlayback, stoppedPlayback} from "@/media.js";
  import AppIcon from "@/components/AppIcon.vue";

  /**
   * Inline playback of a video or audio card, laid over its preview: only the play button plays, a click on the
   * playing video opens the full view like a click on the preview. A video plays in place of the thumbnail,
   * which comes back when it ends; audio plays without a picture, its position shown by the ring of the button
   */

  const emit = defineEmits(["open"]);

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
    // Smaller button, for small cards
    compact: {
      type: Boolean,
      default: false
    }
  });

  const element = ref(null);
  // The media element is mounted from the first play until it ends
  const active = ref(false);
  const paused = ref(true);
  const progress = ref(0);

  const RING_RADIUS = 21;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
  const ringOffset = computed(() => RING_LENGTH * (1 - progress.value));

  async function toggle() {
    if (!active.value) {
      active.value = true;
      await nextTick();
    }

    const media = element.value;

    if (!media)
      return;

    if (media.paused) {
      media.volume = getMediaVolume();
      media.play().catch(() => {});
    } else
      media.pause();
  }

  function onPlay() {
    paused.value = false;
    startedPlayback(element.value);
  }

  function onPause() {
    paused.value = true;
  }

  function onTimeUpdate() {
    const media = element.value;
    progress.value = media?.duration ? media.currentTime / media.duration : 0;
  }

  function onEnded() {
    stop();
  }

  function stop() {
    stoppedPlayback(element.value);
    active.value = false;
    paused.value = true;
    progress.value = 0;
  }

  function onVideoAuxClick(e) {
    if (e.button === 1)
      emit("open", e);
  }

  onBeforeUnmount(() => {
    element.value?.pause();
    stoppedPlayback(element.value);
  });
</script>

<template>
<div class="media-playback" :class="{compact}">
  <video v-if="kind === 'video' && active" ref="element" class="inline-video" :src="src" autoplay playsinline
         draggable="false" @play="onPlay" @pause="onPause" @timeupdate="onTimeUpdate" @ended="onEnded"
         @click="emit('open', $event)" @mousedown.middle.prevent @auxclick="onVideoAuxClick"></video>
  <audio v-if="kind === 'audio' && active" ref="element" :src="src" autoplay
         @play="onPlay" @pause="onPause" @timeupdate="onTimeUpdate" @ended="onEnded"></audio>

  <button type="button" class="play-button" :class="{playing: !paused && kind === 'video'}" :aria-label="paused ? 'Play' : 'Pause'"
          :title="paused ? 'Play' : 'Pause'"
          @click.stop="toggle" @mousedown.middle.prevent @auxclick.stop>
    <svg v-if="active" class="ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" :r="RING_RADIUS" :stroke-dasharray="RING_LENGTH" :stroke-dashoffset="ringOffset"/>
    </svg>
    <AppIcon :name="paused ? 'play' : 'pause'" :size="compact ? 16 : 22"/>
  </button>

  <div v-if="kind === 'video' && active" class="progress"><span :style="{width: `${progress * 100}%`}"></span></div>
</div>
</template>

<style scoped>
/* Over the preview; only the button and the playing video take the pointer */
.media-playback {
  position: absolute;
  inset: 0;
  pointer-events: none;
  line-height: normal;
}

.inline-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  border-radius: 4px;
  pointer-events: auto;
  cursor: pointer;
}

.play-button {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 48px;
  margin: -24px 0 0 -24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(17, 19, 23, 0.6);
  color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85), 0 2px 8px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.15s, background 0.15s, opacity 0.15s;
}

.play-button:hover {
  background: rgba(17, 19, 23, 0.8);
  transform: scale(1.08);
}

.play-button:focus-visible {
  outline: 2px solid var(--ib-accent);
  outline-offset: 2px;
}

/* A playing video shows its button only while hovered */
.play-button.playing {
  opacity: 0;
}

.media-playback:hover .play-button.playing {
  opacity: 1;
}

.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  pointer-events: none;
}

.ring circle {
  fill: none;
  stroke: var(--ib-accent);
  stroke-width: 3;
  transition: stroke-dashoffset 0.25s linear;
}

.compact .play-button {
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
}

.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0 0 4px 4px;
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--ib-accent);
}
</style>
