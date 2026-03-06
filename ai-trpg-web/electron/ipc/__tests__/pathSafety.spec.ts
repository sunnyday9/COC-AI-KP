import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)
const { assertSafeId, assertPathInDir, resolveFileInDir, assertRealPathInDir } = require('../pathSafety.cjs') as {
  assertSafeId: (id: unknown, label?: string) => string
  assertPathInDir: (root: string, candidate: unknown, label?: string) => string
  resolveFileInDir: (root: string, fileName: unknown, label?: string) => string
  assertRealPathInDir: (root: string, candidate: unknown, label?: string) => Promise<string>
}

describe('ipc/pathSafety', () => {
  it('assertSafeId rejects traversal or separators', () => {
    expect(() => assertSafeId('../pwn', 'saveId')).toThrow()
    expect(() => assertSafeId('..\\pwn', 'saveId')).toThrow()
    expect(() => assertSafeId('a/b', 'saveId')).toThrow()
    expect(() => assertSafeId('a\\b', 'saveId')).toThrow()
  })

  it('assertSafeId accepts common generated ids', () => {
    expect(assertSafeId('save_1700000000000', 'saveId')).toBe('save_1700000000000')
    expect(assertSafeId('smoke_1700000000000', 'saveId')).toBe('smoke_1700000000000')
  })

  it('assertPathInDir rejects paths outside root', () => {
    const root = path.resolve('C:\\tmp\\root')
    expect(() => assertPathInDir(root, 'C:\\tmp\\root\\a.txt', 'p')).not.toThrow()
    expect(() => assertPathInDir(root, 'C:\\tmp\\root\\sub\\b.txt', 'p')).not.toThrow()
    expect(() => assertPathInDir(root, 'C:\\tmp\\other\\x.txt', 'p')).toThrow()
  })

  it('resolveFileInDir returns a normalized path in root', () => {
    const root = path.resolve('C:\\tmp\\root')
    const p = resolveFileInDir(root, 'a.json', 'f')
    expect(p).toBe(path.resolve(root, 'a.json'))
  })

  it('assertRealPathInDir falls back when path does not exist', async () => {
    const root = path.resolve('C:\\tmp\\root')
    const p = await assertRealPathInDir(root, path.resolve(root, 'nope.txt'), 'p')
    expect(p).toBe(path.resolve(root, 'nope.txt'))
  })
})

