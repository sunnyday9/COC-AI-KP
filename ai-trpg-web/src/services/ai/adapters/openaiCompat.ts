import OpenAI from 'openai'
import type { AIProviderConfig, ChatRequest, ChatResponse, ChatStream } from '../types'

export function createOpenAICompatAdapter(config: AIProviderConfig) {
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'http://localhost:8000/v1'
  const apiKey = config.apiKey || 'not-needed'
  const model = config.model || 'default'

  const client = new OpenAI({
    baseURL: baseUrl,
    apiKey,
  })

  return {
    async chat(request: ChatRequest): Promise<ChatResponse | ChatStream> {
      const temp = config.temperature ?? request.temperature ?? 0.7
      const maxTokens = request.maxTokens ?? config.maxTokens ?? 2048
      const stream = request.stream ?? false

      if (stream) {
        const streamResponse = await client.chat.completions.create({
          model,
          messages: request.messages,
          temperature: temp,
          max_tokens: maxTokens,
          stream: true,
        })
        return streamFromOpenAI(streamResponse)
      }

      const response = await client.chat.completions.create({
        model,
        messages: request.messages,
        temperature: temp,
        max_tokens: maxTokens,
        stream: false,
      })
      const choice = response.choices?.[0]
      return {
        content: choice?.message?.content ?? '',
        finishReason: choice?.finish_reason ?? undefined,
      }
    },
  }
}

async function* streamFromOpenAI(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
): ChatStream {
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) yield delta
  }
}
