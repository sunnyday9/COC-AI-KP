import { resolveProtocol, resolveBaseUrl } from './types'

export interface ModelOption {
  value: string
  label: string
}

interface FetchContext {
  apiKey?: string
  baseUrl?: string
}

export async function getModelOptions(
  provider: string,
  context: FetchContext,
  purpose: 'chat' | 'embeddings' = 'chat',
): Promise<ModelOption[]> {
  const api = window.electronAPI
  if (api?.aiListModels) {
    return await api.aiListModels({ provider, baseUrl: context.baseUrl, apiKey: context.apiKey, purpose })
  }

  // Fallback for non-Electron environments
  const protocol = resolveProtocol(provider as Parameters<typeof resolveProtocol>[0])
  const baseUrl = resolveBaseUrl(provider as Parameters<typeof resolveBaseUrl>[0], context.baseUrl)

  switch (protocol) {
    case 'openai_compatible':
    case 'deepseek_compatible': {
      const url = baseUrl.replace(/\/$/, '')
      if (!url) return []
      try {
        const modelsUrl = url.endsWith('/v1') ? `${url}/models` : `${url}/v1/models`
        const headers: Record<string, string> = {}
        if (context.apiKey) headers['Authorization'] = `Bearer ${context.apiKey}`
        const res = await fetch(modelsUrl, { headers })
        if (!res.ok) return []
        const data = (await res.json()) as { data?: { id: string }[] }
        let models = (data.data ?? []).filter((m) => m.id).map((m) => ({ value: m.id, label: m.id }))
        if (purpose === 'embeddings') {
          const filtered = models.filter((m) => /(embedding|embed)/i.test(m.value))
          if (filtered.length) models = filtered
        }
        return models.slice(0, 100)
      } catch {
        return []
      }
    }

    case 'anthropic_compatible':
      return [
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      ]

    case 'google_compatible': {
      if (!context.apiKey) return []
      const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
      try {
        const res = await fetch(`${base}/v1beta/models?key=${context.apiKey}&pageSize=100`)
        if (!res.ok) return []
        const data = (await res.json()) as {
          models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
        }
        const models = data.models ?? []
        const filtered =
          purpose === 'embeddings'
            ? models.filter((m) => {
                const methods = m.supportedGenerationMethods || []
                return m.name && (methods.includes('embedContent') || methods.includes('embedText') || methods.includes('embedding'))
              })
            : models.filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))

        const finalList = filtered.length ? filtered : (purpose === 'embeddings'
          ? models.filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
          : filtered)

        return finalList.map((m) => {
          const id = (m.name ?? '').replace('models/', '') || (m.name ?? '')
          return { value: id, label: m.displayName || id }
        })
      } catch {
        return []
      }
    }

    default:
      return []
  }
}
