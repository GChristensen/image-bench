<script setup>
import { onMounted, onUnmounted } from 'vue';
import { dialogStack, closeDialog } from '@/dialogs/useDialog.js';
import DialogWindow from '@/dialogs/DialogWindow.vue';

// Renders the dialogs opened through useDialog.js. Mounted once in App.vue.

const windows = new Map();

function setWindowRef(entry, component) {
  if (component)
    windows.set(entry.id, component);
  else
    windows.delete(entry.id);
}

// Captured on window before any document-level handler (modals, overlay, shortcuts),
// so Enter/Escape act on the topmost dialog only
function onKeydown(e) {
  const stack = dialogStack.value;

  if (!stack.length || e.isComposing || e.key !== 'Escape' && e.key !== 'Enter')
    return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const top = windows.get(stack[stack.length - 1].id);

  if (e.key === 'Escape')
    top?.cancel();
  else
    top?.confirm();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="dialog">
      <!-- Other keys typed into a dialog do not reach document-level shortcut handlers -->
      <div v-for="entry in dialogStack" :key="entry.id" class="dialog-layer" @keydown.stop>
        <DialogWindow :ref="c => setWindowRef(entry, c)" :entry="entry" @close="value => closeDialog(entry, value)"/>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
/* Above ActionsModal, ExploreParamsModal and ImageOverlay (z-index up to 1003) */
.dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 1100;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.15s;
}

.dialog-enter-active :deep(.dialog-window),
.dialog-leave-active :deep(.dialog-window) {
  transition: transform 0.15s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from :deep(.dialog-window),
.dialog-leave-to :deep(.dialog-window) {
  transform: scale(0.95);
}
</style>
