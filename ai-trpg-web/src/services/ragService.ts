/**
 * RAG Service — communicates with the integrated Electron vector store via IPC.
 * No external Python service required.
 */
import type { RAGChunk } from '../types/script'

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
  ragContext: (params: { query: string; scriptId?: string; sceneId?: string; topK?: number }) => Promise<{ context: string }>
  ragListStories: () => Promise<IndexedStory[]>
  ragStoryOverview: (params: { storyId: string; topK?: number }) => Promise<{ overview: string; storyName: string }>
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

/** Get formatted context for LLM prompt */
export async function getContext(params: {
  query: string
  scriptId?: string
  sceneId?: string
  topK?: number
}): Promise<{ context: string }> {
  const api = getApi()
  if (!api?.ragContext) return { context: '' }
  return api.ragContext({
    query: params.query,
    scriptId: params.scriptId,
    sceneId: params.sceneId,
    topK: params.topK ?? 5,
  })
}
