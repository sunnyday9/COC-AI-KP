const { ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

let ragModulePromise = null

function getRagModule() {
  if (!ragModulePromise) {
    const modulePath = path.join(__dirname, '..', 'rag', 'vectorStore.mjs')
    ragModulePromise = import(pathToFileURL(modulePath).href)
  }
  return ragModulePromise
}

function registerRAGHandlers() {
  ipcMain.handle('rag:health', async () => {
    const rag = await getRagModule()
    return rag.checkHealth()
  })

  ipcMain.handle('rag:index', async (_, params) => {
    const { scriptId, chunks, storyMeta } = params || {}
    if (!scriptId || !Array.isArray(chunks)) {
      return { ok: false, indexed: 0 }
    }
    const rag = await getRagModule()
    return rag.indexChunks(scriptId, chunks, storyMeta)
  })

  ipcMain.handle('rag:listStories', async () => {
    const rag = await getRagModule()
    return rag.listIndexedStories()
  })

  ipcMain.handle('rag:storyOverview', async (_, params) => {
    const { storyId, topK } = params || {}
    if (!storyId) return { overview: '', storyName: '' }
    const rag = await getRagModule()
    return rag.getStoryOverview(storyId, topK ?? 15)
  })

  ipcMain.handle('rag:delete', async (_, scriptId) => {
    if (!scriptId) return { ok: false, deleted: 0 }
    const rag = await getRagModule()
    return rag.deleteChunks(scriptId)
  })

  ipcMain.handle('rag:query', async (_, params) => {
    const { query, scriptId, sceneId, type, topK } = params || {}
    const rag = await getRagModule()
    return rag.queryChunks({ query, scriptId, sceneId, type, topK: topK ?? 5 })
  })

  ipcMain.handle('rag:context', async (_, params) => {
    const { query, scriptId, sceneId, topK } = params || {}
    const rag = await getRagModule()
    return rag.buildContext({ query, scriptId, sceneId, topK: topK ?? 5 })
  })
}

module.exports = { registerRAGHandlers }
