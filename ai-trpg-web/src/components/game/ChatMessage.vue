<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '../../types/game'

const props = defineProps<{ msg: Message }>()
const emit = defineEmits<{ (e: 'select-option', text: string): void }>()

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

const parsedMessage = computed(() => {
  const content = props.msg.content ?? ''
  if (props.msg.role !== 'kp') return { text: content, options: [] }

  // During streaming, show raw text to prevent jitter
  if (props.msg.isStreaming) return { text: content, options: [] }

  // Try to find the options header
  const headerRegex = /(?:【?可选行动】?|你可以选择[：:]|接下来[你]?打算怎么做[？?]|选项[：:]|你[可以]?的选择[：:])\s*\n+/
  const match = content.match(headerRegex)
  
  if (match) {
    const mainText = content.substring(0, match.index).trim()
    const afterHeader = content.substring(match.index + match[0].length)
    
    const lines = afterHeader.split('\n')
    const options: string[] = []
    const trailingText: string[] = []
    let stillInList = true
    
    for (const line of lines) {
      if (line.trim() === '') continue
      
      const isListItem = /^(?:[-*+]|\d+\.)\s+/.test(line)
      if (stillInList && isListItem) {
        // Strip out the bullet/number and markdown bolding for cleaner buttons
        options.push(line.replace(/^(?:[-*+]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim())
      } else {
        stillInList = false
        trailingText.push(line)
      }
    }
    
    if (options.length > 0 && options.length <= 6) {
      const finalMainText = mainText + (trailingText.length > 0 ? '\n\n' + trailingText.join('\n') : '')
      return { text: finalMainText || content, options }
    }
  } else {
    // Fallback: Check if there's just a raw list at the very end
    const fallbackRegex = /\n+((?:(?:[-*+]|\d+\.)\s+[^\n]+(?:\n|$))+)$/
    const fbMatch = content.match(fallbackRegex)
    if (fbMatch) {
      const mainText = content.substring(0, fbMatch.index).trim()
      const options = fbMatch[1]
        .split('\n')
        .map(line => line.replace(/^(?:[-*+]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim())
        .filter(line => line.length > 0)
      
      if (options.length > 0 && options.length <= 6) {
        return { text: mainText || content, options }
      }
    }
  }

  return { text: content, options: [] }
})
</script>

<template>
  <!-- KP message — aged parchment fragment -->
  <div v-if="msg.role === 'kp'" class="flex justify-start animate-ink-spread">
    <div class="max-w-[85%] rounded-xl rounded-tl-sm px-5 py-4 kp-msg">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display kp-avatar">K</span>
        <span class="text-xs font-display tracking-wider kp-label">守密人</span>
      </div>
      <div class="whitespace-pre-wrap break-words text-sm leading-relaxed font-serif kp-text">
        {{ parsedMessage.text }}
        <span v-if="msg.isStreaming" class="inline-block w-1.5 h-4 ml-1 rounded-sm animate-pulse cursor-bar" />
      </div>
      
      <!-- Render parsed choices -->
      <div v-if="!msg.isStreaming && parsedMessage.options.length > 0" class="mt-4 flex flex-col gap-2 border-t border-dashed border-white/10 pt-3">
        <span class="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-1">Possible Actions</span>
        <button v-for="(opt, idx) in parsedMessage.options" :key="idx" 
                @click="emit('select-option', opt)"
                class="text-left px-3 py-2 text-sm font-serif rounded bg-black/20 border border-white/5 hover:bg-black/40 hover:border-white/10 transition-all text-slate-300 hover:text-parchment-300">
          {{ opt }}
        </button>
      </div>
    </div>
  </div>

  <!-- Player message -->
  <div v-else-if="msg.role === 'player'" class="flex justify-end animate-fade-in">
    <div class="max-w-[85%] rounded-xl rounded-tr-sm px-5 py-4 player-msg">
      <div class="text-xs font-medium mb-1.5 player-name">{{ msg.playerName }}</div>
      <div class="whitespace-pre-wrap break-words text-sm leading-relaxed player-text">{{ msg.content }}</div>
    </div>
  </div>

  <!-- System messages -->
  <div v-else class="flex justify-center animate-slide-up break-words text-center">
    <div v-if="systemMsgType(msg) === 'dice'" class="sys-pill sys-dice">
      <span class="text-base">🎲</span>{{ msg.content }}
    </div>
    <div v-else-if="systemMsgType(msg) === 'hp'" class="sys-pill sys-hp">
      <span class="text-base">♥</span>{{ msg.content }}
    </div>
    <div v-else-if="systemMsgType(msg) === 'san'" class="sys-pill sys-san">
      <span class="text-base">◉</span>{{ msg.content }}
    </div>
    <div v-else-if="systemMsgType(msg) === 'mp'" class="sys-pill sys-mp">
      <span class="text-base">✦</span>{{ msg.content }}
    </div>
    <div v-else-if="systemMsgType(msg) === 'scene'" class="w-full flex flex-col items-center py-3 gap-2">
      <div class="w-full ink-divider" />
      <div class="sys-scene"><span class="text-base">⛩</span>{{ msg.content }}</div>
      <div class="w-full ink-divider" />
    </div>
    <div v-else-if="systemMsgType(msg) === 'clue'" class="sys-pill sys-clue">
      <span class="text-base">📜</span>{{ msg.content }}
    </div>
    <div v-else class="sys-pill sys-generic">{{ msg.content }}</div>
  </div>
</template>

<style scoped>
.kp-msg {
  background: hsla(38, 18%, 18%, 0.35);
  border: 1px solid hsla(38, 20%, 30%, 0.25);
  border-left: 3px solid hsla(165, 60%, 35%, 0.35);
  box-shadow: 0 2px 8px hsla(220, 20%, 4%, 0.4), inset 0 0 30px hsla(38, 18%, 18%, 0.1);
}
.kp-avatar {
  background: hsla(165, 45%, 22%, 0.5);
  border: 1px solid hsla(165, 55%, 28%, 0.4);
  color: hsl(165, 50%, 78%);
}
.kp-label { color: hsl(38, 25%, 55%); }
.kp-text { color: hsl(38, 40%, 78%); }
.cursor-bar { background: hsl(165, 60%, 35%); }

.player-msg {
  background: hsla(220, 16%, 14%, 0.7);
  border: 1px solid hsla(220, 14%, 22%, 0.5);
  box-shadow: 0 2px 8px hsla(220, 20%, 4%, 0.3);
}
.player-name { color: hsl(165, 50%, 65%); }
.player-text { color: hsl(38, 35%, 75%); }

.sys-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
}
.sys-dice {
  background: hsla(42, 50%, 30%, 0.3);
  border: 1px solid hsla(42, 70%, 50%, 0.35);
  color: hsl(42, 65%, 80%);
  box-shadow: 0 0 12px hsla(42, 70%, 50%, 0.15);
}
.sys-hp {
  background: hsla(0, 50%, 15%, 0.4);
  border: 1px solid hsla(0, 65%, 35%, 0.35);
  color: hsl(0, 55%, 82%);
  box-shadow: 0 0 12px hsla(0, 65%, 35%, 0.2);
}
.sys-san {
  background: hsla(260, 35%, 18%, 0.4);
  border: 1px solid hsla(260, 50%, 45%, 0.35);
  color: hsl(260, 45%, 80%);
  box-shadow: 0 0 12px hsla(260, 50%, 45%, 0.2);
}
.sys-mp {
  background: hsla(210, 40%, 15%, 0.4);
  border: 1px solid hsla(210, 60%, 45%, 0.35);
  color: hsl(210, 50%, 78%);
  box-shadow: 0 0 12px hsla(210, 60%, 45%, 0.15);
}
.sys-scene {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  font-family: 'Cinzel Decorative', serif;
  font-size: 0.875rem;
  letter-spacing: 0.1em;
  color: hsl(165, 50%, 65%);
}
.sys-clue {
  background: hsla(38, 18%, 18%, 0.4);
  border: 1px solid hsla(38, 20%, 30%, 0.35);
  color: hsl(38, 40%, 78%);
  box-shadow: 0 0 12px hsla(38, 40%, 50%, 0.1);
}
.sys-generic {
  background: hsla(220, 16%, 11%, 0.6);
  border: 1px solid hsla(220, 14%, 16%, 0.5);
  color: hsl(220, 10%, 30%);
}
</style>
