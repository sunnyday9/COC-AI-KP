<script setup lang="ts">
import type { Message } from '../../types/game'

defineProps<{ msg: Message }>()

function systemMsgType(msg: Message): 'dice' | 'hp' | 'san' | 'mp' | 'scene' | 'clue' | 'generic' {
  if ((msg as { type?: string }).type === 'dice') return 'dice'
  const c = msg.content ?? ''
  if (/^HP\s[+-]/.test(c)) return 'hp'
  if (/^SAN\s[+-]/.test(c)) return 'san'
  if (/^MP\s[+-]/.test(c)) return 'mp'
  if (c.startsWith('场景切换')) return 'scene'
  if (c.startsWith('获得线索')) return 'clue'
  return 'generic'
}
</script>

<template>
  <!-- KP message -->
  <div v-if="msg.role === 'kp'" class="flex justify-start animate-fade-in">
    <div class="max-w-[85%] rounded-xl rounded-tl-sm px-4 py-3
                bg-parchment-900/30 border border-parchment-800/30
                shadow-sm">
      <div class="flex items-center gap-2 mb-1">
        <span class="w-5 h-5 rounded-full bg-eldritch-700/60 border border-eldritch-600/40
                     flex items-center justify-center text-[10px] text-parchment-300 font-serif">K</span>
        <span class="text-xs font-serif font-medium text-parchment-400 tracking-wide">守密人</span>
      </div>
      <div class="whitespace-pre-wrap text-parchment-200 text-sm leading-relaxed font-serif">
        {{ msg.content }}
        <span v-if="msg.isStreaming"
              class="inline-block w-1.5 h-4 ml-1 bg-eldritch-400 rounded-sm animate-pulse" />
      </div>
    </div>
  </div>

  <!-- Player message -->
  <div v-else-if="msg.role === 'player'" class="flex justify-end animate-fade-in">
    <div class="max-w-[85%] rounded-xl rounded-tr-sm px-4 py-3
                bg-eldritch-800/60 border border-eldritch-700/40">
      <div class="text-xs font-medium text-eldritch-300 mb-1">{{ msg.playerName }}</div>
      <div class="whitespace-pre-wrap text-gray-200 text-sm leading-relaxed">{{ msg.content }}</div>
    </div>
  </div>

  <!-- System messages -->
  <div v-else class="flex justify-center animate-slide-up">
    <!-- Dice roll -->
    <div v-if="systemMsgType(msg) === 'dice'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-amber-900/30 border border-amber-700/40 text-amber-300">
      <span class="text-base">🎲</span>
      {{ msg.content }}
    </div>

    <!-- HP change -->
    <div v-else-if="systemMsgType(msg) === 'hp'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-blood-900/40 border border-blood-700/40 text-blood-200">
      <span class="text-base">♥</span>
      {{ msg.content }}
    </div>

    <!-- SAN change -->
    <div v-else-if="systemMsgType(msg) === 'san'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-sanity-900/40 border border-sanity-600/40 text-sanity-200">
      <span class="text-base">◉</span>
      {{ msg.content }}
    </div>

    <!-- MP change -->
    <div v-else-if="systemMsgType(msg) === 'mp'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-blue-900/30 border border-blue-700/40 text-blue-300">
      <span class="text-base">✦</span>
      {{ msg.content }}
    </div>

    <!-- Scene transition -->
    <div v-else-if="systemMsgType(msg) === 'scene'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-cthulhu-800/50 border border-cthulhu-400/40 text-cthulhu-200">
      <span class="text-base">⛩</span>
      {{ msg.content }}
    </div>

    <!-- Clue obtained -->
    <div v-else-if="systemMsgType(msg) === 'clue'"
         class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium
                bg-parchment-900/40 border border-parchment-600/40 text-parchment-200">
      <span class="text-base">📜</span>
      {{ msg.content }}
    </div>

    <!-- Generic system -->
    <div v-else
         class="px-4 py-1.5 rounded-full text-sm
                bg-gray-800/60 border border-gray-700/40 text-gray-400">
      {{ msg.content }}
    </div>
  </div>
</template>
