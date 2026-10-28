<script setup>
import {computed, ref, watch} from "vue";
import {rimActionGroups, rimReuseExtras, runImageAction, runRimReuseExtra} from "@/imageActions.js";
import {useShiftKey} from "@/composables/useShiftKey.js";
import {useCtrlKey} from "@/composables/useCtrlKey.js";
import ActionRim from "@/components/ActionRim.vue";

/**
 * Index badge, comment and marking shown over an image of the Compare tab (strip item or crop cell); holding Ctrl
 * over the image or a middle click on it (rimToggled, kept by the view) shows its action rim (ActionRim.vue), with
 * the view's removeImage handler as its Delete sector.
 * The other actions are in the context menu and the keys.
 * The root takes no pointer events, so that drags on the image reach the view; its controls do. Their clicks
 * stop here: a control may re-render away before the click bubbles on, so the image could no longer tell it came
 * from the chrome.
 */
const props = defineProps({
  image: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  // Action context (imageActions.js)
  ctx: {
    type: Object,
    required: true
  },
  // The pointer is over the image: Ctrl shows the action rim, Shift its alternative actions
  hovered: {
    type: Boolean,
    default: false
  },
  // A middle click on the image toggled the rim on (the view clears it when the pointer leaves the image)
  rimToggled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["setMarking", "open", "hideRim"]);

const rootElement = ref(null);
const rimElement = ref(null);
const shiftDown = useShiftKey();
const ctrlDown = useCtrlKey();
const showAlt = computed(() => props.hovered && shiftDown.value);
const rimGroups = computed(() => rimActionGroups(props.image, props.ctx));
const rimExtras = computed(() => rimReuseExtras(props.image));
const rimSize = ref(0);
const rimOpen = computed(() => props.hovered && (ctrlDown.value || props.rimToggled));

watch(rimOpen, open => {
  const root = rootElement.value;

  if (open && root)
    rimSize.value = Math.min(root.clientWidth, root.clientHeight);
});

function onAction(action, alt) {
  runImageAction(action, props.image, props.ctx, alt);
}

// The press-and-release gesture of the view reads the rim (useRimPress.js)
defineExpose({rimElement});

function onMarkingAuxClick(e) {
  if (e.button === 1)
    emit("setMarking", null);
}
</script>

<template>
  <div ref="rootElement" class="compare-chrome" @click.stop @auxclick.stop>
    <div class="chrome-top">
      <span class="index-badge"><slot name="lead"/>{{ index + 1 }}</span>
    </div>

    <!-- Always shown; a click opens the image like in the trays -->
    <div v-if="image.comment" class="image-comment" :title="image.comment" @click="emit('open')">{{ image.comment }}</div>

    <div class="chrome-bottom">
      <span v-if="image.marking" class="image-marking" title="Middle: remove marking"
            @mousedown.middle.prevent @auxclick="onMarkingAuxClick">{{ image.marking }}</span>
    </div>

    <Transition name="rim">
      <ActionRim v-if="rimOpen" ref="rimElement" :groups="rimGroups" :size="rimSize" hub="hide" :marking="image.marking ?? null"
                 marking-arc :extras="rimExtras" :show-alt="showAlt" :deletable="!!ctx.handlers.removeImage"
                 :delete-label="ctx.removeLabel ?? 'Remove'"
                 @run="onAction" @delete="ctx.handlers.removeImage(image)"
                 @set-marking="marking => emit('setMarking', marking)"
                 @extra="id => runRimReuseExtra(image, id)" @close="emit('hideRim')"/>
    </Transition>
  </div>
</template>

<style scoped>
.compare-chrome {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
  line-height: normal;
  pointer-events: none;
}

.chrome-top,
.chrome-bottom {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}

.chrome-top {
  flex: none;
}

.chrome-bottom {
  align-items: flex-end;
  margin-top: auto;
}

.index-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 22px;
  height: 22px;
  box-sizing: border-box;
  justify-content: center;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  pointer-events: auto;
}

.image-comment {
  align-self: flex-start;
  max-width: 100%;
  box-sizing: border-box;
  margin-top: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.6);
  color: var(--ib-text);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  pointer-events: auto;
}

.image-marking {
  margin-left: auto;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.8);
  font-size: 14px;
  cursor: default;
  pointer-events: auto;
}

.rim-enter-from,
.rim-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
