export interface ModelOption {
  value: string
  label: string
}

interface FetchContext {
  apiKey?: string
  baseUrl?: string
}

async function fetchOpenRouterModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter: ${res.status}`)
  const data = (await res.json()) as { data?: { id: string; name?: string }[] }
  const models = data.data ?? []
  return models.map((m) => ({ value: m.id, label: m.name || m.id })).slice(0, 80)
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
  )
  if (!res.ok) throw new Error(`Google: ${res.status}`)
  const data = (await res.json()) as {
    models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
  }
  const models = (data.models ?? []).filter(
    (m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent')
  )
  return models.map((m) => {
    const id = ((m.name ?? '').replace('models/', '')) || (m.name ?? '')
    return { value: id, label: m.displayName || id }
  })
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI: ${res.status}`)
  const data = (await res.json()) as { data?: { id: string }[] }
  const models = data.data ?? []
  return models.filter((m) => m.id).map((m) => ({ value: m.id, label: m.id })).slice(0, 80)
}

async function fetchOllamaModels(baseUrl: string): Promise<ModelOption[]> {
  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/tags`)
  if (!res.ok) throw new Error(`Ollama: ${res.status}`)
  const data = (await res.json()) as { models?: { name: string }[] }
  const models = data.models ?? []
  return models.map((m) => ({ value: m.name, label: m.name }))
}

async function fetchVLLMModels(baseUrl: string): Promise<ModelOption[]> {
  const url = baseUrl.replace(/\/v1\/?$/, '')
  const res = await fetch(`${url}/v1/models`)
  if (!res.ok) throw new Error(`vLLM: ${res.status}`)
  const data = (await res.json()) as { data?: { id: string }[] }
  const models = data.data ?? []
  return models.map((m) => ({ value: m.id, label: m.id }))
}

export async function getModelOptions(
  provider: string,
  context: FetchContext
): Promise<ModelOption[]> {
  const api = (window as unknown as { electronAPI?: { aiListModels: (p: { provider: string; baseUrl?: string; apiKey?: string }) => Promise<ModelOption[]> } }).electronAPI
  if (api?.aiListModels) {
    return await api.aiListModels({ provider, baseUrl: context.baseUrl, apiKey: context.apiKey })
  }
  switch (provider) {
    case 'openrouter':
      if (context.apiKey) return fetchOpenRouterModels(context.apiKey)
      return []
    case 'google':
      if (context.apiKey) return fetchGoogleModels(context.apiKey)
      return []
    case 'openai':
      if (context.apiKey) return fetchOpenAIModels(context.apiKey)
      return []
    case 'ollama':
      if (context.baseUrl) return fetchOllamaModels(context.baseUrl)
      try {
        return await fetchOllamaModels('http://localhost:11434')
      } catch {
        return []
      }
    case 'vllm':
      if (context.baseUrl) return fetchVLLMModels(context.baseUrl)
      try {
        return await fetchVLLMModels('http://localhost:8000/v1')
      } catch {
        return []
      }
    default:
      return []
  }
}
