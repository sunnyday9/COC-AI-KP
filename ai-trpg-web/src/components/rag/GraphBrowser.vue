<script setup lang="ts">
import { ref, computed } from 'vue'

interface GraphNode {
  id: string; type: string; name: string; content: string
  communityId: string | null; chunkIds: string[]
}
interface GraphEdge {
  source: string; target: string; type: string; label: string
}
interface GraphData {
  scriptId: string; storyName: string; indexedAt: number
  nodeCount: number; edgeCount: number
  nodes: GraphNode[]; edges: GraphEdge[]
  communitySummaries: Record<string, string>
}

const props = defineProps<{ graph: GraphData | null; loading: boolean }>()

type Tab = 'nodes' | 'edges' | 'communities'
const tab = ref<Tab>('nodes')
const nodeTypeFilter = ref('')
const nodeSearch = ref('')
const selectedNodeId = ref<string | null>(null)

const nodeTypes = computed(() => {
  if (!props.graph) return []
  return [...new Set(props.graph.nodes.map(n => n.type))].sort()
})

const filteredNodes = computed(() => {
  if (!props.graph) return []
  let list = props.graph.nodes
  if (nodeTypeFilter.value) list = list.filter(n => n.type === nodeTypeFilter.value)
  if (nodeSearch.value) {
    const q = nodeSearch.value.toLowerCase()
    list = list.filter(n => n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }
  return list
})

const selectedNode = computed(() => {
  if (!selectedNodeId.value || !props.graph) return null
  return props.graph.nodes.find(n => n.id === selectedNodeId.value) || null
})

const selectedNodeEdges = computed(() => {
  if (!selectedNodeId.value || !props.graph) return []
  return props.graph.edges.filter(e => e.source === selectedNodeId.value || e.target === selectedNodeId.value)
})

const communityEntries = computed(() => {
  if (!props.graph?.communitySummaries) return []
  return Object.entries(props.graph.communitySummaries).filter(([, v]) => v)
})

function nodeColor(type: string) {
  const map: Record<string, string> = {
    person: 'text-blue-400', location: 'text-green-400', item: 'text-purple-400',
    event: 'text-amber-400', creature: 'text-red-400', organization: 'text-cyan-400',
    clue: 'text-yellow-400',
  }
  return map[type] || 'text-gray-400'
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="text-center text-gray-400 py-8">加载中...</div>
    <div v-else-if="!graph" class="text-center text-gray-500 py-8">无 GraphRAG 数据</div>

    <template v-else>
      <div class="flex items-center gap-4 text-xs text-gray-400">
        <span>节点: <strong class="text-gray-200">{{ graph.nodeCount }}</strong></span>
        <span>边: <strong class="text-gray-200">{{ graph.edgeCount }}</strong></span>
        <span>社区: <strong class="text-gray-200">{{ communityEntries.length }}</strong></span>
        <span>索引时间: {{ new Date(graph.indexedAt).toLocaleString() }}</span>
      </div>

      <div class="flex gap-1 border-b border-gray-700">
        <button
          v-for="t in (['nodes', 'edges', 'communities'] as Tab[])"
          :key="t"
          :class="['px-3 py-1.5 text-sm', tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200']"
          @click="tab = t"
        >
          {{ t === 'nodes' ? '节点' : t === 'edges' ? '关系边' : '社区摘要' }}
        </button>
      </div>

      <!-- Nodes -->
      <div v-if="tab === 'nodes'" class="space-y-2">
        <div class="flex flex-wrap gap-2">
          <input
            v-model="nodeSearch"
            type="text"
            placeholder="搜索节点名称..."
            class="flex-1 min-w-[180px] bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          />
          <select
            v-model="nodeTypeFilter"
            class="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="">全部类型</option>
            <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[60vh] overflow-auto">
          <div
            v-for="node in filteredNodes"
            :key="node.id"
            :class="['p-2 rounded border cursor-pointer transition-colors',
              selectedNodeId === node.id ? 'border-blue-500 bg-gray-800' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500']"
            @click="selectedNodeId = selectedNodeId === node.id ? null : node.id"
          >
            <div class="flex items-center gap-2">
              <span :class="[nodeColor(node.type), 'text-xs font-mono']">{{ node.type }}</span>
              <span class="text-sm text-gray-200 font-medium truncate">{{ node.name }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-1 truncate">{{ node.content.slice(0, 100) }}</div>
          </div>
        </div>

        <div v-if="selectedNode" class="mt-3 p-3 bg-gray-800 rounded border border-blue-500/50">
          <div class="text-sm font-medium text-gray-200 mb-2">{{ selectedNode.name }} ({{ selectedNode.type }})</div>
          <pre class="text-xs text-gray-300 whitespace-pre-wrap max-h-40 overflow-auto">{{ selectedNode.content }}</pre>
          <div class="mt-2 text-xs text-gray-400">
            Community: {{ selectedNode.communityId || 'N/A' }} · 关联 Chunks: {{ selectedNode.chunkIds.join(', ') || 'N/A' }}
          </div>
          <div v-if="selectedNodeEdges.length" class="mt-2">
            <div class="text-xs text-gray-500 mb-1">关系 ({{ selectedNodeEdges.length }}):</div>
            <div class="flex flex-col gap-1">
              <div v-for="(e, i) in selectedNodeEdges" :key="i" class="text-xs text-gray-300">
                <span class="text-gray-500">{{ e.source }}</span>
                <span class="text-amber-400 mx-1">--[{{ e.type }}]--></span>
                <span class="text-gray-500">{{ e.target }}</span>
                <span v-if="e.label" class="text-gray-600 ml-1">({{ e.label }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edges -->
      <div v-if="tab === 'edges'" class="max-h-[60vh] overflow-auto">
        <table class="w-full text-xs">
          <thead class="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-900">
            <tr>
              <th class="text-left py-1.5 px-2">Source</th>
              <th class="text-left py-1.5 px-2">Type</th>
              <th class="text-left py-1.5 px-2">Target</th>
              <th class="text-left py-1.5 px-2">Label</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(e, i) in graph.edges"
              :key="i"
              class="border-b border-gray-800 hover:bg-gray-800/60"
            >
              <td class="py-1 px-2 text-gray-300">{{ e.source }}</td>
              <td class="py-1 px-2 text-amber-400">{{ e.type }}</td>
              <td class="py-1 px-2 text-gray-300">{{ e.target }}</td>
              <td class="py-1 px-2 text-gray-500">{{ e.label }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Communities -->
      <div v-if="tab === 'communities'" class="space-y-3 max-h-[60vh] overflow-auto">
        <div v-if="!communityEntries.length" class="text-gray-500 text-sm py-4 text-center">无社区摘要</div>
        <div
          v-for="[cid, summary] in communityEntries"
          :key="cid"
          class="p-3 bg-gray-800/60 rounded border border-gray-700"
        >
          <div class="text-xs text-cyan-400 font-mono mb-1">{{ cid }}</div>
          <div class="text-sm text-gray-300 whitespace-pre-wrap">{{ summary }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
