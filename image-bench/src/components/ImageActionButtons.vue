<script setup>
import AppIcon from "@/components/AppIcon.vue";
import {animateColors} from "@/utils_html.js";

/**
 * Buttons of the image actions (imageActions.js) of one side of an image card, groups separated by a line.
 * A middle click or Shift+click runs the alternative of an action; showAlt shows the alternative icons.
 */
const props = defineProps({
  // Non-empty groups of actions, as returned by visibleActionGroups()
  groups: {
    type: Array,
    required: true
  },
  showAlt: {
    type: Boolean,
    default: false
  },
  // Flash the button on a run (in overlays, which cover the tabs that would flash)
  flash: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["run", "hover"]);

function run(action, alt, e) {
  if (props.flash)
    animateColors(e.currentTarget, 0.7);

  emit("run", action, alt);
}

function onAuxClick(action, e) {
  if (e.button === 1 && action.alt)
    run(action, true, e);
}
</script>

<template>
  <div class="image-actions">
    <template v-for="(group, groupIndex) in groups" :key="groupIndex">
      <span v-if="groupIndex" class="action-sep"></span>
      <button v-for="action in group" :key="action.id" class="ib sm"
              :class="{on: showAlt && action.alt}"
              :aria-label="showAlt && action.alt ? action.alt.label : action.label"
              @click="run(action, $event.shiftKey, $event)"
              @mousedown.middle.prevent
              @auxclick="onAuxClick(action, $event)"
              @mouseenter="emit('hover', action)"
              @mouseleave="emit('hover', null)"
      ><AppIcon :name="showAlt && action.alt ? action.alt.icon : action.icon" :size="13"/></button>
    </template>
  </div>
</template>

<style scoped>
.image-actions {
  display: flex;
  gap: 3px;
}

.image-actions .ib {
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
}

.image-actions .ib:hover {
  background: var(--ib-elev-2);
  border-color: var(--ib-border-2);
  color: #fff;
}

/* Shift shows the alternative action */
.image-actions .ib.on {
  background: rgba(17, 19, 23, 0.85);
  border-color: var(--ib-accent-border);
  color: var(--ib-accent);
}

.action-sep {
  width: 1px;
  margin: 3px 1px;
  background: rgba(255, 255, 255, 0.25);
}
</style>
