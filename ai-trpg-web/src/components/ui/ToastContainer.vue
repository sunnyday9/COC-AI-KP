<script setup lang="ts">
import { useToast } from '../../composables/useToast'

const { toasts, dismiss } = useToast()

const typeStyles: Record<string, string> = {
  success: 'border-cthulhu-400 bg-cthulhu-500/90 text-cthulhu-50',
  error: 'border-blood-500 bg-blood-700/90 text-blood-50',
  info: 'border-eldritch-400 bg-eldritch-700/90 text-eldritch-50',
  warning: 'border-parchment-500 bg-parchment-800/90 text-parchment-100',
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
          class="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg max-w-sm cursor-pointer"
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
