<script setup>
/**
 * Notices of toast.js at the bottom of the popup; a click dismisses one, or opens its details
 */
import AppIcon from "@/components/AppIcon.vue";
import {dismissToast, toasts} from "@/toast.js";

function onClick(item) {
  if (item.kind === "pending")
    return;

  dismissToast(item.id);
  item.open?.();
}

function onAction(item) {
  dismissToast(item.id);
  item.action.run();
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-host" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind" role="status"
           :title="item.open ? 'Click for details' : null" @click="onClick(item)">
        <span v-if="item.kind === 'pending'" class="spinner" aria-hidden="true"></span>
        <AppIcon v-else :name="item.kind === 'error' ? 'alert' : 'check'" :size="14"/>
        <span>{{ item.message }}</span>
        <button v-if="item.action" type="button" class="toast-action" @click.stop="onAction(item)">{{ item.action.label }}</button>
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

.toast-action {
  margin-left: 4px;
  padding: 2px 4px;
  border: 0;
  background: none;
  color: var(--ib-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.toast-action:hover {
  text-decoration: underline;
}

.toast.pending {
  cursor: default;
}

.spinner {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border: 2px solid var(--ib-border-2);
  border-top-color: var(--ib-accent);
  border-radius: 50%;
  animation: toast-spin 0.8s linear infinite;
}

@keyframes toast-spin {
  to {
    transform: rotate(360deg);
  }
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
