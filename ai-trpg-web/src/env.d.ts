/// <reference types="vite/client" />

interface ElectronAPI {
  platform: string
  aiChat: (params: { provider: string; model?: string; baseUrl?: string; messages: { role: string; content: string }[]; temperature?: number; maxTokens?: number; stream?: boolean }) => Promise<{ stream: boolean; content?: string; chunks?: string[] }>
  aiListModels: (params: { provider: string; baseUrl?: string; apiKey?: string }) => Promise<{ value: string; label: string }[]>
  kpInvoke: (params: { messages: { role: string; content: string }[]; provider?: string; model?: string; baseUrl?: string; apiKey?: string; temperature?: number; maxTokens?: number }) => Promise<{ content?: string }>
  kpInvokeStream: (params: { messages: { role: string; content: string }[]; provider?: string; model?: string; baseUrl?: string; apiKey?: string; temperature?: number; maxTokens?: number }) => Promise<{ streamId: string }>
  onKpStream: (handler: (payload: { streamId: string; type: 'chunk' | 'end' | 'error'; chunk?: string; content?: string; toolCalls?: { id: string; name: string; arguments: string }[]; error?: string }) => void) => () => void
  getSettings: () => Promise<Record<string, unknown>>
  setSettings: (settings: Record<string, unknown>) => Promise<void>
  listScripts: () => Promise<{ name: string; path: string }[]>
  readScript: (filePath: string) => Promise<string>
  saveScript: (filePath: string, content: string) => Promise<void>
  saveScriptToLibrary: (filename: string, content: string) => Promise<{ ok: boolean; path: string; name: string }>
  deleteScript: (filePath: string) => Promise<void>
  importScript: () => Promise<{ ok: boolean; error?: string; path?: string; name?: string }>
  listStories: () => Promise<{ name: string; path: string }[]>
  readStory: (filePath: string) => Promise<string>
  importStory: () => Promise<{ ok: boolean; error?: string; path?: string; name?: string }>
  deleteStory: (filePath: string) => Promise<void>
  listSaves: () => Promise<string[]>
  readSave: (saveId: string) => Promise<unknown>
  writeSave: (saveId: string, data: unknown) => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
