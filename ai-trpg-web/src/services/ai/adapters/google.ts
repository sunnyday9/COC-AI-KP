import type { AIProviderConfig, ChatRequest, ChatResponse, ChatStream } from '../types'

function toGeminiContents(messages: { role: string; content: string }[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

export function createGoogleAdapter(config: AIProviderConfig) {
  const apiKey = config.apiKey || ''
  const model = config.model || 'gemini-1.5-flash'
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  return {
    async chat(request: ChatRequest): Promise<ChatResponse | ChatStream> {
      if (!apiKey) throw new Error('Google API requires apiKey')
      const stream = request.stream ?? false
      const temp = config.temperature ?? request.temperature ?? 0.7
      const maxTokens = request.maxTokens ?? config.maxTokens ?? 2048

      const systemMsg = request.messages.find((m) => m.role === 'system')
      const otherMessages = request.messages.filter((m) => m.role !== 'system')
      const contents = toGeminiContents(otherMessages)

      const body: Record<string, unknown> = {
        contents,
        generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
      }
      if (systemMsg?.content) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] }
      }

      const url = `${baseUrl}/models/${model}:generateContent${stream ? 'Stream' : ''}?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Google API error: ${res.status} ${err}`)
      }

      if (stream) {
        return streamFromGoogle(res)
      }

      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return { content: text }
    },
  }
}

async function* streamFromGoogle(res: Response): ChatStream {
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
          const obj = JSON.parse(json) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
          const text = obj.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) yield text
        } catch {
          // skip
        }
      }
    }
  }
}
