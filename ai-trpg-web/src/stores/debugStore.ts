import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { traceBus } from '../services/tracing'
import type { Trace, TraceEvent } from '../services/tracing'

export const useDebugStore = defineStore('debug', () => {
  const enabled = ref(false)
  const liveEvents = ref<TraceEvent[]>([])
  const maxLiveEvents = 200
  let unsubscribe: (() => void) | null = null

  function setEnabled(val: boolean) {
    enabled.value = val
    traceBus.enabled = val
    if (val && !unsubscribe) {
      unsubscribe = traceBus.subscribe((event) => {
        liveEvents.value.push(event)
        if (liveEvents.value.length > maxLiveEvents) {
          liveEvents.value = liveEvents.value.slice(-maxLiveEvents)
        }
      })
    } else if (!val && unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  const traces = computed<readonly Trace[]>(() => traceBus.traceHistory)

  const latestTrace = computed<Trace | null>(() => {
    const history = traceBus.traceHistory
    return history.length > 0 ? history[history.length - 1] : null
  })

  const currentTrace = computed<Trace | null>(() => traceBus.currentTrace)

  function clearHistory() {
    traceBus.clearHistory()
    liveEvents.value = []
  }

  function exportTraces(): string {
    return JSON.stringify(traceBus.exportTraces(), null, 2)
  }

  return {
    enabled,
    liveEvents,
    traces,
    latestTrace,
    currentTrace,
    setEnabled,
    clearHistory,
    exportTraces,
  }
})
