import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProviderConfig } from '../services/ai/types'
import { PRESET_PROVIDERS, CUSTOM_PROVIDERS } from '../services/ai/types'

export type { AIProviderConfig }

export interface AppSettings {
  ai: AIProviderConfig
  syncServerUrl: string
}

const ALL_PROVIDER_IDS = new Set<string>([
  ...PRESET_PROVIDERS.map((p) => p.id),
  ...CUSTOM_PROVIDERS.map((p) => p.id),
])

const defaultSettings: AppSettings = {
  ai: {
    provider: 'openai',
    baseUrl: '',
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
  },
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
        settings.value = { ai, syncServerUrl }
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

  return {
    settings,
    aiConfig,
    load,
    save,
  }
})
