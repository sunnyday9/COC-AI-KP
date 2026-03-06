// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

describe('electron/logging', () => {
  let originalConsoleError: typeof console.error
  let originalConsoleWarn: typeof console.warn
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    originalConsoleError = console.error
    originalConsoleWarn = console.warn
    originalConsoleLog = console.log
    console.error = vi.fn()
    console.warn = vi.fn()
    console.log = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    console.log = originalConsoleLog
  })

  it('logError/logWarn/logInfo prefix messages with component and level', () => {
    const { logInfo, logWarn, logError } = require('../logging.cjs') as {
      logInfo: (component: string, message: string, meta?: Record<string, unknown>) => void
      logWarn: (component: string, message: string, meta?: Record<string, unknown>) => void
      logError: (component: string, message: string, meta?: Record<string, unknown>) => void
    }

    logInfo('AI', 'info message', { foo: 'bar' })
    logWarn('RAG', 'warn message')
    logError('KP', 'error message')

    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toMatch(/\[AI]\[INFO] info message/)
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toMatch(/\[RAG]\[WARN] warn message/)
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatch(/\[KP]\[ERROR] error message/)
  })
})

