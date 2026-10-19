<script setup>
/**
 * Floats at the top right of the positioned parent of a scrolled list while the list is scrolled to the bottom,
 * and scrolls it back to the top
 */
import {nextTick, onBeforeUnmount, ref, watch} from "vue";
import AppIcon from "@/components/AppIcon.vue";

const props = defineProps({
  // The scrolled element
  target: {
    type: Object,
    default: null
  },
  // Changes when the content does (e.g. the image count): the height changes without a scroll event
  content: {
    default: null
  }
});

const BOTTOM_SLACK = 4;
const atBottom = ref(false);

function update() {
  const element = props.target;

  atBottom.value = !!element && element.scrollHeight > element.clientHeight
    && element.scrollTop + element.clientHeight >= element.scrollHeight - BOTTOM_SLACK;
}

function scrollToTop() {
  props.target?.scrollTo({top: 0, behavior: "smooth"});
}

// Loaded images change the height too
watch(() => props.target, (element, previous) => {
  previous?.removeEventListener("scroll", update);
  previous?.removeEventListener("load", update, true);
  element?.addEventListener("scroll", update, {passive: true});
  element?.addEventListener("load", update, true);
  update();
}, {immediate: true});

watch(() => props.content, () => nextTick(update));

onBeforeUnmount(() => {
  props.target?.removeEventListener("scroll", update);
  props.target?.removeEventListener("load", update, true);
});
</script>

<template>
  <button v-if="atBottom" class="ib scroll-top" title="Scroll to the top" aria-label="Scroll to the top"
          @click="scrollToTop"><AppIcon name="toTop"/></button>
</template>

<style scoped>
/* Floats below the toolbar, next to the scrollbar */
.scroll-top {
  position: absolute;
  top: 8px;
  right: 14px;
  z-index: 5;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(17, 19, 23, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--ib-text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
</style>
