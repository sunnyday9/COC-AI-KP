<script setup lang="ts">
import type { Message } from '../../types/game'

defineProps<{ msg: Message }>()
</script>

<template>
  <div
    v-if="msg.role === 'kp'"
    class="flex justify-start"
  >
    <div class="max-w-[85%] rounded-2xl rounded-tl-sm bg-amber-100 dark:bg-amber-900/40 px-4 py-2">
      <div class="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">KP</div>
      <div class="whitespace-pre-wrap text-gray-800 dark:text-gray-200">
        {{ msg.content }}
        <span v-if="msg.isStreaming" class="inline-block w-2 h-4 ml-0.5 bg-amber-500 animate-pulse" />
      </div>
    </div>
  </div>
  <div
    v-else-if="msg.role === 'player'"
    class="flex justify-end"
  >
    <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-100 dark:bg-blue-900/40 px-4 py-2">
      <div class="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">{{ msg.playerName }}</div>
      <div class="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{{ msg.content }}</div>
    </div>
  </div>
  <div
    v-else
    class="flex justify-center"
  >
    <div
      class="rounded-lg px-3 py-1.5 text-sm font-medium"
      :class="(msg as { type?: string }).type === 'dice'
        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
    >
      <span v-if="(msg as { type?: string }).type === 'dice'" class="mr-1.5 opacity-80">🎲</span>
      {{ msg.content }}
    </div>
  </div>
</template>
