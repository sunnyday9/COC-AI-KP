<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { listIndexedStories, getStoryIndex, getStoryGraph, type IndexedStory } from '../services/ragService'
import ChunkBrowser from '../components/rag/ChunkBrowser.vue'
import GraphBrowser from '../components/rag/GraphBrowser.vue'
import SearchTester from '../components/rag/SearchTester.vue'

type Tab = 'chunks' | 'graph' | 'search'

const tab = ref<Tab>('chunks')
const stories = ref<IndexedStory[]>([])
const selectedStoryId = ref('')
const loading = ref(false)

const indexData = ref<{
  scriptId: string; storyName: string; chunkCount: number
  chunks: { id: string; content: string; type: string; metadata: Record<string, unknown>; hasVector: boolean }[]
} | null>(null)

const graphData = ref<{
  scriptId: string; storyName: string; indexedAt: number
  nodeCount: number; edgeCount: number
  nodes: { id: string; type: string; name: string; content: string; communityId: string | null; chunkIds: string[] }[]
  edges: { source: string; target: string; type: string; label: string }[]
  communitySummaries: Record<string, string>
} | null>(null)

onMounted(async () => {
  stories.value = await listIndexedStories()
  if (stories.value.length) {
    selectedStoryId.value = stories.value[0].storyId
  }
})

watch(selectedStoryId, async (id) => {
  if (!id) { indexData.value = null; graphData.value = null; return }
  loading.value = true
  try {
    const [idx, graph] = await Promise.all([getStoryIndex(id), getStoryGraph(id)])
    indexData.value = idx
    graphData.value = graph
  } catch (e) {
    console.error('[RagInspector] load failed', e)
  }
  loading.value = false
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-bold text-gray-100">RAG Inspector</h1>
        <p class="text-xs text-gray-500 mt-0.5">开发工具 — 检查 RAG 索引 / GraphRAG 提取结果 / 搜索质量</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">DEV ONLY</span>
      </div>
    </div>

    <!-- Story selector -->
    <div class="mb-4 flex items-center gap-3">
      <label class="text-sm text-gray-400">故事:</label>
      <select
        v-model="selectedStoryId"
        class="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 min-w-[260px]"
      >
        <option value="" disabled>选择已索引的故事</option>
        <option v-for="s in stories" :key="s.storyId" :value="s.storyId">
          {{ s.name }} ({{ s.chunkCount }} chunks)
        </option>
      </select>
      <span v-if="indexData" class="text-xs text-gray-500">
        {{ indexData.chunkCount }} chunks
        <template v-if="graphData"> · {{ graphData.nodeCount }} nodes · {{ graphData.edgeCount }} edges</template>
      </span>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-gray-700 mb-4">
      <button
        v-for="t in (['chunks', 'graph', 'search'] as Tab[])"
        :key="t"
        :class="['px-4 py-2 text-sm font-medium transition-colors',
          tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200']"
        @click="tab = t"
      >
        {{ t === 'chunks' ? 'Chunk 浏览器' : t === 'graph' ? 'Graph 浏览器' : '搜索测试' }}
      </button>
    </div>

    <!-- Tab content -->
    <ChunkBrowser
      v-if="tab === 'chunks'"
      :chunks="indexData?.chunks ?? []"
      :loading="loading"
    />
    <GraphBrowser
      v-if="tab === 'graph'"
      :graph="graphData ?? null"
      :loading="loading"
    />
    <SearchTester
      v-if="tab === 'search'"
      :script-id="selectedStoryId"
    />
  </div>
</template>
