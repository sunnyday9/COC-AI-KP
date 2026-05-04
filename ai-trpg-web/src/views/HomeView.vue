<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { listIndexedStories, type IndexedStory } from '../services/ragService'

const router = useRouter()
const gameStore = useGameStore()
const hasElectron = computed(() => !!window.electronAPI)

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
  <div class="min-h-screen flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_home.png');">
    <!-- Thematic dark overlay for contrast -->
    <div class="absolute inset-0 bg-black/70 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-col flex-1">
      <!-- Hero section with vignette -->
      <div class="relative px-6 pt-16 pb-10 text-center overflow-hidden">
        <!-- Radial vignette background -->
        <div class="absolute inset-0 pointer-events-none"
             style="background: radial-gradient(ellipse at center top, hsla(165, 40%, 15%, 0.12) 0%, transparent 60%);" />

        <!-- Decorative sigil behind title -->
        <svg class="absolute left-1/2 top-8 -translate-x-1/2 w-48 h-48 opacity-[0.03] animate-breathe"
             viewBox="0 0 200 200" fill="none" stroke="currentColor"
             style="color: hsl(165, 60%, 35%);">
          <circle cx="100" cy="100" r="90" stroke-width="0.5"/>
          <circle cx="100" cy="100" r="70" stroke-width="0.5"/>
          <circle cx="100" cy="100" r="50" stroke-width="0.3"/>
          <path d="M100 10 L100 190 M10 100 L190 100" stroke-width="0.3"/>
          <path d="M36 36 L164 164 M164 36 L36 164" stroke-width="0.3"/>
          <!-- Tentacle-like arcs -->
          <path d="M100 10 C140 40, 160 80, 190 100" stroke-width="0.5"/>
          <path d="M100 10 C60 40, 40 80, 10 100" stroke-width="0.5"/>
          <path d="M100 190 C140 160, 160 120, 190 100" stroke-width="0.5"/>
          <path d="M100 190 C60 160, 40 120, 10 100" stroke-width="0.5"/>
        </svg>

        <h1 class="gothic-heading text-3xl md:text-4xl font-bold relative z-10"
            style="text-shadow: 0 2px 10px hsla(220, 20%, 4%, 0.8);">
          AI COC Keeper
        </h1>
        <p class="mt-3 text-sm tracking-[0.2em] uppercase relative z-10"
           style="color: hsl(220, 10%, 30%); font-family: 'Fira Sans', sans-serif;">
          克苏鲁的呼唤 — 智能守密人
        </p>

        <!-- Ink-bleed horizontal rule -->
        <div class="mt-4 mx-auto max-w-[200px] ink-divider" />
      </div>

      <!-- Stories section -->
      <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full">
        <h2 class="gothic-heading text-lg font-bold mb-5 flex items-center gap-3">
          <span style="color: hsl(165, 60%, 35%);">☽</span>
          选择故事
        </h2>

        <!-- No Electron warning -->
        <div v-if="!hasElectron" class="gothic-card p-6 text-center">
          <p class="text-sm font-serif italic" style="color: hsl(38, 25%, 55%);">
            请在 Electron 桌面应用中运行以使用完整功能
          </p>
        </div>

        <!-- Loading -->
        <div v-else-if="isLoading && stories.length === 0" class="gothic-card p-8 text-center bg-black/40">
          <div class="sigil-spinner mx-auto" />
          <p class="mt-4 text-sm font-serif italic" style="color: hsl(220, 10%, 40%);">
            加载故事中...
          </p>
        </div>

        <!-- Story cards -->
        <div v-else-if="stories.length" class="space-y-3">
          <button
            v-for="story in stories"
            :key="story.storyId"
            type="button"
            @click="goToSetup(story)"
            class="w-full gothic-card bg-black/60 p-5 flex items-center justify-between group
                   transition-colors duration-200 text-left relative overflow-hidden
                   hover:bg-black/75"
            style="border-left: 3px solid hsla(165, 60%, 35%, 0.4); border-color: hsla(220, 15%, 15%, 0.8);"
          >
            <!-- Hover overlay effect -->
            <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                 style="background: linear-gradient(135deg, hsla(165, 60%, 35%, 0.05) 0%, transparent 50%);" />

            <div class="flex items-center gap-4 min-w-0 relative z-10">
              <div class="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center
                          font-display text-lg border"
                   style="background: hsla(165, 35%, 10%, 0.7);
                          border-color: hsla(165, 45%, 22%, 0.6);
                          color: hsl(165, 50%, 78%);">
                {{ story.name.charAt(0) }}
              </div>
              <div class="min-w-0">
                <h3 class="font-serif font-semibold text-base break-words transition-colors duration-300 text-white"
                    style="text-shadow: 0 1px 2px rgba(0,0,0,0.8);">
                  {{ story.name }}
                </h3>
                <p class="text-xs mt-0.5 font-mono" style="color: hsl(220, 10%, 45%);">
                  {{ story.chunkCount }} 个信息块
                </p>
              </div>
            </div>
            <span class="flex-shrink-0 text-xs font-medium px-4 py-2 rounded-lg
                         border transition-all duration-300 relative z-10
                         opacity-70 group-hover:opacity-100"
                  style="background: hsla(165, 35%, 10%, 0.6);
                         border-color: hsla(165, 45%, 22%, 0.5);
                         color: hsl(165, 50%, 78%);">
              开始游戏
            </span>
          </button>
        </div>

        <!-- Empty state -->
        <div v-else class="gothic-card p-12 text-center bg-black/45">
          <div class="mb-4 mx-auto w-16 ink-divider" />
          <p class="text-xl font-serif italic mb-3"
             style="color: hsl(220, 10%, 40%);">
            "书架上空无一物..."
          </p>
          <p class="text-sm mb-6" style="color: hsl(220, 10%, 45%);">
            调查员，请先到「故事管理」导入并索引故事文件
          </p>
          <div class="mx-auto w-16 ink-divider mb-6" />
          <router-link
            to="/scripts"
            class="gothic-btn inline-flex items-center gap-2 text-sm bg-black/60"
          >
            前往故事管理
            <span class="ml-1">&rarr;</span>
          </router-link>
        </div>
    </div>
  </div>
</div>
</template>
