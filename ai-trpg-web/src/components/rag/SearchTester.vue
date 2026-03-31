<script setup lang="ts">
import { ref } from 'vue'
import { queryChunks, getContext, type RAGChunkResult } from '../../services/ragService'

const props = defineProps<{ scriptId: string }>()

const query = ref('')
const topK = ref(5)
const running = ref(false)
const mode = ref<'chunks' | 'context'>('chunks')

const chunkResults = ref<RAGChunkResult[]>([])
const contextResult = ref('')
const elapsed = ref(0)

async function runSearch() {
  if (!query.value.trim() || !props.scriptId) return
  running.value = true
  chunkResults.value = []
  contextResult.value = ''
  const t0 = performance.now()
  try {
    if (mode.value === 'chunks') {
      const res = await queryChunks({
        query: query.value,
        scriptId: props.scriptId,
        topK: topK.value,
      })
      chunkResults.value = res.chunks
    } else {
      const res = await getContext({
        query: query.value,
        scriptId: props.scriptId,
        topK: topK.value,
      })
      contextResult.value = res.context
    }
  } catch (e: unknown) {
    contextResult.value = `Error: ${e instanceof Error ? e.message : String(e)}`
  }
  elapsed.value = Math.round(performance.now() - t0)
  running.value = false
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!scriptId" class="text-center text-gray-500 py-8">请先选择已索引的故事</div>

    <template v-else>
      <div class="flex flex-wrap gap-2 items-end">
        <div class="flex-1 min-w-[220px]">
          <label class="text-xs text-gray-400 block mb-1">查询文本</label>
          <input
            v-model="query"
            type="text"
            placeholder="例: 谁是凶手？图书馆里有什么线索？"
            class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            @keydown.enter="runSearch"
          />
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">TopK</label>
          <input
            v-model.number="topK"
            type="number"
            min="1"
            max="30"
            class="w-20 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200"
          />
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">模式</label>
          <select
            v-model="mode"
            class="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="chunks">Raw Chunks</option>
            <option value="context">Formatted Context</option>
          </select>
        </div>
        <button
          :disabled="running || !query.trim()"
          class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white transition-colors"
          @click="runSearch"
        >
          {{ running ? '查询中...' : '搜索' }}
        </button>
      </div>

      <div v-if="elapsed" class="text-xs text-gray-500">耗时 {{ elapsed }}ms</div>

      <!-- Chunk results -->
      <div v-if="mode === 'chunks' && chunkResults.length" class="space-y-2">
        <div
          v-for="(c, i) in chunkResults"
          :key="i"
          class="p-3 bg-gray-800/60 rounded border border-gray-700"
        >
          <div class="flex items-center gap-3 mb-1">
            <span class="text-xs font-mono text-blue-400">#{{ i + 1 }}</span>
            <span class="text-xs text-amber-400">distance: {{ c.distance.toFixed(4) }}</span>
            <span
              v-for="(mv, mk) in c.metadata"
              :key="String(mk)"
              class="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300"
            >
              {{ mk }}: {{ mv }}
            </span>
          </div>
          <pre class="text-xs text-gray-300 whitespace-pre-wrap max-h-40 overflow-auto">{{ c.content }}</pre>
        </div>
      </div>

      <!-- Context result -->
      <div v-if="mode === 'context' && contextResult" class="p-3 bg-gray-800/60 rounded border border-gray-700">
        <pre class="text-xs text-gray-300 whitespace-pre-wrap max-h-[60vh] overflow-auto">{{ contextResult }}</pre>
      </div>

      <div v-if="!running && elapsed && !chunkResults.length && !contextResult" class="text-center text-gray-500 py-4 text-sm">
        无结果
      </div>
    </template>
  </div>
</template>
