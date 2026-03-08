// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractGraphFromChunksLLM } from '../graphExtractLLM.mjs'
import { parseExtractOutput } from '../prompts/cocExtractGraph.js'

describe('electron/rag/graphExtractLLM', () => {
  it('returns empty graph when no chunks', async () => {
    const result = await extractGraphFromChunksLLM({
      scriptId: 's1',
      chunks: [],
      invokeChat: async () => ({ content: '' }),
    })
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('parseExtractOutput handles pipe format', () => {
    const text = `图书馆 | scene | 调查员可搜索的场所
密信 | clue | 关键线索
图书馆 | contains | 密信
---END---`
    const { entities, relations } = parseExtractOutput(text)
    expect(entities).toHaveLength(2)
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({ source: '图书馆', target: '密信', type: 'contains' })
  })

  it('parseExtractOutput handles JSON format', () => {
    const text = '{"entities":[{"name":"张三","type":"npc","description":"主角"}],"relations":[{"source":"张三","target":"图书馆","type":"located_in","description":""}]}'
    const { entities, relations } = parseExtractOutput(text)
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('张三')
    expect(relations).toHaveLength(1)
  })
})
