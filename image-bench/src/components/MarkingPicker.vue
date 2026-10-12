<script setup>
import {MARKINGS} from "@/consts.js";
import AppIcon from "@/components/AppIcon.vue";

/**
 * Tag badge of an unmarked image card, which opens the markings upwards on hover
 */
const emit = defineEmits(["set"]);
</script>

<template>
  <span class="marking-picker">
    <span class="marking-badge"><AppIcon name="tag" :size="13"/></span>
    <span class="marking-strip">
      <span v-for="marking in MARKINGS" :key="marking" class="marking-option"
            @click="emit('set', marking)">{{ marking }}</span>
    </span>
  </span>
</template>

<style scoped>
.marking-picker {
  position: relative;
  line-height: normal;
}

.marking-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  background: rgba(17, 19, 23, 0.85);
  color: var(--ib-text);
  cursor: pointer;
}

/* Opens upwards; it starts right at the badge, so the pointer can move onto it without leaving the picker */
.marking-strip {
  position: absolute;
  bottom: 100%;
  right: 0;
  display: none;
  flex-direction: column;
  padding-bottom: 3px;
}

.marking-picker:hover .marking-strip {
  display: flex;
}

.marking-option {
  padding: 1px 3px;
  background: rgba(17, 19, 23, 0.85);
  font-size: 14px;
  line-height: normal;
  cursor: pointer;
  transition: transform 0.15s;
}

.marking-option:first-child {
  border-radius: 4px 4px 0 0;
}

.marking-option:last-child {
  border-radius: 0 0 4px 4px;
}

.marking-option:hover {
  transform: scale(1.2);
}
</style>
