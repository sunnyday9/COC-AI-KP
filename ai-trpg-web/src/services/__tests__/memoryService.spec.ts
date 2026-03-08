import { describe, it, expect, vi, beforeEach } from 'vitest'
import { summarizeLongTerm } from '../memoryService'

vi.mock('../ai', () => ({
  chat: vi.fn(),
}))

describe('memoryService summarizeLongTerm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('includes storyContextText when provided', async () => {
    const ai = await import('../ai')
    vi.mocked(ai.chat).mockResolvedValue({ content: 'NEW_SUMMARY' })

    const out = await summarizeLongTerm(
      { provider: 'openai', model: 'gpt-4', temperature: 0.7, maxTokens: 2048 } as any,
      {
        currentSummary: 'OLD',
        recentMessagesText: '玩家: A\n守密人: B',
        storyContextText: '场景: 图书馆\nSAN: 55',
      }
    )

    expect(out).toBe('NEW_SUMMARY')
    expect(ai.chat).toHaveBeenCalledTimes(1)
    const req = vi.mocked(ai.chat).mock.calls[0]![1] as any
    const userMsg = req.messages.find((m: any) => m.role === 'user')?.content ?? ''
    expect(userMsg).toContain('【当前故事上下文】')
    expect(userMsg).toContain('场景: 图书馆')
    expect(userMsg).toContain('【近期对话】')
  })

  it('includes ragContextText and userGraphSummary when provided', async () => {
    const ai = await import('../ai')
    vi.mocked(ai.chat).mockResolvedValue({ content: 'MERGED' })

    await summarizeLongTerm(
      { provider: 'openai', model: 'gpt-4', temperature: 0.7, maxTokens: 2048 } as any,
      {
        currentSummary: 'OLD',
        recentMessagesText: '玩家: 去图书馆',
        storyContextText: '场景: 图书馆',
        ragContextText: '图书馆内有密信',
        userGraphSummary: '已获线索：密信\n到访场景：图书馆',
      }
    )

    const req = vi.mocked(ai.chat).mock.calls[0]![1] as any
    const userMsg = req.messages.find((m: any) => m.role === 'user')?.content ?? ''
    expect(userMsg).toContain('【剧本相关情报（RAG检索）】')
    expect(userMsg).toContain('图书馆内有密信')
    expect(userMsg).toContain('【调查员行动记录】')
    expect(userMsg).toContain('已获线索：密信')
  })

  it('falls back to currentSummary on chat error', async () => {
    const ai = await import('../ai')
    vi.mocked(ai.chat).mockRejectedValue(new Error('network'))
    const out = await summarizeLongTerm(
      { provider: 'openai', model: 'gpt-4', temperature: 0.7, maxTokens: 2048 } as any,
      { currentSummary: 'KEEP', recentMessagesText: '玩家: X' }
    )
    expect(out).toBe('KEEP')
  })
})

