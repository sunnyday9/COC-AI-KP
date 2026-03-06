// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)

describe('scripts/sync-tools', () => {
  it('writes cocToolNames.json matching COC_KP_TOOLS function names', () => {
    const root = path.resolve(__dirname, '..', '..')
    const scriptPath = path.join(root, 'scripts', 'sync-tools.cjs')

    // execute script (idempotent)
    require(scriptPath)

    const { COC_KP_TOOLS } = require(path.join(root, 'electron', 'ipc', 'aiHandlers.cjs')) as {
      COC_KP_TOOLS: Array<{ function?: { name?: string } }>
    }
    const backendNames = Array.from(
      new Set(
        (COC_KP_TOOLS || [])
          .map((t) => String(t?.function?.name ?? '').trim())
          .filter(Boolean),
      ),
    ).sort()

    const outPath = path.join(root, 'src', 'toolCalling', 'cocToolNames.json')
    const file = fs.readFileSync(outPath, 'utf8')
    const list = JSON.parse(file) as string[]

    expect(list.slice().sort()).toEqual(backendNames)
  })
})

