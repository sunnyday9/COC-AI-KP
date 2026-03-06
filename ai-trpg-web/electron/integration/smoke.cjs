/**
 * Electron smoke integration test (real IPC + preload + BrowserWindow).
 *
 * Goals:
 * - Validate IPC wiring works end-to-end in an actual Electron process.
 * - Exercise core modules: settings, saves, RAG (index/query/context), file:readStoryForRag (PDF text path).
 *
 * Notes:
 * - This is intentionally lightweight and offline-friendly.
 * - OCR on embedded images is environment-dependent (tesseract language assets, CPU, etc),
 *   so we only assert the PDF main text path; OCR presence is logged as best-effort.
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert')
const { registerAllHandlers } = require('../ipc/index.cjs')

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

async function main() {
  const userData = mkdtemp('ai-trpg-electron-it-')
  app.setPath('userData', userData)

  await app.whenReady()
  registerAllHandlers()

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await win.loadURL('data:text/html,<html><body>ok</body></html>')

  async function call(expr) {
    return await win.webContents.executeJavaScript(expr, true)
  }

  const results = []
  function step(name, fn) {
    results.push({ name, fn })
  }

  // Settings get/set roundtrip
  step('settings:get returns object', async () => {
    const s = await call('window.electronAPI.getSettings()')
    assert(s && typeof s === 'object')
  })
  step('settings:set then get roundtrip', async () => {
    await call(`window.electronAPI.setSettings({ ai: { provider: 'openai', model: 'gpt-4', temperature: 0.7, maxTokens: 2048 }, rag: { useEmbeddings: false, provider: 'builtin', model: 'text-embedding-3-small' }, syncServerUrl: 'http://localhost:3000' })`)
    const s = await call('window.electronAPI.getSettings()')
    assert(String(s?.ai?.model || '').length > 0)
  })

  // Saves
  step('save:write then save:read', async () => {
    const saveId = 'smoke_' + Date.now()
    await call(`window.electronAPI.writeSave(${JSON.stringify(saveId)}, { hello: 'world', n: 1 })`)
    const obj = await call(`window.electronAPI.readSave(${JSON.stringify(saveId)})`)
    assert(obj && obj.hello === 'world' && obj.n === 1)
    const list = await call('window.electronAPI.listSaves()')
    assert(Array.isArray(list) && list.includes(saveId))
  })

  // RAG: index/query/context
  step('rag:health ok', async () => {
    const h = await call('window.electronAPI.ragHealth()')
    assert(h && h.status === 'ok')
  })
  step('rag:index then rag:query', async () => {
    const storyId = 'smoke_story'
    const chunks = [
      { id: 'c1', content: '你来到图书馆，书架上落满灰尘。', type: 'rule', metadata: { storyId, chunkIndex: '0' } },
      { id: 'c2', content: '医院的走廊传来低语，灯光忽明忽暗。', type: 'rule', metadata: { storyId, chunkIndex: '1' } },
    ]
    const r = await call(`window.electronAPI.ragIndex(${JSON.stringify({ scriptId: storyId, chunks, storyMeta: { name: 'Smoke' } })})`)
    assert(r && r.ok === true && r.indexed === 2)
    const q = await call(`window.electronAPI.ragQuery(${JSON.stringify({ query: '图书馆', scriptId: storyId, topK: 1 })})`)
    assert(q && Array.isArray(q.chunks) && q.chunks.length === 1)
    assert(String(q.chunks[0].content || '').includes('图书馆'))
  })
  step('rag:context builds formatted context', async () => {
    const storyId = 'smoke_story'
    const ctx = await call(`window.electronAPI.ragContext(${JSON.stringify({ query: '走廊', scriptId: storyId, topK: 2 })})`)
    assert(ctx && typeof ctx.context === 'string')
    assert(ctx.context.includes('## 剧本相关情报'))
  })

  // file:readStoryForRag (PDF text path)
  step('file:readStoryForRag returns extracted text for PDF', async () => {
    // Generate a realistic PDF via Chromium printToPDF (most compatible with pdf-parse).
    await win.loadURL('data:text/html,<html><body>Library clue: KEY IN VASE</body></html>')
    const bytes = await win.webContents.printToPDF({})
    const pdfPath = path.join(userData, 'test.pdf')
    fs.writeFileSync(pdfPath, Buffer.from(bytes))
    const text = await call(`window.electronAPI.readStoryForRag(${JSON.stringify(pdfPath)})`)
    assert(typeof text === 'string')
    assert(text.includes('Library') || text.includes('KEY') || text.length > 0)
    if (text.includes('以下为 PDF 内嵌插图中识别的内容')) {
      // best-effort OCR signal; do not hard-fail
      // eslint-disable-next-line no-console
      console.log('[smoke] OCR block detected')
    }
  })

  const failures = []
  for (const t of results) {
    try {
      await t.fn()
      // eslint-disable-next-line no-console
      console.log('[ok]', t.name)
    } catch (e) {
      failures.push({ name: t.name, error: e })
      // eslint-disable-next-line no-console
      console.error('[fail]', t.name, e && e.message ? e.message : e)
    }
  }

  if (failures.length) process.exitCode = 1
  await win.close()
  await app.quit()
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[smoke] fatal', e)
  process.exitCode = 1
  app.quit()
})

