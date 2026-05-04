<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStoryStore } from '../stores/storyStore'
import { listIndexedStories, deleteStoryIndex, getStoryGraph, type IndexedStory } from '../services/ragService'
import { useToast } from '../composables/useToast'
import GraphBrowser from '../components/rag/GraphBrowser.vue'

const toast = useToast()
const storyStore = useStoryStore()
const { storyFiles, isLoading: storiesLoading } = storeToRefs(storyStore)
const hasElectron = computed(() => !!window.electronAPI)
const isDev = import.meta.env.DEV

const indexedStories = ref<IndexedStory[]>([])
const indexStatus = ref<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})
const expandedGraph = ref<Record<string, boolean>>({})
const graphCache = ref<Record<string, Awaited<ReturnType<typeof getStoryGraph>> | undefined>>({})
const graphLoading = ref<Record<string, boolean>>({})

const graphRagTestStatus = ref<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({})
const graphRagTestError = ref<Record<string, string>>({})
const graphRagTestPreviewText = ref<Record<string, string>>({})

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

async function toggleGraphPanel(storyId: string) {
  expandedGraph.value[storyId] = !expandedGraph.value[storyId]
  if (!expandedGraph.value[storyId]) return
  if (graphCache.value[storyId] !== undefined) return

  graphLoading.value[storyId] = true
  try {
    graphCache.value[storyId] = await getStoryGraph(storyId)
  } catch (e) {
    toast.error(`加载 GraphRAG 失败：${e instanceof Error ? e.message : String(e)}`)
    graphCache.value[storyId] = null
  } finally {
    graphLoading.value[storyId] = false
  }
}

async function handleTestGraphRagExtract(storyId: string) {
  graphRagTestStatus.value[storyId] = 'loading'
  graphRagTestError.value[storyId] = ''
  graphRagTestPreviewText.value[storyId] = ''

  try {
    const api = window.electronAPI
    if (!api?.ragTestGraphRagExtract) throw new Error('Electron RAG test endpoint unavailable')

    const result = await api.ragTestGraphRagExtract({ scriptId: storyId, maxChunks: 6, maxBatches: 3 })
    if (!result?.ok) throw new Error(result?.error || 'GraphRAG extract test failed')

    graphRagTestStatus.value[storyId] = 'ok'
    graphRagTestPreviewText.value[storyId] = JSON.stringify(result, null, 2).slice(0, 8000)
  } catch (e) {
    graphRagTestStatus.value[storyId] = 'error'
    graphRagTestError.value[storyId] = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_archives.png');">
    <!-- Thematic dark overlay for contrast -->
    <div class="absolute inset-0 bg-black/70 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-col flex-1">
      <!-- Header -->
      <div class="px-6 pt-8 pb-4 max-w-4xl mx-auto w-full">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="gothic-heading text-2xl font-bold text-white" style="text-shadow: 0 1px 4px rgba(0,0,0,0.8);">故事管理</h1>
            <p class="mt-1 text-sm" style="color: hsl(220, 10%, 60%);">导入故事文件并索引到向量数据库，供 AI KP 参考</p>
          </div>
          <div v-if="hasElectron" class="flex gap-2">
            <button type="button" @click="handleImport" class="gothic-btn text-sm bg-black/60">
              导入故事
            </button>
          </div>
        </div>
        <div class="mt-3 max-w-[80px] ink-divider" />
      </div>

    <div class="flex-1 px-6 pb-12 max-w-4xl mx-auto w-full space-y-6">

      <!-- No Electron -->
      <p v-if="!hasElectron" class="gothic-card p-5 text-center text-sm font-serif italic bg-black/40 backdrop-blur-md"
         style="color: hsl(38, 25%, 65%);">
        请在 Electron 桌面应用中运行以使用完整功能
      </p>

      <template v-else>
        <!-- Story files section -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="gothic-heading text-sm font-bold flex items-center gap-2">
              <span style="color: hsl(38, 30%, 55%);">📄</span> 故事文件
            </h2>
            <div class="flex gap-3">
              <button type="button" @click="storyStore.loadStories()" :disabled="storiesLoading"
                      class="text-[11px] transition-colors disabled:opacity-50"
                      style="color: hsl(165, 50%, 50%);">
                刷新
              </button>
              <button v-if="storyFiles.length" type="button" @click="handleIndexAll"
                      class="text-[11px]" style="color: hsl(165, 60%, 50%);">
                索引全部
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="storiesLoading && storyFiles.length === 0" class="gothic-card p-8 text-center bg-black/40 backdrop-blur-md">
            <div class="sigil-spinner mx-auto" />
            <p class="mt-3 text-sm font-serif italic" style="color: hsl(220, 10%, 50%);">加载中...</p>
          </div>

          <!-- File list -->
          <div v-else-if="storyFiles.length" class="space-y-2">
            <div v-for="story in storyFiles" :key="story.path"
                 class="gothic-card p-4 flex items-center justify-between group bg-black/50 backdrop-blur-sm border-black/40 hover:bg-black/60">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-display text-sm"
                     style="background: hsla(38, 18%, 18%, 0.4);
                            border: 1px solid hsla(38, 20%, 30%, 0.3);
                            color: hsl(38, 35%, 68%);">
                  {{ story.name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <h3 class="font-serif font-semibold break-words text-sm" style="color: hsl(38, 50%, 88%);">{{ story.name }}</h3>
                  <p class="text-[10px] mt-0.5"
                     :style="{ color: isIndexed(story.path) ? 'hsl(165, 50%, 50%)' : 'hsl(220, 10%, 25%)' }">
                    {{ isIndexed(story.path) ? '已索引' : '未索引' }}
                  </p>
                </div>
              </div>
              <div class="flex gap-1.5 shrink-0">
                <button type="button" @click="handleIndexStory(story.path)"
                        :disabled="indexStatus[story.path] === 'loading'"
                        class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200 disabled:opacity-50"
                        style="background: hsla(165, 35%, 10%, 0.5);
                               border: 1px solid hsla(165, 45%, 22%, 0.3);
                               color: hsl(165, 50%, 78%);">
                  {{ indexStatus[story.path] === 'loading' ? '索引中...'
                   : indexStatus[story.path] === 'ok' ? '✓ 完成' : '索引' }}
                </button>
                <button type="button" @click="handleDeleteStory(story.path, story.name)"
                        class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200
                               opacity-0 group-hover:opacity-100"
                        style="background: hsla(0, 50%, 15%, 0.3);
                               border: 1px solid hsla(0, 55%, 22%, 0.3);
                               color: hsl(0, 55%, 65%);">
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div v-else class="gothic-card p-8 text-center bg-black/40 backdrop-blur-md">
            <p class="text-lg font-serif italic mb-2" style="color: hsl(220, 10%, 45%);">"书架上空无一物..."</p>
            <p class="text-sm" style="color: hsl(220, 10%, 55%);">点击「导入故事」添加 PDF、TXT 或 MD 文件</p>
          </div>
        </section>

        <!-- Indexed stories section -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="gothic-heading text-sm font-bold flex items-center gap-2">
              <span style="color: hsl(165, 50%, 50%);">🗃</span> 已索引故事
            </h2>
            <button type="button" @click="refreshIndexed"
                    class="text-[11px]" style="color: hsl(165, 50%, 50%);">
              刷新
            </button>
          </div>

          <div v-if="indexedStories.length" class="space-y-2">
            <div v-for="idx in indexedStories" :key="idx.storyId" class="gothic-card p-4 group bg-black/50 backdrop-blur-sm border-black/40 hover:bg-black/60">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-display text-sm"
                       style="background: hsla(165, 35%, 10%, 0.5);
                              border: 1px solid hsla(165, 45%, 22%, 0.4);
                              color: hsl(165, 50%, 78%);">
                    {{ idx.name.charAt(0) }}
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-serif font-semibold break-words text-sm" style="color: hsl(38, 50%, 88%);">{{ idx.name }}</h3>
                    <p class="text-[10px] mt-0.5" style="color: hsl(220, 10%, 30%);">
                      {{ idx.chunkCount }} 个信息块
                      <span v-if="idx.indexedAt" class="ml-2">{{ formatDate(idx.indexedAt) }}</span>
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <button
                    v-if="isDev"
                    type="button"
                    @click="toggleGraphPanel(idx.storyId)"
                    class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200"
                    style="background: hsla(220, 16%, 11%, 0.5);
                           border: 1px solid hsla(220, 14%, 16%, 0.5);
                           color: hsl(38, 25%, 55%);">
                    {{ expandedGraph[idx.storyId] ? '收起 GraphRAG' : '查看 GraphRAG' }}
                  </button>

                  <button type="button" @click="handleDeleteIndex(idx.storyId, idx.name)"
                          class="text-[11px] px-2.5 py-1 rounded-md transition-all duration-200
                                 opacity-0 group-hover:opacity-100 shrink-0"
                          style="background: hsla(0, 50%, 15%, 0.3);
                                 border: 1px solid hsla(0, 55%, 22%, 0.3);
                                 color: hsl(0, 55%, 65%);">
                    删除索引
                  </button>
                </div>
              </div>

              <div v-if="isDev && expandedGraph[idx.storyId]" class="mt-3 pt-3" style="border-top: 1px solid hsla(220, 14%, 16%, 0.5);">
                <div class="flex items-center justify-between gap-3 mb-3">
                  <button
                    type="button"
                    class="gothic-btn-secondary text-xs"
                    :disabled="graphRagTestStatus[idx.storyId] === 'loading'"
                    @click="handleTestGraphRagExtract(idx.storyId)"
                  >
                    {{ graphRagTestStatus[idx.storyId] === 'loading' ? '测试中...' : '测试 GraphRAG 抽取（前6chunks）' }}
                  </button>
                  <span v-if="graphRagTestStatus[idx.storyId] === 'ok'" class="text-xs" style="color: hsl(165, 50%, 60%);">✓ 测试完成</span>
                  <span v-if="graphRagTestStatus[idx.storyId] === 'error'" class="text-xs" style="color: hsl(0, 55%, 65%);">✕ {{ graphRagTestError[idx.storyId] }}</span>
                </div>

                <pre
                  v-if="graphRagTestPreviewText[idx.storyId]"
                  class="text-xs rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono"
                  style="color: hsl(38, 25%, 55%);
                         background: hsla(220, 20%, 4%, 0.5);
                         border: 1px solid hsl(220, 14%, 16%);"
                >{{ graphRagTestPreviewText[idx.storyId] }}</pre>

                <GraphBrowser
                  :graph="graphCache[idx.storyId] ?? null"
                  :loading="graphLoading[idx.storyId] ?? false"
                />
              </div>
            </div>
          </div>

          <div v-else class="text-sm py-4 text-center italic font-serif" style="color: hsl(220, 10%, 40%);">
            暂无已索引的故事
          </div>
        </section>
      </template>
    </div>
  </div>
</div>
</template>
