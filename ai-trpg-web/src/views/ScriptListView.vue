<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStoryStore } from '../stores/storyStore'
import { listIndexedStories, deleteStoryIndex, type IndexedStory } from '../services/ragService'
import { useToast } from '../composables/useToast'

const toast = useToast()
const storyStore = useStoryStore()
const { storyFiles, isLoading: storiesLoading } = storeToRefs(storyStore)
const hasElectron = computed(() => !!(window as { electronAPI?: unknown }).electronAPI)

const indexedStories = ref<IndexedStory[]>([])
const indexStatus = ref<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})

async function refreshIndexed() {
  try { indexedStories.value = await listIndexedStories() } catch { indexedStories.value = [] }
}

onMounted(() => {
  storyStore.loadStories()
  refreshIndexed()
})

async function handleImport() {
  const result = await storyStore.importStory()
  if (result?.ok) toast.success('故事文件导入成功')
  else if (result?.error && result.error !== 'cancelled') toast.error('导入失败: ' + result.error)
}

async function handleIndexStory(path: string) {
  indexStatus.value[path] = 'loading'
  try {
    const result = await storyStore.indexStoryForRag(path)
    if (result.ok) {
      indexStatus.value[path] = 'ok'
      toast.success(`索引成功！共 ${result.indexed || 0} 个信息块`)
      await refreshIndexed()
    } else {
      indexStatus.value[path] = 'error'
      toast.error(`索引失败：${result.error || '未知错误'}`)
    }
  } catch (e) {
    indexStatus.value[path] = 'error'
    toast.error(`索引失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

async function handleIndexAll() {
  const result = await storyStore.indexAllStories()
  if (result.ok) toast.success(`索引完成！共 ${result.total} 个信息块`)
  else toast.warning(`索引完成（${result.errors.length} 个错误），共 ${result.total} 个信息块`)
  await refreshIndexed()
}

async function handleDeleteStory(path: string, name: string) {
  await storyStore.deleteStory(path)
  toast.info(`已删除文件「${name}」`)
}

async function handleDeleteIndex(storyId: string, name: string) {
  try {
    await deleteStoryIndex(storyId)
    toast.info(`已删除索引「${name}」`)
    await refreshIndexed()
  } catch (e) {
    toast.error(`删除索引失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

function isIndexed(path: string): boolean {
  const id = storyStore.storyFiles.find((f) => f.path === path)
  if (!id) return false
  const storyId = path.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
  return indexedStories.value.some((s) => s.storyId === storyId)
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <div class="px-6 pt-8 pb-4 max-w-4xl mx-auto w-full">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="gothic-heading text-2xl font-bold">故事管理</h1>
          <p class="mt-1 text-sm text-gray-500">导入故事文件并索引到向量数据库，供 AI KP 参考</p>
        </div>
        <div v-if="hasElectron" class="flex gap-2">
          <button type="button" @click="handleImport"
                  class="gothic-btn text-sm">
            导入故事
          </button>
        </div>
      </div>
      <div class="mt-3 w-16 h-px bg-gradient-to-r from-eldritch-500 to-transparent" />
    </div>

    <div class="flex-1 px-6 pb-12 max-w-4xl mx-auto w-full space-y-6">

      <!-- No Electron -->
      <p v-if="!hasElectron" class="gothic-card p-5 text-center text-sm text-parchment-400">
        请在 Electron 桌面应用中运行以使用完整功能
      </p>

      <template v-else>
        <!-- Story files section -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="gothic-heading text-sm font-semibold flex items-center gap-2">
              <span class="text-parchment-400">&#x1F4C4;</span> 故事文件
            </h2>
            <div class="flex gap-2">
              <button type="button" @click="storyStore.loadStories()" :disabled="storiesLoading"
                      class="text-[11px] text-eldritch-400 hover:text-eldritch-300 disabled:opacity-50">
                刷新
              </button>
              <button v-if="storyFiles.length" type="button" @click="handleIndexAll"
                      class="text-[11px] text-cthulhu-300 hover:text-cthulhu-200">
                索引全部
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="storiesLoading && storyFiles.length === 0" class="gothic-card p-8 text-center">
            <div class="inline-block w-6 h-6 border-2 border-eldritch-500 border-t-transparent rounded-full animate-spin" />
            <p class="mt-3 text-gray-500 text-sm">加载中...</p>
          </div>

          <!-- File list -->
          <div v-else-if="storyFiles.length" class="space-y-2">
            <div v-for="story in storyFiles" :key="story.path"
                 class="gothic-card p-3.5 flex items-center justify-between group">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex-shrink-0 w-9 h-9 rounded-lg bg-parchment-900/30 border border-parchment-800/40
                            flex items-center justify-center text-parchment-400 font-serif text-sm">
                  {{ story.name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <h3 class="font-medium text-parchment-200 truncate text-sm">{{ story.name }}</h3>
                  <p class="text-[10px] mt-0.5" :class="isIndexed(story.path) ? 'text-cthulhu-400' : 'text-gray-600'">
                    {{ isIndexed(story.path) ? '已索引' : '未索引' }}
                  </p>
                </div>
              </div>
              <div class="flex gap-1.5 shrink-0">
                <button type="button" @click="handleIndexStory(story.path)"
                        :disabled="indexStatus[story.path] === 'loading'"
                        class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200
                               bg-cthulhu-800/50 border border-cthulhu-600/30 text-cthulhu-200
                               hover:bg-cthulhu-700/50 disabled:opacity-50">
                  {{ indexStatus[story.path] === 'loading' ? '索引中...'
                   : indexStatus[story.path] === 'ok' ? '✓ 完成' : '索引' }}
                </button>
                <button type="button" @click="handleDeleteStory(story.path, story.name)"
                        class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200
                               bg-blood-900/30 border border-blood-700/30 text-blood-300
                               hover:bg-blood-800/40 opacity-0 group-hover:opacity-100">
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div v-else class="gothic-card p-8 text-center">
            <p class="text-lg text-gray-600 font-serif mb-2">"书架上空无一物..."</p>
            <p class="text-sm text-gray-500">点击「导入故事」添加 PDF、TXT 或 MD 文件</p>
          </div>
        </section>

        <!-- Indexed stories section -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="gothic-heading text-sm font-semibold flex items-center gap-2">
              <span class="text-cthulhu-400">&#x1F5C3;</span> 已索引故事
            </h2>
            <button type="button" @click="refreshIndexed"
                    class="text-[11px] text-eldritch-400 hover:text-eldritch-300">
              刷新
            </button>
          </div>

          <div v-if="indexedStories.length" class="space-y-2">
            <div v-for="idx in indexedStories" :key="idx.storyId"
                 class="gothic-card p-3.5 flex items-center justify-between group">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex-shrink-0 w-9 h-9 rounded-lg bg-cthulhu-900/40 border border-cthulhu-700/40
                            flex items-center justify-center text-cthulhu-300 font-serif text-sm">
                  {{ idx.name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <h3 class="font-medium text-parchment-200 truncate text-sm">{{ idx.name }}</h3>
                  <p class="text-[10px] text-gray-500 mt-0.5">
                    {{ idx.chunkCount }} 个信息块
                    <span v-if="idx.indexedAt" class="ml-2">{{ formatDate(idx.indexedAt) }}</span>
                  </p>
                </div>
              </div>
              <button type="button" @click="handleDeleteIndex(idx.storyId, idx.name)"
                      class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200
                             bg-blood-900/30 border border-blood-700/30 text-blood-300
                             hover:bg-blood-800/40 opacity-0 group-hover:opacity-100 shrink-0">
                删除索引
              </button>
            </div>
          </div>

          <div v-else class="text-sm text-gray-600 py-4 text-center italic font-serif">
            暂无已索引的故事
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
