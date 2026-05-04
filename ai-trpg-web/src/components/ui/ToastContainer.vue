<script setup lang="ts">
import { useToast } from '../../composables/useToast'

const { toasts, dismiss } = useToast()

const typeStyles: Record<string, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
  warning: 'toast-warning',
}

const typeIcons: Record<string, string> = {
  success: '\u2713',
  error: '\u2717',
  info: '\u2139',
  warning: '\u26A0',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 translate-x-8"
        leave-to-class="opacity-0 translate-x-8"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg
                 shadow-lg max-w-sm cursor-pointer toast-base"
          :class="typeStyles[toast.type] || typeStyles.info"
          @click="dismiss(toast.id)"
        >
          <span class="text-lg font-bold flex-shrink-0">{{ typeIcons[toast.type] || typeIcons.info }}</span>
          <span class="text-sm leading-snug">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-base {
  backdrop-filter: blur(12px);
}
.toast-success {
  background: hsla(165, 45%, 15%, 0.9);
  border: 1px solid hsla(165, 60%, 35%, 0.5);
  color: hsl(165, 50%, 85%);
  box-shadow: 0 4px 16px hsla(220, 20%, 4%, 0.5), 0 0 12px hsla(165, 60%, 35%, 0.15);
}
.toast-error {
  background: hsla(0, 50%, 15%, 0.9);
  border: 1px solid hsla(0, 65%, 35%, 0.5);
  color: hsl(0, 55%, 88%);
  box-shadow: 0 4px 16px hsla(220, 20%, 4%, 0.5), 0 0 12px hsla(0, 65%, 35%, 0.2);
}
.toast-info {
  background: hsla(220, 18%, 12%, 0.9);
  border: 1px solid hsla(165, 55%, 28%, 0.4);
  color: hsl(165, 50%, 85%);
  box-shadow: 0 4px 16px hsla(220, 20%, 4%, 0.5);
}
.toast-warning {
  background: hsla(42, 40%, 14%, 0.9);
  border: 1px solid hsla(42, 70%, 50%, 0.4);
  color: hsl(42, 65%, 88%);
  box-shadow: 0 4px 16px hsla(220, 20%, 4%, 0.5), 0 0 12px hsla(42, 70%, 50%, 0.15);
}
</style>
