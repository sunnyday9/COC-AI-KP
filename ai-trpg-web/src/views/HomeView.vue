<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { listIndexedStories, type IndexedStory } from '../services/ragService'

const router = useRouter()
const gameStore = useGameStore()
const hasElectron = computed(() => !!(window as { electronAPI?: unknown }).electronAPI)

const stories = ref<IndexedStory[]>([])
const isLoading = ref(false)

async function loadStories() {
  isLoading.value = true
  try {
    stories.value = await listIndexedStories()
  } catch { stories.value = [] }
  finally { isLoading.value = false }
}

onMounted(() => { loadStories() })

async function goToSetup(story: IndexedStory) {
  await gameStore.startGame({ storyId: story.storyId, storyName: story.name })
  router.push('/occupation')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Hero section -->
    <div class="relative px-6 pt-12 pb-8 text-center">
      <div class="absolute inset-0 bg-gradient-to-b from-eldritch-900/20 via-transparent to-transparent pointer-events-none" />
      <h1 class="gothic-heading text-3xl md:text-4xl font-bold relative">
        AI COC Keeper
      </h1>
      <p class="mt-3 text-gray-400 text-sm tracking-wide relative">
        克苏鲁的呼唤 — 智能守密人
      </p>
      <div class="mt-2 mx-auto w-24 h-px bg-gradient-to-r from-transparent via-eldritch-500 to-transparent" />
    </div>

    <!-- Stories section -->
    <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
      <h2 class="gothic-heading text-lg font-semibold mb-4 flex items-center gap-2">
        <span class="text-eldritch-400">&#x270D;</span>
        选择故事
      </h2>

      <!-- No Electron warning -->
      <div v-if="!hasElectron" class="gothic-card p-6 text-center">
        <p class="text-parchment-400 text-sm">请在 Electron 桌面应用中运行以使用完整功能</p>
      </div>

      <!-- Loading -->
      <div v-else-if="isLoading && stories.length === 0" class="gothic-card p-8 text-center">
        <div class="inline-block w-6 h-6 border-2 border-eldritch-500 border-t-transparent rounded-full animate-spin" />
        <p class="mt-3 text-gray-500 text-sm">加载故事中...</p>
      </div>

      <!-- Story cards -->
      <div v-else-if="stories.length" class="space-y-3">
        <button
          v-for="story in stories"
          :key="story.storyId"
          type="button"
          @click="goToSetup(story)"
          class="w-full gothic-card p-4 flex items-center justify-between group
                 hover:border-eldritch-600/60 hover:shadow-eldritch transition-all duration-300 text-left"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-eldritch-800/50 border border-eldritch-700/40
                        flex items-center justify-center text-eldritch-300 font-serif text-lg">
              {{ story.name.charAt(0) }}
            </div>
            <div class="min-w-0">
              <h3 class="font-medium text-parchment-200 truncate group-hover:text-parchment-100 transition-colors">
                {{ story.name }}
              </h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ story.chunkCount }} 个信息块</p>
            </div>
          </div>
          <span class="flex-shrink-0 text-xs text-eldritch-400 group-hover:text-eldritch-300
                       bg-eldritch-800/40 px-3 py-1.5 rounded-md border border-eldritch-700/30
                       transition-all duration-200 group-hover:border-eldritch-600/40">
            开始游戏
          </span>
        </button>
      </div>

      <!-- Empty state -->
      <div v-else class="gothic-card p-10 text-center">
        <p class="text-xl text-gray-600 mb-2 font-serif">
          "书架上空无一物..."
        </p>
        <p class="text-sm text-gray-500 mb-5">
          调查员，请先到「故事管理」导入并索引故事文件
        </p>
        <router-link
          to="/scripts"
          class="gothic-btn inline-flex items-center gap-1"
        >
          前往故事管理
          <span class="ml-1">&rarr;</span>
        </router-link>
      </div>
    </div>
  </div>
</template>
