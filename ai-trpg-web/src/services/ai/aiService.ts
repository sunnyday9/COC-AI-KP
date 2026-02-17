import type { AIProviderConfig, ChatRequest, ChatResponse, ChatStream } from './types'
import { createOpenAICompatAdapter } from './adapters/openaiCompat'
import { createOllamaAdapter } from './adapters/ollama'
import { createGoogleAdapter } from './adapters/google'

function getAdapter(config: AIProviderConfig) {
  switch (config.provider) {
    case 'vllm':
    case 'openai':
    case 'openrouter':
      return createOpenAICompatAdapter(config)
    case 'ollama':
      return createOllamaAdapter(config)
    case 'google':
      return createGoogleAdapter(config)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

export async function chat(config: AIProviderConfig, request: ChatRequest): Promise<ChatResponse | ChatStream> {
  const api = (window as unknown as { electronAPI?: { aiChat: (p: unknown) => Promise<{ stream: boolean; content?: string; chunks?: string[] }> } }).electronAPI
  if (api?.aiChat) {
    const result = await api.aiChat({
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      messages: request.messages,
      temperature: config.temperature ?? request.temperature,
      maxTokens: request.maxTokens ?? config.maxTokens,
      stream: request.stream ?? false,
    })
    if (result?.stream && result.chunks) {
      return (async function* () {
        for (const c of result.chunks!) yield c
      })()
    }
    return { content: result?.content ?? '' }
  }
  const adapter = getAdapter(config)
  return adapter.chat(request)
}

export function isStreamResponse(result: ChatResponse | ChatStream): result is ChatStream {
  return typeof (result as AsyncIterable<string>)[Symbol.asyncIterator] === 'function'
}

export async function consumeStream(stream: ChatStream): Promise<string> {
  let full = ''
  for await (const chunk of stream) {
    full += chunk
  }
  return full
}
