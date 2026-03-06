<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import ChatMessage from '../components/game/ChatMessage.vue'
import PlayerStatsBar from '../components/game/PlayerStatsBar.vue'

const router = useRouter()
const gameStore = useGameStore()
const { messages, isSending, storyId, storyName, playerName, gamePhase, characterSheet, currentScene, cluesObtained } = storeToRefs(gameStore)
const inputText = ref('')
const messagesEnd = ref<HTMLElement | null>(null)
const cluesPanelOpen = ref(false)
const saveModalOpen = ref(false)
const loadModalOpen = ref(false)
const saveNameInput = ref('')
const saveError = ref('')
const loadError = ref('')
const saveList = ref<string[]>([])
const saveMetaCache = ref<Record<string, { name?: string; storyName?: string }>>({})
const loadLoading = ref(false)

function scrollToBottom() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(messages, () => scrollToBottom(), { deep: true })

onMounted(async () => {
  if (!storyId.value || gamePhase.value !== 'playing' || !characterSheet.value) {
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

function openSaveModal() {
  saveModalOpen.value = true
  saveNameInput.value = `${storyName.value || '存档'} ${new Date().toLocaleString('zh-CN')}`
  saveError.value = ''
}

async function confirmSave() {
  saveError.value = ''
  const name = saveNameInput.value.trim() || '未命名存档'
  try {
    const saveId = 'save_' + Date.now()
    await gameStore.saveGame(saveId, name)
    saveModalOpen.value = false
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  }
}

function openLoadModal() {
  loadModalOpen.value = true
  loadError.value = ''
  gameStore.listSaves().then((ids) => {
    saveList.value = ids
    saveMetaCache.value = {}
    ids.forEach((id) => {
      gameStore.getSaveMeta(id).then((meta) => {
        if (meta) saveMetaCache.value[id] = meta
      })
    })
  })
}

async function confirmLoad(saveId: string) {
  loadError.value = ''
  loadLoading.value = true
  try {
    await gameStore.loadGame(saveId)
    loadModalOpen.value = false
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 min-h-0 h-full">
    <!-- Main chat column -->
    <div class="flex flex-col flex-1 min-h-0 min-w-0">
      <!-- Header bar -->
      <div class="px-5 py-3 border-b border-gray-800 bg-gray-900/60 flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <h1 class="font-serif text-lg text-parchment-200 tracking-wide truncate">
            {{ storyName || storyId }}
          </h1>
          <div class="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            <span>{{ playerName }}</span>
            <span v-if="currentScene" class="flex items-center gap-1">
              <span class="text-cthulhu-300">&#x26E9;</span>
              {{ currentScene }}
            </span>
          </div>
        </div>

        <!-- Save / Load -->
        <button type="button"
                @click="openSaveModal"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-cthulhu-900/40 border border-cthulhu-600/30 text-cthulhu-200
                       hover:bg-cthulhu-800/50 transition-all duration-200">
          &#x1F4BE; 存档
        </button>
        <button type="button"
                @click="openLoadModal"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-cthulhu-900/40 border border-cthulhu-600/30 text-cthulhu-200
                       hover:bg-cthulhu-800/50 transition-all duration-200">
          &#x1F4C4; 读档
        </button>
        <!-- Clues toggle -->
        <button v-if="cluesObtained.length > 0"
                type="button"
                @click="cluesPanelOpen = !cluesPanelOpen"
                class="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-parchment-900/30 border border-parchment-700/30 text-parchment-300
                       hover:bg-parchment-900/50 transition-all duration-200">
          <span>&#x1F4DC;</span>
          线索
          <span class="ml-1 px-1.5 py-0.5 rounded-full bg-parchment-700/40 text-[10px]
                       text-parchment-200 font-mono">{{ cluesObtained.length }}</span>
        </button>
      </div>

      <!-- Chat area -->
      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4
                  bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900/50">
        <p v-if="messages.length === 0 && !isSending"
           class="text-center text-gray-600 py-12 font-serif text-sm italic">
          "黑暗中，一个故事正在苏醒..."
        </p>
        <ChatMessage v-for="msg in messages" :key="msg.id" :msg="msg" />
        <div ref="messagesEnd" />
      </div>

      <!-- Player stats -->
      <PlayerStatsBar />

      <!-- Input area -->
      <div class="px-4 py-3 border-t border-gray-800 bg-gray-900/80">
        <div class="flex gap-2 items-end">
          <textarea
            v-model="inputText"
            @keydown="handleKeydown"
            placeholder="描述你的行动..."
            rows="2"
            :disabled="isSending"
            class="gothic-input resize-none text-sm leading-relaxed min-h-[2.5rem]"
          />
          <button
            type="button"
            @click="handleSend"
            :disabled="!inputText.trim() || isSending"
            class="gothic-btn shrink-0 px-5 py-2 self-end"
          >
            <span v-if="isSending" class="inline-block w-4 h-4 border-2 border-parchment-400
                        border-t-transparent rounded-full animate-spin" />
            <span v-else>发送</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Clues side panel (slides in) -->
    <transition name="slide-panel">
      <aside v-if="cluesPanelOpen && cluesObtained.length > 0"
             class="w-64 border-l border-gray-800 bg-gray-900/90 flex flex-col shrink-0">
        <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 class="font-serif text-sm text-parchment-300 tracking-wide">已获得线索</h2>
          <button type="button"
                  @click="cluesPanelOpen = false"
                  class="text-gray-500 hover:text-gray-300 text-xs">&#x2715;</button>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-for="(clue, idx) in cluesObtained"
               :key="idx"
               class="p-3 rounded-lg bg-parchment-900/20 border border-parchment-800/30 text-xs text-parchment-300 leading-relaxed">
            {{ clue }}
          </div>
        </div>
      </aside>
    </transition>

    <!-- Save modal -->
    <div v-if="saveModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="saveModalOpen = false">
      <div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
        <h3 class="font-serif text-parchment-200 mb-3">存档</h3>
        <input v-model="saveNameInput" type="text" placeholder="存档名称"
               class="gothic-input w-full mb-2" @keydown.enter="confirmSave" />
        <p v-if="saveError" class="text-blood-300 text-xs mb-2">{{ saveError }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="gothic-btn-secondary text-sm" @click="saveModalOpen = false">取消</button>
          <button type="button" class="gothic-btn text-sm" @click="confirmSave">保存</button>
        </div>
      </div>
    </div>

    <!-- Load modal -->
    <div v-if="loadModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="loadModalOpen = false">
      <div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        <div class="p-4 border-b border-gray-700">
          <h3 class="font-serif text-parchment-200">读档</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <p v-if="saveList.length === 0" class="text-gray-500 text-sm">暂无存档</p>
          <button v-for="id in saveList" :key="id"
                  type="button"
                  :disabled="loadLoading"
                  @click="confirmLoad(id)"
                  class="w-full text-left px-3 py-2 rounded-lg border border-gray-700 bg-gray-800/50
                         hover:bg-gray-800 text-parchment-200 text-sm transition-colors">
            <span class="font-medium">{{ saveMetaCache[id]?.name ?? id }}</span>
            <span v-if="saveMetaCache[id]?.storyName" class="text-gray-500 text-xs ml-2">{{ saveMetaCache[id]?.storyName }}</span>
          </button>
        </div>
        <p v-if="loadError" class="px-4 py-2 text-blood-300 text-xs">{{ loadError }}</p>
        <div class="p-4 border-t border-gray-700 flex justify-end">
          <button type="button" class="gothic-btn-secondary text-sm" @click="loadModalOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  width: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
