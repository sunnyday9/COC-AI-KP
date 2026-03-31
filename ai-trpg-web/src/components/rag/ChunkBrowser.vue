<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  chunks: { id: string; content: string; type: string; metadata: Record<string, unknown>; hasVector: boolean }[]
  loading: boolean
}>()

const search = ref('')
const typeFilter = ref('')
const expandedId = ref<string | null>(null)
const page = ref(0)
const PAGE_SIZE = 30

const chunkTypes = computed(() => {
  const s = new Set(props.chunks.map(c => c.type))
  return [...s].sort()
})

const filtered = computed(() => {
  let list = props.chunks
  if (typeFilter.value) list = list.filter(c => c.type === typeFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.content.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
  }
  return list
})

const paged = computed(() => filtered.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))

watch([search, typeFilter], () => { page.value = 0 })

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function typeBadgeColor(t: string) {
  const map: Record<string, string> = {
    scene: 'bg-blue-600', clue: 'bg-amber-600', npc: 'bg-green-600',
    item: 'bg-purple-600', rule: 'bg-red-600', overview: 'bg-cyan-600',
  }
  return map[t] || 'bg-gray-600'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2 items-center">
      <input
        v-model="search"
        type="text"
        placeholder="搜索内容 / ID..."
        class="flex-1 min-w-[200px] bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
      />
      <select
        v-model="typeFilter"
        class="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200"
      >
        <option value="">全部类型</option>
        <option v-for="t in chunkTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <span class="text-xs text-gray-400">{{ filtered.length }} / {{ chunks.length }} chunks</span>
    </div>

    <div v-if="loading" class="text-center text-gray-400 py-8">加载中...</div>

    <div v-else-if="!chunks.length" class="text-center text-gray-500 py-8">
      尚无索引数据，请先选择一个已索引的故事
    </div>

    <div v-else class="space-y-1">
      <div
        v-for="chunk in paged"
        :key="chunk.id"
        class="bg-gray-800/60 rounded border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
        @click="toggle(chunk.id)"
      >
        <div class="flex items-center gap-2 px-3 py-2">
          <span :class="[typeBadgeColor(chunk.type), 'text-xs px-1.5 py-0.5 rounded text-white font-mono']">
            {{ chunk.type }}
          </span>
          <span class="text-xs text-gray-400 font-mono flex-shrink-0">{{ chunk.id }}</span>
          <span class="text-sm text-gray-300 truncate flex-1">
            {{ chunk.content.slice(0, 80) }}{{ chunk.content.length > 80 ? '...' : '' }}
          </span>
          <span v-if="chunk.hasVector" class="text-xs text-green-400" title="已向量化">⬡</span>
          <span v-else class="text-xs text-gray-600" title="仅 TF-IDF">○</span>
        </div>

        <div v-if="expandedId === chunk.id" class="px-3 pb-3 border-t border-gray-700">
          <pre class="text-xs text-gray-300 whitespace-pre-wrap mt-2 max-h-60 overflow-auto">{{ chunk.content }}</pre>
          <div v-if="Object.keys(chunk.metadata).length" class="mt-2">
            <div class="text-xs text-gray-500 mb-1">Metadata:</div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(v, k) in chunk.metadata"
                :key="String(k)"
                class="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300"
              >
                {{ k }}: {{ v }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-2">
      <button
        :disabled="page === 0"
        class="px-2 py-1 text-xs bg-gray-700 rounded disabled:opacity-30"
        @click="page--"
      >
        ◀
      </button>
      <span class="text-xs text-gray-400">{{ page + 1 }} / {{ totalPages }}</span>
      <button
        :disabled="page >= totalPages - 1"
        class="px-2 py-1 text-xs bg-gray-700 rounded disabled:opacity-30"
        @click="page++"
      >
        ▶
      </button>
    </div>
  </div>
</template>
