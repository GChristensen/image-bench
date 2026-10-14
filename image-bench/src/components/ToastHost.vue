<script setup>
/**
 * Notices of toast.js at the bottom of the popup; a click dismisses one
 */
import AppIcon from "@/components/AppIcon.vue";
import {dismissToast, toasts} from "@/toast.js";
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-host" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind" role="status"
           @click="dismissToast(item.id)">
        <AppIcon :name="item.kind === 'error' ? 'alert' : 'check'" :size="14"/>
        <span>{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
/* Above the overlays and dialogs */
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 18px;
  z-index: 3000;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 7px 14px;
  border: 1px solid var(--ib-border-2);
  border-radius: 16px;
  background: var(--ib-elev);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  color: var(--ib-text);
  font-size: 12.5px;
  pointer-events: auto;
  cursor: pointer;
}

.toast.success :deep(.app-icon) {
  color: var(--ib-accent);
}

.toast.error {
  border-color: rgba(255, 122, 125, 0.4);
}

.toast.error :deep(.app-icon) {
  color: var(--ib-danger-text);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
