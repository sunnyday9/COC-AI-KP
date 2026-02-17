import type { AIProviderConfig, ChatRequest, ChatResponse, ChatStream } from '../types'

export function createOllamaAdapter(config: AIProviderConfig) {
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'http://localhost:11434'
  const model = config.model || 'llama3'

  return {
    async chat(request: ChatRequest): Promise<ChatResponse | ChatStream> {
      const stream = request.stream ?? false
      const body = {
        model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream,
      }

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Ollama error: ${res.status} ${err}`)
      }

      if (stream) {
        return streamFromOllama(res)
      }

      const data = (await res.json()) as { message?: { content?: string } }
      return {
        content: data.message?.content ?? '',
      }
    },
  }
}

async function* streamFromOllama(res: Response): ChatStream {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6)
        if (json === '[DONE]') return
        try {
          const obj = JSON.parse(json) as { message?: { content?: string } }
          const content = obj.message?.content
          if (content) yield content
        } catch {
          // skip invalid json
        }
      }
    }
  }
}
