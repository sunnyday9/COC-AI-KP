import type { AIProviderConfig, ChatRequest, ChatResponse, ChatStream } from './types'

export async function chat(config: AIProviderConfig, request: ChatRequest): Promise<ChatResponse | ChatStream> {
  const api = window.electronAPI
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

  throw new Error('Electron IPC not available — AI calls require the Electron main process')
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
