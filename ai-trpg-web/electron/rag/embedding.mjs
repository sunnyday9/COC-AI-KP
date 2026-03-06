/**
 * Embedding for RAG: built-in local model (default) or user's OpenAI-compatible API.
 */

const DEFAULT_API_MODEL = 'text-embedding-3-small'
/** Chinese sentence embedding (text2vec); ONNX-converted for Transformers.js */
const BUILTIN_MODEL_ID = 'Xenova/text2vec-base-chinese-sentence'

let builtinPipeline = null

/**
 * Preloaded default: local model via @xenova/transformers (no API key).
 * Lazy-loads on first use. Returns null if the optional dependency is not available.
 * @returns Promise<((text: string) => Promise<number[]>) | null>
 */
export async function createBuiltinEmbedder() {
  try {
    const { pipeline } = await import('@xenova/transformers')
    if (!builtinPipeline) {
      builtinPipeline = await pipeline('feature-extraction', BUILTIN_MODEL_ID)
    }
    const extractor = builtinPipeline
    return async function getEmbedding(text) {
      if (!text || typeof text !== 'string') return []
      const t = text.slice(0, 8192)
      const output = await extractor(t, { pooling: 'mean', normalize: true })
      const data = output && output.data
      if (data && typeof data.forEach === 'function') {
        return Array.from(data)
      }
      if (Array.isArray(data)) return data
      return []
    }
  } catch (_e) {
    return null
  }
}

/**
 * User-provided API: OpenAI-compatible /v1/embeddings.
 * @param config { baseUrl: string, apiKey: string, model?: string }
 * @returns ((text: string) => Promise<number[]>) | null
 */
export function createEmbedder(config) {
  const baseUrl = (config?.baseUrl || '').replace(/\/$/, '')
  const apiKey = config?.apiKey
  const model = config?.model || DEFAULT_API_MODEL

  if (!baseUrl || !apiKey) {
    return null
  }

  return async function getEmbedding(text) {
    if (!text || typeof text !== 'string') return []
    const url = `${baseUrl}/v1/embeddings`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8192),
      }),
    })
    if (!res.ok) {
      const err = new Error(`Embedding API ${res.status}: ${res.statusText}`)
      err.status = res.status
      throw err
    }
    const json = await res.json()
    const embedding = json?.data?.[0]?.embedding
    if (!Array.isArray(embedding)) throw new Error('Invalid embedding response')
    return embedding
  }
}
