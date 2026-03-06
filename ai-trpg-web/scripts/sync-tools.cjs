#!/usr/bin/env node
/* Sync COC_KP_TOOLS (backend) -> frontend tool name list. */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const aiHandlersPath = path.join(root, 'electron', 'ipc', 'aiHandlers.cjs')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { COC_KP_TOOLS } = require(aiHandlersPath)

const names = Array.from(
  new Set(
    (COC_KP_TOOLS || [])
      .map((t) => String(t?.function?.name || '').trim())
      .filter(Boolean),
  ),
).sort()

const outPath = path.join(root, 'src', 'toolCalling', 'cocToolNames.json')
fs.writeFileSync(outPath, JSON.stringify(names, null, 2) + '\n', 'utf8')

console.log('[sync-tools] wrote', outPath, 'with', names.length, 'tools')

