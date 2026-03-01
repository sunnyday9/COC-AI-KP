/**
 * KP 会话服务 — 流式调用与工具循环（mock Electron IPC）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hasKpAgent, runKpAgentLoop, runDirectChat } from '../kpSessionService'
import type { AIProviderConfig } from '../ai'

vi.mock('../ai', () => ({
  chat: vi.fn(),
  isStreamResponse: vi.fn(),
}))

const aiConfig: AIProviderConfig = {
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2048,
}

describe('kpSessionService hasKpAgent', () => {
  it('无 electronAPI 时返回 false', () => {
    const win = globalThis.window as Window & { electronAPI?: unknown }
    const prev = win.electronAPI
    win.electronAPI = undefined
    expect(hasKpAgent()).toBe(false)
    win.electronAPI = prev
  })

  it('有 kpInvokeStream 时返回 true', () => {
    const win = globalThis.window as Window & { electronAPI?: unknown }
    const prev = win.electronAPI
    ;(win as any).electronAPI = { kpInvokeStream: () => Promise.resolve({ streamId: 'x' }) }
    expect(hasKpAgent()).toBe(true)
    win.electronAPI = prev
  })
})

describe('kpSessionService runKpAgentLoop', () => {
  let listener: ((p: { streamId: string; type: string; chunk?: string; content?: string; toolCalls?: unknown[] }) => void) | null = null

  beforeEach(() => {
    listener = null
    ;(globalThis.window as any).electronAPI = {
      kpInvokeStream: vi.fn().mockResolvedValue({ streamId: 's1' }),
      onKpStream: (fn: (p: unknown) => void) => {
        listener = fn as typeof listener
        return () => { listener = null }
      },
    }
  })

  afterEach(() => {
    (globalThis.window as any).electronAPI = undefined
  })

  it('无工具调用时 onStreamChunk 被调用并返回完整内容', async () => {
    const onStreamChunk = vi.fn()
    const processToolCalls = vi.fn()
    const insertMessagesBeforeLast = vi.fn()

    const win = globalThis.window as any
    win.electronAPI.kpInvokeStream.mockImplementation(() => {
      setTimeout(() => {
        if (listener) listener({ streamId: 's1', type: 'chunk', chunk: '你好，' })
        setTimeout(() => {
          if (listener) listener({ streamId: 's1', type: 'chunk', chunk: '调查员。' })
          setTimeout(() => {
            if (listener) listener({ streamId: 's1', type: 'end', content: '你好，调查员。' })
          }, 0)
        }, 0)
      }, 0)
      return Promise.resolve({ streamId: 's1' })
    })

    const result = await runKpAgentLoop(
      [{ role: 'user', content: 'hi' }],
      aiConfig,
      { onStreamChunk, processToolCalls, insertMessagesBeforeLast }
    )

    expect(onStreamChunk).toHaveBeenCalled()
    expect(result).toBe('你好，调查员。')
    expect(processToolCalls).not.toHaveBeenCalled()
  })

  it('end 带 toolCalls 时调用 processToolCalls 与 insertMessagesBeforeLast', async () => {
    const onStreamChunk = vi.fn()
    const processToolCalls = vi.fn().mockReturnValue({
      toolResults: [{ role: 'tool', tool_call_id: 't1', content: 'ok' }],
      displayMessages: [],
    })
    const insertMessagesBeforeLast = vi.fn()

    let callCount = 0
    const win = globalThis.window as any
    win.electronAPI.kpInvokeStream.mockImplementation(() => {
      callCount++
      const streamId = 's' + callCount
      const isFirst = callCount === 1
      setTimeout(() => {
        if (listener) listener({
          streamId,
          type: 'end',
          content: isFirst ? '检定' : '结果',
          toolCalls: isFirst ? [{ id: 't1', name: 'skill_check', arguments: '{}' }] : undefined,
        })
      }, 0)
      return Promise.resolve({ streamId })
    })

    const result = await runKpAgentLoop(
      [{ role: 'user', content: '侦查房间' }],
      aiConfig,
      { onStreamChunk, processToolCalls, insertMessagesBeforeLast }
    )

    expect(processToolCalls).toHaveBeenCalled()
    expect(insertMessagesBeforeLast).toHaveBeenCalled()
    expect(result).toContain('检定')
  }, 8000)

  it('stream 收到 type: error 时 reject', async () => {
    const win = globalThis.window as any
    win.electronAPI.kpInvokeStream.mockImplementation(() => {
      setTimeout(() => {
        if (listener) listener({ streamId: 's1', type: 'error', error: 'backend error' })
      }, 0)
      return Promise.resolve({ streamId: 's1' })
    })
    await expect(
      runKpAgentLoop(
        [{ role: 'user', content: 'hi' }],
        aiConfig,
        { onStreamChunk: vi.fn(), processToolCalls: vi.fn(), insertMessagesBeforeLast: vi.fn() }
      )
    ).rejects.toThrow('backend error')
  }, 2000)

  it('无内容且无 toolCalls 时返回兜底文案并调用 onStreamChunk', async () => {
    const onStreamChunk = vi.fn()
    const win = globalThis.window as any
    win.electronAPI.kpInvokeStream.mockImplementation(() => {
      setTimeout(() => {
        if (listener) listener({ streamId: 's1', type: 'end', content: '' })
      }, 0)
      return Promise.resolve({ streamId: 's1' })
    })
    const result = await runKpAgentLoop(
      [{ role: 'user', content: 'hi' }],
      aiConfig,
      { onStreamChunk, processToolCalls: vi.fn(), insertMessagesBeforeLast: vi.fn() }
    )
    expect(result).toContain('守密人正在思考')
    expect(onStreamChunk).toHaveBeenLastCalledWith(result)
  }, 2000)
})

describe('kpSessionService runDirectChat', () => {
  it('非流式响应时使用 result.content 并调用 onStreamChunk', async () => {
    const ai = await import('../ai')
    vi.mocked(ai.chat).mockResolvedValue({ content: 'direct reply' })
    vi.mocked(ai.isStreamResponse).mockReturnValue(false)
    const onStreamChunk = vi.fn()
    const result = await runDirectChat(
      [{ role: 'user', content: 'hello' }],
      aiConfig,
      { onStreamChunk }
    )
    expect(result).toBe('direct reply')
    expect(onStreamChunk).toHaveBeenCalledWith('direct reply')
  })

  it('流式响应时迭代 chunk 并累加调用 onStreamChunk', async () => {
    const ai = await import('../ai')
    async function* stream() {
      yield '流式'
      yield '内容'
    }
    vi.mocked(ai.chat).mockResolvedValue(stream())
    vi.mocked(ai.isStreamResponse).mockReturnValue(true)
    const onStreamChunk = vi.fn()
    const result = await runDirectChat(
      [{ role: 'user', content: 'hi' }],
      aiConfig,
      { onStreamChunk }
    )
    expect(result).toBe('流式内容')
    expect(onStreamChunk).toHaveBeenCalledWith('流式')
    expect(onStreamChunk).toHaveBeenCalledWith('流式内容')
  })
})

describe('kpSessionService runKpAgentLoop (kpInvoke path)', () => {
  beforeEach(() => {
    ;(globalThis.window as any).electronAPI = {
      kpInvoke: vi.fn().mockResolvedValue({ content: 'from kpInvoke', toolCalls: undefined }),
    }
  })

  afterEach(() => {
    (globalThis.window as any).electronAPI = undefined
  })

  it('仅 kpInvoke 无 kpInvokeStream 时走 kpInvoke 并返回内容', async () => {
    const onStreamChunk = vi.fn()
    const result = await runKpAgentLoop(
      [{ role: 'user', content: 'test' }],
      aiConfig,
      { onStreamChunk, processToolCalls: vi.fn(), insertMessagesBeforeLast: vi.fn() }
    )
    expect(result).toBe('from kpInvoke')
    expect(onStreamChunk).toHaveBeenCalled()
  })
})
