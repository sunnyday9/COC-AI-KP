<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import ChatMessage from '../components/game/ChatMessage.vue'
import PlayerStatsBar from '../components/game/PlayerStatsBar.vue'
import DebugPanel from '../components/game/DebugPanel.vue'

const isDev = import.meta.env.DEV
const router = useRouter()
const gameStore = useGameStore()
const { messages, isSending, storyId, storyName, playerName, gamePhase, characterSheet, currentScene, cluesObtained } = storeToRefs(gameStore)
const isEnded = computed(() => gamePhase.value === 'ended')
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const messagesEnd = ref<HTMLElement | null>(null)
const cluesPanelOpen = ref(false)
const debugPanelOpen = ref(isDev)
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
  if (!storyId.value || (gamePhase.value !== 'playing' && gamePhase.value !== 'ended') || !characterSheet.value) {
    router.replace('/')
    return
  }
  if (gamePhase.value === 'ended') {
    router.replace('/game-end')
    return
  }
  if (messages.value.length === 0) {
    await gameStore.requestOpening()
  }
  scrollToBottom()
})

watch(gamePhase, (p) => {
  if (p === 'ended') router.replace('/game-end')
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isSending.value || isEnded.value) return
  inputText.value = ''
  await gameStore.sendPlayerMessage(text)
}

function handleOptionSelected(opt: string) {
  if (isSending.value || isEnded.value) return
  inputText.value = opt
  nextTick(() => {
    inputRef.value?.focus()
  })
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

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault()
    debugPanelOpen.value = !debugPanelOpen.value
  }
}
onMounted(() => document.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown))
</script>

<template>
  <div class="flex flex-1 min-h-0 h-full relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_game.png');">
    <!-- Thematic dark overlay -->
    <div class="absolute inset-0 bg-black/80 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-1 min-h-0 h-full">
    <!-- Main chat column -->
    <div class="flex flex-col flex-1 min-h-0 min-w-0">
      <!-- Header bar -->
      <div class="game-header px-5 py-3 flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <h1 class="font-display text-lg tracking-wider break-words"
              style="color: hsl(38, 55%, 92%); text-shadow: 0 2px 10px rgba(0,0,0,0.9);">
            {{ storyName || storyId }}
          </h1>
          <div class="flex items-center gap-3 mt-0.5 text-xs" style="color: hsl(220, 10%, 65%);">
            <span class="font-serif">{{ playerName }}</span>
            <span v-if="currentScene" class="flex items-center gap-1">
              <span style="color: hsl(165, 50%, 60%);">⛩</span>
              {{ currentScene }}
            </span>
          </div>
        </div>

        <!-- Save / Load -->
        <button type="button" @click="openSaveModal" class="action-btn">
          💾 存档
        </button>
        <button type="button" @click="openLoadModal" class="action-btn">
          📄 读档
        </button>
        <!-- Debug toggle (dev only) -->
        <button v-if="isDev"
                type="button"
                @click="debugPanelOpen = !debugPanelOpen"
                class="action-btn"
                :class="debugPanelOpen ? 'action-btn-active' : ''"
                title="Toggle Debug Panel (Ctrl+Shift+D)">
          <span class="font-mono text-[10px]">DBG</span>
        </button>
        <!-- Clues toggle -->
        <button v-if="cluesObtained.length > 0"
                type="button"
                @click="cluesPanelOpen = !cluesPanelOpen"
                class="action-btn relative">
          <span>📜</span>
          线索
          <span class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono clue-badge">
            {{ cluesObtained.length }}
          </span>
        </button>
      </div>

      <!-- Chat area with vignette -->
      <div class="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4 chat-area vignette-overlay">
        <p v-if="messages.length === 0 && !isSending"
           class="text-center py-12 font-serif text-sm italic relative z-10"
           style="color: hsl(220, 10%, 55%); text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
          "黑暗中，一个故事正在苏醒..."
        </p>
        <ChatMessage v-for="msg in messages" :key="msg.id" :msg="msg" @select-option="handleOptionSelected" class="relative z-10" />
        <div ref="messagesEnd" />
      </div>

      <!-- Player stats -->
      <PlayerStatsBar />

      <!-- Input area -->
      <div class="input-area px-4 py-3">
        <div class="flex gap-2 items-end">
          <textarea
            ref="inputRef"
            v-model="inputText"
            @keydown="handleKeydown"
            :placeholder="isEnded ? '游戏已结束，请前往结局总结' : '描述你的行动...'"
            rows="2"
            :disabled="isSending || isEnded"
            class="gothic-input resize-none text-sm leading-relaxed min-h-[2.5rem] font-serif"
          />
          <button
            type="button"
            @click="handleSend"
            :disabled="!inputText.trim() || isSending || isEnded"
            class="gothic-btn shrink-0 px-5 py-2 self-end"
          >
            <span v-if="isSending" class="sigil-spinner !w-4 !h-4" />
            <span v-else>发送</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Clues side panel -->
    <transition name="slide-panel">
      <aside v-if="cluesPanelOpen && cluesObtained.length > 0" class="clues-panel w-64 shrink-0 flex flex-col">
        <div class="px-4 py-3 flex items-center justify-between clues-header">
          <h2 class="font-display text-sm tracking-wider" style="color: hsl(38, 35%, 68%);">已获得线索</h2>
          <button type="button" @click="cluesPanelOpen = false" class="text-xs close-btn">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <div v-for="(clue, idx) in cluesObtained"
               :key="idx"
               class="p-3 rounded-lg text-xs leading-relaxed font-serif clue-card">
            {{ clue }}
          </div>
        </div>
      </aside>
    </transition>

    <!-- Debug panel (right side, dev only) -->
    <transition name="slide-panel">
      <aside v-if="debugPanelOpen && isDev"
             class="w-[420px] shrink-0 flex flex-col min-h-0"
             style="border-left: 1px solid hsl(220, 14%, 16%);">
        <DebugPanel />
      </aside>
    </transition>

    <!-- Save modal -->
    <div v-if="saveModalOpen" class="modal-overlay" @click.self="saveModalOpen = false">
      <div class="modal-box w-full max-w-sm mx-4 p-5">
        <h3 class="font-display tracking-wider mb-3" style="color: hsl(38, 50%, 88%);">存档</h3>
        <input v-model="saveNameInput" type="text" placeholder="存档名称"
               class="gothic-input w-full mb-2 text-sm" @keydown.enter="confirmSave" />
        <p v-if="saveError" class="text-xs mb-2" style="color: hsl(0, 55%, 65%);">{{ saveError }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="gothic-btn-secondary text-sm" @click="saveModalOpen = false">取消</button>
          <button type="button" class="gothic-btn text-sm" @click="confirmSave">保存</button>
        </div>
      </div>
    </div>

    <!-- Load modal -->
    <div v-if="loadModalOpen" class="modal-overlay" @click.self="loadModalOpen = false">
      <div class="modal-box w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        <div class="p-5 modal-section-header">
          <h3 class="font-display tracking-wider" style="color: hsl(38, 50%, 88%);">读档</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <p v-if="saveList.length === 0" class="text-sm font-serif italic" style="color: hsl(220, 10%, 30%);">暂无存档</p>
          <button v-for="id in saveList" :key="id"
                  type="button"
                  :disabled="loadLoading"
                  @click="confirmLoad(id)"
                  class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 save-item">
            <span class="font-medium" style="color: hsl(38, 40%, 78%);">{{ saveMetaCache[id]?.name ?? id }}</span>
            <span v-if="saveMetaCache[id]?.storyName" class="text-xs ml-2" style="color: hsl(220, 10%, 30%);">{{ saveMetaCache[id]?.storyName }}</span>
          </button>
        </div>
        <p v-if="loadError" class="px-4 py-2 text-xs" style="color: hsl(0, 55%, 65%);">{{ loadError }}</p>
        <div class="p-4 flex justify-end modal-section-footer">
          <button type="button" class="gothic-btn-secondary text-sm" @click="loadModalOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<style scoped>
.game-header {
  border-bottom: 1px solid hsla(220, 14%, 16%, 0.5);
  background: hsla(220, 18%, 7%, 0.98);
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
  background: hsla(220, 16%, 11%, 0.7);
  border: 1px solid hsla(220, 14%, 16%, 0.5);
  color: hsl(220, 10%, 65%);
}
.action-btn:hover {
  background: hsla(220, 16%, 14%, 0.8);
  color: hsl(38, 25%, 55%);
  border-color: hsla(220, 12%, 22%, 0.8);
}
.action-btn-active {
  background: hsla(42, 40%, 14%, 0.4);
  border-color: hsla(42, 70%, 50%, 0.3);
  color: hsl(42, 65%, 70%);
}
.clue-badge {
  background: hsla(38, 18%, 18%, 0.5);
  color: hsl(38, 40%, 78%);
}
.chat-area {
  background: transparent;
}
.input-area {
  border-top: 1px solid hsla(220, 14%, 16%, 0.5);
  background: hsla(220, 18%, 7%, 1);
}

/* Clues panel */
.clues-panel {
  border-left: 1px solid hsl(220, 14%, 16%);
  background: hsla(220, 18%, 7%, 0.98);
}
.clues-header {
  border-bottom: 1px solid hsl(220, 14%, 16%);
}
.close-btn { color: hsl(220, 10%, 30%); }
.close-btn:hover { color: hsl(38, 25%, 55%); }
.clue-card {
  background: hsla(38, 18%, 18%, 0.25);
  border: 1px solid hsla(38, 20%, 30%, 0.2);
  color: hsl(38, 35%, 68%);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsla(220, 20%, 4%, 0.85);
}
.modal-box {
  background: hsl(220, 18%, 7%);
  border: 1px solid hsl(220, 14%, 16%);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px hsla(220, 20%, 4%, 0.8), 0 0 0 1px hsla(220, 14%, 16%, 0.3);
}
.modal-section-header { border-bottom: 1px solid hsl(220, 14%, 16%); }
.modal-section-footer { border-top: 1px solid hsl(220, 14%, 16%); }
.save-item {
  background: hsla(220, 16%, 11%, 0.5);
  border: 1px solid hsla(220, 14%, 16%, 0.5);
}
.save-item:hover {
  background: hsla(220, 16%, 14%, 0.7);
  border-color: hsla(220, 12%, 22%, 0.6);
}

/* Panel transitions */
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
