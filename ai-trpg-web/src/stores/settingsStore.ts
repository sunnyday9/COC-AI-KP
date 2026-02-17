import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AIProviderConfig {
  provider: 'vllm' | 'ollama' | 'openai' | 'google' | 'openrouter'
  baseUrl?: string
  model?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}

export interface AppSettings {
  ai: AIProviderConfig
  ragUrl: string
  syncServerUrl: string
}

const defaultSettings: AppSettings = {
  ai: {
    provider: 'vllm',
    baseUrl: 'http://localhost:8000/v1',
    model: 'Qwen2-7B-Instruct',
    temperature: 0.7,
    maxTokens: 2048,
  },
  ragUrl: 'http://localhost:8001',
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
        if ((saved.ai as { provider?: string })?.provider === 'anthropic') ai.provider = 'openai'
        if (ai.provider === 'google' && ai.model && !/^gemini[-0-9.]/i.test(ai.model)) {
          ai.model = ''
        }
        settings.value = {
          ai,
          ragUrl: saved.ragUrl ?? defaultSettings.ragUrl,
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
