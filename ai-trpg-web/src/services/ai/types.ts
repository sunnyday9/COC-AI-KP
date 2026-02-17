export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatResponse {
  content: string
  finishReason?: string
}

export type ChatStream = AsyncIterable<string>

export interface AIAdapter {
  chat(request: ChatRequest): Promise<ChatResponse | ChatStream>
}

export interface AIProviderConfig {
  provider: 'vllm' | 'ollama' | 'openai' | 'google' | 'openrouter'
  baseUrl?: string
  model?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}
