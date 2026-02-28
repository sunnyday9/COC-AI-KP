import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIProviderType } from '../services/ai/types'
import { PRESET_PROVIDERS, CUSTOM_PROVIDERS } from '../services/ai/types'

export interface AIProviderConfig {
  provider: AIProviderType
  baseUrl?: string
  model?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}

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
    const api = (window as unknown as { electronAPI?: { getSettings: () => Promise<Partial<AppSettings>> } }).electronAPI
    if (api?.getSettings) {
      const saved = await api.getSettings()
      if (saved && typeof saved === 'object') {
        const ai = { ...defaultSettings.ai, ...(saved.ai || {}) }
        if (!ALL_PROVIDER_IDS.has(ai.provider)) {
          ai.provider = 'openai'
        }
        settings.value = {
          ai,
          syncServerUrl: saved.syncServerUrl ?? defaultSettings.syncServerUrl,
        }
      }
    }
  }

  async function save() {
    const api = (window as unknown as { electronAPI?: { setSettings: (s: AppSettings) => Promise<void> } }).electronAPI
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
