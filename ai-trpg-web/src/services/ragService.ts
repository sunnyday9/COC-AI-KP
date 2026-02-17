import type { RAGChunk } from '../types/script'

export interface RAGChunkResult {
  content: string
  metadata: Record<string, string>
  distance: number
}

async function getRagBaseUrl(): Promise<string> {
  const { useSettingsStore } = await import('../stores/settingsStore')
  const store = useSettingsStore()
  return store.settings.ragUrl || 'http://localhost:8001'
}

async function fetchRag<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getRagBaseUrl()
  const url = base.replace(/\/$/, '') + path
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) throw new Error(`RAG: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Check if RAG service is available */
export async function checkRagHealth(): Promise<boolean> {
  try {
    const base = await getRagBaseUrl()
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/** Index script chunks for RAG */
export async function indexScript(
  scriptId: string,
  chunks: RAGChunk[]
): Promise<{ ok: boolean; indexed: number }> {
  const body = {
    scriptId,
    chunks: chunks.map((c) => ({
      id: c.id,
      content: c.content,
      type: c.type,
      metadata: c.metadata,
    })),
  }
  return fetchRag('/index', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Delete script index */
export async function deleteScriptIndex(scriptId: string): Promise<{ ok: boolean; deleted: number }> {
  return fetchRag(`/index/${encodeURIComponent(scriptId)}`, { method: 'DELETE' })
}

/** Query relevant chunks */
export async function queryChunks(params: {
  query: string
  scriptId?: string
  sceneId?: string
  type?: string
  topK?: number
}): Promise<{ chunks: RAGChunkResult[] }> {
  return fetchRag('/query', {
    method: 'POST',
    body: JSON.stringify({
      query: params.query,
      scriptId: params.scriptId,
      sceneId: params.sceneId,
      type: params.type,
      topK: params.topK ?? 5,
    }),
  })
}

/** Get formatted context for LLM prompt */
export async function getContext(params: {
  query: string
  scriptId?: string
  sceneId?: string
  topK?: number
}): Promise<{ context: string }> {
  return fetchRag('/context', {
    method: 'POST',
    body: JSON.stringify({
      query: params.query,
      scriptId: params.scriptId,
      sceneId: params.sceneId,
      topK: params.topK ?? 5,
    }),
  })
}
