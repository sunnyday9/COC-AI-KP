<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useDebugStore } from '../../stores/debugStore'
import type { TraceEvent, Trace } from '../../services/tracing'

const debug = useDebugStore()

type Tab = 'live' | 'traces' | 'export'
const tab = ref<Tab>('live')
const autoScroll = ref(true)
const liveContainer = ref<HTMLElement | null>(null)
const expandedTraceId = ref<string | null>(null)
const expandedEventId = ref<string | null>(null)

onMounted(() => {
  if (!debug.enabled) {
    debug.setEnabled(true)
  }
})

const liveEvents = computed(() => debug.liveEvents)
const traces = computed(() => debug.traces)

watch(liveEvents, () => {
  if (autoScroll.value && liveContainer.value) {
    nextTick(() => {
      liveContainer.value?.scrollTo({ top: liveContainer.value.scrollHeight })
    })
  }
}, { deep: true })

function spanColor(span: string): string {
  const map: Record<string, string> = {
    rag_retrieval: 'text-cyan-400',
    prompt_assembly: 'text-purple-400',
    kp_agent: 'text-blue-400',
    tool_execution: 'text-amber-400',
    state_update: 'text-green-400',
    long_term_summary: 'text-pink-400',
  }
  return map[span] || 'text-gray-400'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(trace: Trace): string {
  if (!trace.endTime) return 'running...'
  return `${trace.endTime - trace.startTime}ms`
}

function eventSummary(evt: TraceEvent): string {
  const d = evt.data
  switch (evt.eventType) {
    case 'rag_query_sent': return `query="${(d.query as string)?.slice(0, 40)}..." topK=${d.topK}`
    case 'rag_context_received': return `len=${d.contextLength} graph=${d.hasGraphSummary}`
    case 'intent_classified': return `intent=${d.intent}`
    case 'agent_routed': return `→ ${d.agentType}`
    case 'tool_plan_created': return `tools=[${(d.requiredTools as string[])?.join(',')}]`
    case 'llm_generate_end': return `${d.responseLength}chars ${d.durationMs}ms tools=${d.toolCallCount}`
    case 'validation_result': return `${d.result} missing=[${(d.missingTools as string[])?.join(',')}]`
    case 'tool_executed': return `${d.name}(${d.success ? 'ok' : 'FAIL'}) ${d.durationMs}ms`
    case 'character_snapshot': return `HP=${d.hp}/${d.hpMax} SAN=${d.san}/${d.sanMax} MP=${d.mp}/${d.mpMax}`
    case 'scene_changed': return `${d.from} → ${d.to}`
    case 'clue_added': return `"${(d.description as string)?.slice(0, 40)}"`
    case 'memory_updated': return `len=${d.kpMemoryLength}`
    case 'summary_output': return `${d.newSummaryLength}chars`
    case 'trace_error': return `[${d.source}] ${(d.message as string)?.slice(0, 50)}`
    default: return JSON.stringify(d).slice(0, 60)
  }
}

function handleExport() {
  const json = debug.exportTraces()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kptrace-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault()
  }
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="flex flex-col h-full bg-gray-950 text-gray-300 text-xs font-mono">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900/80 shrink-0">
      <span class="text-amber-500 font-bold text-[10px] tracking-wider">KPTRACE</span>
      <div class="flex gap-0.5 ml-2">
        <button
          v-for="t in (['live', 'traces', 'export'] as Tab[])"
          :key="t"
          :class="['px-2 py-0.5 rounded transition-colors',
            tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300']"
          @click="tab = t"
        >
          {{ t === 'live' ? 'Live' : t === 'traces' ? 'Traces' : 'Export' }}
        </button>
      </div>
      <div class="flex-1" />
      <span class="text-[10px] text-gray-600">{{ liveEvents.length }} events · {{ traces.length }} traces</span>
      <label class="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
        <input v-model="autoScroll" type="checkbox" class="w-3 h-3 rounded bg-gray-800 border-gray-600" />
        Auto-scroll
      </label>
      <button
        class="text-gray-600 hover:text-red-400 text-[10px] px-1"
        title="Clear"
        @click="debug.clearHistory()"
      >
        Clear
      </button>
    </div>

    <!-- Live events -->
    <div v-if="tab === 'live'" ref="liveContainer" class="flex-1 overflow-auto min-h-0">
      <div v-if="!liveEvents.length" class="text-gray-600 text-center py-8">
        Waiting for events... Send a message to start tracing.
      </div>
      <div
        v-for="evt in liveEvents"
        :key="evt.id"
        class="px-3 py-0.5 hover:bg-gray-900/60 cursor-pointer border-b border-gray-900/40"
        @click="expandedEventId = expandedEventId === evt.id ? null : evt.id"
      >
        <div class="flex items-center gap-2">
          <span class="text-gray-600 w-16 shrink-0">{{ formatTime(evt.timestamp) }}</span>
          <span :class="[spanColor(evt.spanName), 'w-28 shrink-0 truncate']">{{ evt.spanName }}</span>
          <span class="text-gray-400 w-36 shrink-0 truncate">{{ evt.eventType }}</span>
          <span class="text-gray-500 truncate flex-1">{{ eventSummary(evt) }}</span>
        </div>
        <div v-if="expandedEventId === evt.id" class="mt-1 ml-16 mb-1">
          <pre class="text-[10px] text-gray-400 whitespace-pre-wrap max-h-40 overflow-auto bg-gray-900 rounded p-2">{{ JSON.stringify(evt.data, null, 2) }}</pre>
        </div>
      </div>
    </div>

    <!-- Trace history -->
    <div v-if="tab === 'traces'" class="flex-1 overflow-auto min-h-0">
      <div v-if="!traces.length" class="text-gray-600 text-center py-8">No completed traces yet.</div>
      <div v-for="trace in [...traces].reverse()" :key="trace.id" class="border-b border-gray-800">
        <div
          class="px-3 py-1.5 hover:bg-gray-900/60 cursor-pointer flex items-center gap-2"
          @click="expandedTraceId = expandedTraceId === trace.id ? null : trace.id"
        >
          <span class="text-gray-600 w-16 shrink-0">{{ formatTime(trace.startTime) }}</span>
          <span class="text-blue-400 shrink-0">{{ trace.id.slice(0, 12) }}</span>
          <span class="text-gray-500">{{ trace.events.length }} events</span>
          <span class="text-gray-600">{{ formatDuration(trace) }}</span>
          <div class="flex-1" />
          <div class="flex gap-0.5">
            <span
              v-for="[name] in trace.spans"
              :key="name"
              :class="[spanColor(name), 'px-1 py-0 rounded bg-gray-800/60 text-[9px]']"
            >
              {{ name.replace(/_/g, ' ') }}
            </span>
          </div>
        </div>
        <div v-if="expandedTraceId === trace.id" class="px-3 pb-2 space-y-1">
          <div v-for="[spanName, span] in trace.spans" :key="spanName" class="ml-4">
            <div :class="[spanColor(spanName), 'font-bold text-[10px] mb-0.5']">
              {{ spanName }} ({{ span.events.length }} events, {{ (span.endTime || Date.now()) - span.startTime }}ms)
            </div>
            <div
              v-for="evt in span.events"
              :key="evt.id"
              class="ml-4 py-0.5 flex items-center gap-2 text-[10px]"
            >
              <span class="text-gray-600 w-14 shrink-0">+{{ evt.timestamp - trace.startTime }}ms</span>
              <span class="text-gray-400 w-32 shrink-0 truncate">{{ evt.eventType }}</span>
              <span class="text-gray-500 truncate">{{ eventSummary(evt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Export -->
    <div v-if="tab === 'export'" class="flex-1 overflow-auto min-h-0 p-3">
      <p class="text-gray-500 mb-2">Export all trace data as JSON for offline analysis.</p>
      <button
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs"
        @click="handleExport"
      >
        Download Traces ({{ traces.length }})
      </button>
      <div class="mt-3">
        <p class="text-gray-600 mb-1">Preview (latest trace):</p>
        <pre v-if="debug.latestTrace" class="text-[10px] text-gray-500 whitespace-pre-wrap max-h-60 overflow-auto bg-gray-900 rounded p-2">{{ JSON.stringify({
          ...debug.latestTrace,
          spans: Object.fromEntries(debug.latestTrace.spans),
        }, null, 2).slice(0, 2000) }}...</pre>
        <p v-else class="text-gray-600">No traces yet.</p>
      </div>
    </div>
  </div>
</template>
