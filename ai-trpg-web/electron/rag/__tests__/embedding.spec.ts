// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('electron/rag/embedding', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('createEmbedder calls OpenAI-compatible /v1/embeddings and returns embedding', async () => {
    const { createEmbedder } = await import('../embedding.mjs')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      status: 200,
      statusText: 'OK',
    })
    ;(globalThis as any).fetch = fetchMock

    const emb = createEmbedder({ baseUrl: 'http://localhost:1234', apiKey: 'k', model: 'm' })
    expect(emb).toBeTypeOf('function')
    const v = await emb!('你好')
    expect(v).toEqual([0.1, 0.2, 0.3])
    expect(fetchMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/v1/embeddings')
    expect((init as any).headers.Authorization).toContain('Bearer')
  })

  it('createBuiltinEmbedder returns null if transformers pipeline unavailable', async () => {
    // Ensure dynamic import fails
    vi.doMock('@huggingface/transformers', () => {
      throw new Error('nope')
    })
    const { createBuiltinEmbedder } = await import('../embedding.mjs')
    const emb = await createBuiltinEmbedder()
    expect(emb).toBeNull()
  })

  it('createBuiltinEmbedder caches pipeline and normalizes output', async () => {
    const pipeline = vi.fn()
    const extractor = vi.fn().mockResolvedValue({ data: Float32Array.from([1, 2, 3]) })
    pipeline.mockResolvedValue(extractor)
    vi.doMock('@huggingface/transformers', () => ({ pipeline }))

    const { createBuiltinEmbedder } = await import('../embedding.mjs')
    const emb1 = await createBuiltinEmbedder()
    const emb2 = await createBuiltinEmbedder()
    expect(emb1).toBeTypeOf('function')
    expect(emb2).toBeTypeOf('function')
    // pipeline should be called once due to module-level cache
    expect(pipeline).toHaveBeenCalledTimes(1)

    const v = await emb1!('测试')
    expect(v).toEqual([1, 2, 3])
  })
})

