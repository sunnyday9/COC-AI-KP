/// <reference types="vite/client" />

/** RAG IPC 返回类型（与主进程一致） */
interface RAGIndexParams {
  scriptId: string
  chunks: { id: string; content: string; type: string; metadata: Record<string, unknown> }[]
  storyMeta?: { name?: string }
}
interface RAGContextParams {
  query: string
  scriptId?: string
  sceneId?: string
  topK?: number
}
interface RAGQueryParams {
  query: string
  scriptId?: string
  sceneId?: string
  type?: string
  topK?: number
}
interface IndexedStory {
  storyId: string
  name: string
  chunkCount: number
  indexedAt: number
}

interface ElectronAPI {
  platform: string

  // Settings
  getSettings: () => Promise<Record<string, unknown>>
  setSettings: (settings: Record<string, unknown>) => Promise<void>

  // Stories (file: listStories / readStory / readStoryForRag / importStory / deleteStory)
  listStories: () => Promise<{ name: string; path: string }[]>
  readStory: (filePath: string) => Promise<string>
  readStoryForRag: (filePath: string) => Promise<string>
  importStory: () => Promise<{ ok: boolean; error?: string; path?: string; name?: string }>
  deleteStory: (filePath: string) => Promise<void>

  // AI（API Key 仅主进程使用，不暴露给渲染进程）
  aiChat: (params: {
    provider: string
    model?: string
    baseUrl?: string
    apiKey?: string
    messages: { role: string; content: string }[]
    temperature?: number
    maxTokens?: number
    stream?: boolean
  }) => Promise<{ stream: boolean; content?: string; chunks?: string[] }>
  aiListModels: (params: { provider: string; baseUrl?: string; apiKey?: string }) => Promise<{ value: string; label: string }[]>

  // KP Agent (LangGraph)
  kpInvoke: (params: {
    messages: { role: string; content: string }[]
    provider?: string
    model?: string
    baseUrl?: string
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) => Promise<{ content?: string; toolCalls?: { id: string; name: string; arguments: string }[] }>
  kpInvokeStream: (params: {
    messages: { role: string; content: string }[]
    provider?: string
    model?: string
    baseUrl?: string
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }) => Promise<{ streamId: string }>
  onKpStream: (handler: (payload: {
    streamId: string
    type: 'chunk' | 'end' | 'error'
    chunk?: string
    content?: string
    toolCalls?: { id: string; name: string; arguments: string }[]
    error?: string
  }) => void) => () => void

  // Saves
  listSaves: () => Promise<string[]>
  readSave: (saveId: string) => Promise<unknown>
  writeSave: (saveId: string, data: unknown) => Promise<void>

  // RAG（向量存储，与 preload 暴露命名一致）
  ragHealth: () => Promise<{ status: string; service: string }>
  ragIndex: (params: RAGIndexParams) => Promise<{ ok: boolean; indexed: number }>
  ragDelete: (scriptId: string) => Promise<{ ok: boolean; deleted: number }>
  ragQuery: (params: RAGQueryParams) => Promise<{ chunks: { content: string; metadata: Record<string, string>; distance: number }[] }>
  ragContext: (params: RAGContextParams) => Promise<{ context: string }>
  ragListStories: () => Promise<IndexedStory[]>
  ragStoryOverview: (params: { storyId: string; topK?: number }) => Promise<{ overview: string; storyName: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** 需要已进入游戏（phase=playing 且 characterSheet 已确认）才允许访问 */
    requiresGame?: boolean
  }
}

