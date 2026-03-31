/**
 * RAG Service — communicates with the integrated Electron vector store via IPC.
 * No external Python service required.
 */
import type { RAGChunk } from '../types/script'
import { traceBus } from './tracing'

export interface RAGChunkResult {
  content: string
  metadata: Record<string, string>
  distance: number
}

export interface IndexedStory {
  storyId: string
  name: string
  chunkCount: number
  indexedAt: number
}

type ElectronRagAPI = {
  ragHealth: () => Promise<{ status: string; service: string }>
  ragIndex: (params: { scriptId: string; chunks: { id: string; content: string; type: string; metadata: Record<string, unknown> }[]; storyMeta?: { name?: string } }) => Promise<{ ok: boolean; indexed: number }>
  ragDelete: (scriptId: string) => Promise<{ ok: boolean; deleted: number }>
  ragQuery: (params: { query: string; scriptId?: string; sceneId?: string; type?: string; topK?: number }) => Promise<{ chunks: RAGChunkResult[] }>
  ragContext: (params: { query: string; scriptId?: string; sceneId?: string; topK?: number }) => Promise<{ context: string; graphSummary?: string }>
  ragListStories: () => Promise<IndexedStory[]>
  ragStoryOverview: (params: { storyId: string; topK?: number }) => Promise<{ overview: string; storyName: string }>
  ragUserGraphAdd?: (params: { storyId: string; sessionId: string; event: { type: string; name: string; description?: string } }) => Promise<void>
  ragUserGraphSync?: (params: { storyId: string; sessionId: string; state: { cluesObtained: string[]; currentScene: string } }) => Promise<void>
  ragUserGraphSummary?: (params: { storyId: string; sessionId: string }) => Promise<string>
}

function getApi(): ElectronRagAPI | null {
  return window.electronAPI ?? null
}

/** Check if RAG service is available */
export async function checkRagHealth(): Promise<boolean> {
  try {
    const api = getApi()
    if (!api?.ragHealth) return false
    const r = await api.ragHealth()
    return r?.status === 'ok'
  } catch {
    return false
  }
}

/** Index story chunks for RAG */
export async function indexStory(
  storyId: string,
  chunks: RAGChunk[],
  storyMeta?: { name?: string },
): Promise<{ ok: boolean; indexed: number }> {
  const api = getApi()
  if (!api?.ragIndex) throw new Error('RAG service unavailable (Electron API not found)')
  return api.ragIndex({
    scriptId: storyId,
    chunks: chunks.map((c) => ({
      id: c.id,
      content: c.content,
      type: c.type,
      metadata: c.metadata,
    })),
    storyMeta,
  })
}

/** Delete story index */
export async function deleteStoryIndex(storyId: string): Promise<{ ok: boolean; deleted: number }> {
  const api = getApi()
  if (!api?.ragDelete) throw new Error('RAG service unavailable')
  return api.ragDelete(storyId)
}

/** List all indexed stories */
export async function listIndexedStories(): Promise<IndexedStory[]> {
  const api = getApi()
  if (!api?.ragListStories) return []
  return api.ragListStories()
}

/** Get story overview (initial context for game start) */
export async function getStoryOverview(storyId: string, topK = 15): Promise<{ overview: string; storyName: string }> {
  const api = getApi()
  if (!api?.ragStoryOverview) return { overview: '', storyName: storyId }
  return api.ragStoryOverview({ storyId, topK })
}

/** Query relevant chunks */
export async function queryChunks(params: {
  query: string
  scriptId?: string
  sceneId?: string
  type?: string
  topK?: number
}): Promise<{ chunks: RAGChunkResult[] }> {
  const api = getApi()
  if (!api?.ragQuery) return { chunks: [] }
  return api.ragQuery({
    query: params.query,
    scriptId: params.scriptId,
    sceneId: params.sceneId,
    type: params.type,
    topK: params.topK ?? 5,
  })
}

/** Get formatted context for LLM prompt. With GraphRAG, context includes relationship structure. */
export async function getContext(params: {
  query: string
  scriptId?: string
  sceneId?: string
  topK?: number
}): Promise<{ context: string; graphSummary?: string }> {
  const api = getApi()
  if (!api?.ragContext) return { context: '' }
  traceBus.emit('rag_retrieval', 'rag_query_sent', {
    query: params.query,
    scriptId: params.scriptId,
    topK: params.topK ?? 5,
  })
  const result = await api.ragContext({
    query: params.query,
    scriptId: params.scriptId,
    sceneId: params.sceneId,
    topK: params.topK ?? 5,
  })
  traceBus.emit('rag_retrieval', 'rag_context_received', {
    chunkCount: 0,
    contextLength: result?.context?.length ?? 0,
    hasGraphSummary: !!(result?.graphSummary),
    hasUserGraph: false,
  })
  return result
}

/** Add user graph event (clue obtained, scene visited, etc.). */
export async function addUserGraphEvent(params: {
  storyId: string
  sessionId: string
  event: { type: 'clue' | 'scene' | 'action' | 'item' | 'npc'; name: string; description?: string }
}): Promise<void> {
  const api = getApi()
  if (!api?.ragUserGraphAdd) return
  await api.ragUserGraphAdd(params)
}

/** Sync user graph from game state (on load). */
export async function syncUserGraphFromState(params: {
  storyId: string
  sessionId: string
  state: { cluesObtained: string[]; currentScene: string }
}): Promise<void> {
  const api = getApi()
  if (!api?.ragUserGraphSync) return
  await api.ragUserGraphSync(params)
}

/** Get full chunk index for a story (dev/inspector use). */
export async function getStoryIndex(scriptId: string) {
  const api = getApi()
  if (!api?.ragGetIndex) return { scriptId, storyName: scriptId, chunkCount: 0, chunks: [] }
  return api.ragGetIndex({ scriptId })
}

/** Get full graph data for a story (dev/inspector use). */
export async function getStoryGraph(scriptId: string) {
  const api = getApi()
  if (!api?.ragGetGraph) return null
  return api.ragGetGraph({ scriptId })
}

/** Get user graph summary for memory/context. */
export async function getUserGraphSummary(storyId: string, sessionId: string): Promise<string> {
  const api = getApi()
  if (!api?.ragUserGraphSummary) return ''
  return api.ragUserGraphSummary({ storyId, sessionId })
}
