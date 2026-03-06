// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

function makeTmpDir() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-index-test-'))
  return p
}

describe('electron/rag/vectorStore', () => {
  let tmpUserData: string

  beforeEach(async () => {
    tmpUserData = makeTmpDir()
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { getPath: () => tmpUserData },
    }))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true })
    } catch {
      // ignore
    }
    vi.resetModules()
    vi.unmock('electron')
  })

  it('indexes, queries, and persists chunks (TF-IDF fallback)', async () => {
    const rag = await import('../vectorStore.mjs')
    const storyId = '故事A'
    await rag.indexChunks(
      storyId,
      [
        { id: 'c1', content: '你来到图书馆，闻到霉味。', type: 'scene', metadata: { sceneId: '图书馆', type: 'scene' } },
        { id: 'c2', content: '医院里灯光惨白，走廊尽头传来低语。', type: 'scene', metadata: { sceneId: '医院', type: 'scene' } },
      ],
      { name: '测试故事' },
      {}
    )

    const r1 = await rag.queryChunks({ query: '图书馆', scriptId: storyId, topK: 1 })
    expect(r1.chunks.length).toBe(1)
    expect(r1.chunks[0]!.content).toContain('图书馆')

    // scene filter should narrow candidates when scene_id exists
    const r2 = await rag.queryChunks({ query: '走廊', scriptId: storyId, sceneId: '医院', topK: 1 })
    expect(r2.chunks.length).toBe(1)
    expect(r2.chunks[0]!.content).toContain('医院')

    // anti-spoiler: if scene has no matches, do NOT fall back to other scenes
    const r3 = await rag.queryChunks({ query: '霉味', scriptId: storyId, sceneId: '不存在的场景', topK: 2 })
    expect(r3.chunks.length).toBe(0)

    // persisted index file exists
    const idxDir = path.join(tmpUserData, 'rag_index')
    expect(fs.existsSync(idxDir)).toBe(true)
    expect(fs.readdirSync(idxDir).some((f) => f.includes('故事A'))).toBe(true)
  })

  it('uses dense vectors when provided (hybrid supported)', async () => {
    const rag = await import('../vectorStore.mjs')
    const storyId = 'S'
    const embed = async (t: string) => (t.includes('图书馆') ? [1, 0] : [0, 1])
    await rag.indexChunks(
      storyId,
      [
        { id: 'a', content: '图书馆 线索A', type: 'rule', metadata: {} },
        { id: 'b', content: '医院 线索B', type: 'rule', metadata: {} },
      ],
      {},
      { getEmbedding: embed }
    )
    const r = await rag.queryChunks({ query: '图书馆', scriptId: storyId, topK: 1, getEmbedding: embed })
    expect(r.chunks[0]!.content).toContain('图书馆')
  })

  it('buildContext formats output with headings', async () => {
    const rag = await import('../vectorStore.mjs')
    const storyId = 'X'
    await rag.indexChunks(storyId, [{ id: 'c', content: '线索：钥匙在花瓶里。', type: 'clue', metadata: { type: 'clue' } }], {}, {})
    const ctx = await rag.buildContext({ query: '钥匙', scriptId: storyId, topK: 1 })
    expect(ctx.context).toContain('## 剧本相关情报')
    expect(ctx.context).toContain('### [1]')
  })
})

