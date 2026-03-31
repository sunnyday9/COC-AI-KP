import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProviderConfig } from '../services/ai/types'
import { PRESET_PROVIDERS, CUSTOM_PROVIDERS } from '../services/ai/types'

export type { AIProviderConfig }

export type RAGEmbeddingProvider = 'builtin' | 'api'

export interface RAGSettings {
  useEmbeddings: boolean
  /** 'builtin' = preloaded local model (no API); 'api' = use AI Base URL + API Key + model */
  provider: RAGEmbeddingProvider
  model: string
  /** Use local GraphRAG (Microsoft GraphRAG-style, COC-specialized) */
  useGraphRAG?: boolean
  /** Model for local GraphRAG extraction when MS GraphRAG unavailable */
  extractionModel?: string
}

export interface AppSettings {
  ai: AIProviderConfig
  rag?: RAGSettings
  syncServerUrl: string
  debugMode?: boolean
}

const ALL_PROVIDER_IDS = new Set<string>([
  ...PRESET_PROVIDERS.map((p) => p.id),
  ...CUSTOM_PROVIDERS.map((p) => p.id),
])

const defaultRAG: RAGSettings = {
  // 默认启用语义检索（嵌入向量），在 Electron 内自动使用本地向量检索 + GraphRAG
  useEmbeddings: true,
  provider: 'builtin',
  model: 'text-embedding-3-small',
  useGraphRAG: true,
  extractionModel: '',
}

const defaultSettings: AppSettings = {
  ai: {
    provider: 'openai',
    baseUrl: '',
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
  },
  rag: defaultRAG,
  syncServerUrl: 'http://localhost:3000',
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...defaultSettings })

  async function load() {
    const api = window.electronAPI
    if (api?.getSettings) {
      const saved = await api.getSettings()
      if (saved && typeof saved === 'object') {
        const rawAi = saved.ai && typeof saved.ai === 'object' ? saved.ai as Record<string, unknown> : {}
        const ai: AIProviderConfig = {
          ...defaultSettings.ai,
          ...rawAi,
          provider: ALL_PROVIDER_IDS.has(String(rawAi.provider ?? '')) ? (rawAi.provider as AIProviderConfig['provider']) : 'openai',
          model: typeof rawAi.model === 'string' ? rawAi.model : defaultSettings.ai.model,
          baseUrl: typeof rawAi.baseUrl === 'string' ? rawAi.baseUrl : defaultSettings.ai.baseUrl,
          apiKey: rawAi.apiKey !== undefined ? String(rawAi.apiKey) : defaultSettings.ai.apiKey,
          temperature: typeof rawAi.temperature === 'number' ? rawAi.temperature : defaultSettings.ai.temperature,
          maxTokens: typeof rawAi.maxTokens === 'number' ? rawAi.maxTokens : defaultSettings.ai.maxTokens,
        }
        const syncServerUrl = typeof saved.syncServerUrl === 'string' ? saved.syncServerUrl : defaultSettings.syncServerUrl
        const rawRag = saved.rag && typeof saved.rag === 'object' ? (saved.rag as Record<string, unknown>) : {}
        const rag: RAGSettings = {
          // 若未显式保存 useEmbeddings，则使用默认值（true）；只有明确写入 false 才关闭
          useEmbeddings: typeof rawRag.useEmbeddings === 'boolean' ? Boolean(rawRag.useEmbeddings) : defaultRAG.useEmbeddings,
          provider: rawRag.provider === 'api' ? 'api' : 'builtin',
          model: typeof rawRag.model === 'string' ? rawRag.model : defaultRAG.model,
          useGraphRAG: rawRag.useGraphRAG === false ? false : true,
          extractionModel: typeof rawRag.extractionModel === 'string' ? rawRag.extractionModel : '',
        }
        const debugMode = typeof saved.debugMode === 'boolean' ? saved.debugMode : false
        settings.value = { ai, rag, syncServerUrl, debugMode }
      }
    }
  }

  async function save() {
    const api = window.electronAPI
    if (api?.setSettings) {
      await api.setSettings(settings.value)
    }
  }

  const aiConfig = computed(() => settings.value.ai)
  const debugMode = computed(() => settings.value.debugMode ?? false)

  return {
    settings,
    aiConfig,
    debugMode,
    load,
    save,
  }
})
