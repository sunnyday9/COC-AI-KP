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

/** Preset providers with predefined base URLs */
export type PresetProvider =
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'gemini'
  | 'vllm'
  | 'ollama'

/** Custom/generic compatible types for user-defined endpoints */
export type CustomProvider =
  | 'openai_compatible'
  | 'anthropic_compatible'
  | 'google_compatible'
  | 'deepseek_compatible'

export type AIProviderType = PresetProvider | CustomProvider

/** The 4 underlying protocol types that all providers route to */
export type CompatibleProtocol =
  | 'openai_compatible'
  | 'anthropic_compatible'
  | 'google_compatible'
  | 'deepseek_compatible'

export interface ProviderPreset {
  id: PresetProvider
  label: string
  description: string
  protocol: CompatibleProtocol
  defaultBaseUrl: string
  needsApiKey: boolean
  needsBaseUrl: boolean
  apiKeyPlaceholder: string
}

export interface CustomProviderDef {
  id: CustomProvider
  label: string
  description: string
  protocol: CompatibleProtocol
  defaultBaseUrl: string
  apiKeyPlaceholder: string
}

export const PRESET_PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o、o1 等 OpenAI 官方模型',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    needsApiKey: true,
    needsBaseUrl: false,
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '聚合多家模型的统一 API 网关',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    needsApiKey: true,
    needsBaseUrl: false,
    apiKeyPlaceholder: 'sk-or-...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方 API（V3/R1 等）',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    needsApiKey: true,
    needsBaseUrl: false,
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 系列模型（Google AI Studio）',
    protocol: 'google_compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    needsApiKey: true,
    needsBaseUrl: false,
    apiKeyPlaceholder: 'AIza...',
  },
  {
    id: 'vllm',
    label: 'vLLM (本地)',
    description: '本地 vLLM 推理服务器',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:8000/v1',
    needsApiKey: false,
    needsBaseUrl: true,
    apiKeyPlaceholder: '',
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    description: '本地 Ollama 模型服务',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    needsApiKey: false,
    needsBaseUrl: true,
    apiKeyPlaceholder: '',
  },
]

export const CUSTOM_PROVIDERS: CustomProviderDef[] = [
  {
    id: 'openai_compatible',
    label: 'OpenAI 兼容',
    description: '任何 OpenAI 兼容 API 端点',
    protocol: 'openai_compatible',
    defaultBaseUrl: '',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic_compatible',
    label: 'Anthropic 兼容',
    description: 'Claude 系列及 Anthropic 兼容 API',
    protocol: 'anthropic_compatible',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'google_compatible',
    label: 'Google 兼容',
    description: 'Gemini API 兼容端点',
    protocol: 'google_compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyPlaceholder: 'AIza...',
  },
  {
    id: 'deepseek_compatible',
    label: 'DeepSeek 兼容',
    description: 'DeepSeek 兼容 API（OpenAI 格式）',
    protocol: 'deepseek_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyPlaceholder: 'sk-...',
  },
]

export function getProviderDef(id: AIProviderType): (ProviderPreset | CustomProviderDef) | undefined {
  return (PRESET_PROVIDERS as (ProviderPreset | CustomProviderDef)[]).find((p) => p.id === id) ??
    CUSTOM_PROVIDERS.find((p) => p.id === id)
}

export function resolveProtocol(id: AIProviderType): CompatibleProtocol {
  const def = getProviderDef(id)
  return def?.protocol ?? 'openai_compatible'
}

export function resolveBaseUrl(id: AIProviderType, userBaseUrl?: string): string {
  const def = getProviderDef(id)
  return userBaseUrl || def?.defaultBaseUrl || ''
}

export interface AIProviderConfig {
  provider: AIProviderType
  baseUrl?: string
  model?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}
