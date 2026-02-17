<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import ChatMessage from '../components/game/ChatMessage.vue'
import PlayerStatsBar from '../components/game/PlayerStatsBar.vue'

const router = useRouter()
const gameStore = useGameStore()
const { messages, isSending, scriptId, script, playerName, gamePhase, characterSheet, currentSceneId, cluesObtained } = storeToRefs(gameStore)
const inputText = ref('')
const messagesEnd = ref<HTMLElement | null>(null)

const currentScene = computed(() => {
  if (!script.value || !currentSceneId.value) return null
  return script.value.scenes.find((s) => s.id === currentSceneId.value) ?? null
})

const obtainedClues = computed(() => {
  if (!script.value?.clues || cluesObtained.value.length === 0) return []
  return cluesObtained.value
    .map((cid) => script.value?.clues?.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
})

function scrollToBottom() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(messages, () => scrollToBottom(), { deep: true })

onMounted(async () => {
  if (!scriptId.value || gamePhase.value !== 'playing' || !characterSheet.value) {
    router.replace('/')
    return
  }
  if (messages.value.length === 0) {
    await gameStore.requestOpening()
  }
  scrollToBottom()
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isSending.value) return
  inputText.value = ''
  await gameStore.sendPlayerMessage(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <div class="flex flex-col flex-1 min-h-0 min-w-0">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">游戏房间</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {{ script?.meta?.title ?? scriptId }} · {{ playerName }}
            </p>
            <div v-if="currentScene" class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <span class="font-medium">当前场景：</span>{{ currentScene.name }}
            </div>
          </div>
          <div v-if="obtainedClues.length > 0" class="flex-shrink-0 min-w-[200px] max-w-[300px]">
            <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">已获得线索</div>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              <div
                v-for="clue in obtainedClues"
                :key="clue.id"
                class="text-xs px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
              >
                {{ clue.description || clue.id }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <p v-if="messages.length === 0 && !isSending" class="text-center text-gray-500 dark:text-gray-400 py-8">
        等待开场...
      </p>
      <ChatMessage v-for="msg in messages" :key="msg.id" :msg="msg" />
        <div ref="messagesEnd" />
      </div>

      <PlayerStatsBar />

      <div class="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div class="flex gap-2">
        <textarea
          v-model="inputText"
          @keydown="handleKeydown"
          placeholder="输入行动或对话..."
          rows="2"
          :disabled="isSending"
          class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="button"
          @click="handleSend"
          :disabled="!inputText.trim() || isSending"
          class="self-end rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ isSending ? '...' : '发送' }}
        </button>
      </div>
      </div>
    </div>
  </div>
</template>
