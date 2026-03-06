const { ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { readSettings } = require('./settingsHandlers.cjs')

let ragModulePromise = null
let embeddingModulePromise = null

function getRagModule() {
  if (!ragModulePromise) {
    const modulePath = path.join(__dirname, '..', 'rag', 'vectorStore.mjs')
    ragModulePromise = import(pathToFileURL(modulePath).href)
  }
  return ragModulePromise
}

async function getEmbeddingModule() {
  if (!embeddingModulePromise) {
    const modulePath = path.join(__dirname, '..', 'rag', 'embedding.mjs')
    embeddingModulePromise = import(pathToFileURL(modulePath).href)
  }
  return embeddingModulePromise
}

/** Build getEmbedding from settings when rag.useEmbeddings is true. Uses built-in model by default; user API when rag.provider === 'api'. */
async function buildGetEmbedding() {
  const settings = await readSettings()
  if (!settings?.rag?.useEmbeddings) return null
  const rag = settings.rag || {}
  const provider = rag.provider === 'api' ? 'api' : 'builtin'
  const embed = await getEmbeddingModule()

  if (provider === 'api') {
    const ai = settings?.ai || {}
    const baseUrl = (ai.baseUrl || '').trim()
    const apiKey = ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null
    if (!baseUrl || !apiKey) return null
    return embed.createEmbedder({
      baseUrl,
      apiKey,
      model: rag.model || 'text-embedding-3-small',
    })
  }

  return await embed.createBuiltinEmbedder()
}

function registerRAGHandlers() {
  ipcMain.handle('rag:health', async () => {
    const rag = await getRagModule()
    const base = rag.checkHealth()
    const settings = await readSettings()
    const ragSettings = settings?.rag || {}
    return {
      ...base,
      embeddingEnabled: !!ragSettings.useEmbeddings,
      embeddingProvider: ragSettings.provider || 'builtin',
      embeddingModel: ragSettings.model || 'text-embedding-3-small',
    }
  })

  ipcMain.handle('rag:index', async (_, params) => {
    const { scriptId, chunks, storyMeta } = params || {}
    if (!scriptId || !Array.isArray(chunks)) {
      return { ok: false, indexed: 0 }
    }
    const rag = await getRagModule()
    const getEmbedding = await buildGetEmbedding()
    const options = getEmbedding ? { getEmbedding } : {}
    return rag.indexChunks(scriptId, chunks, storyMeta, options)
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
    const getEmbedding = await buildGetEmbedding()
    return rag.queryChunks({
      query,
      scriptId,
      sceneId,
      type,
      topK: topK ?? 5,
      getEmbedding: getEmbedding || undefined,
    })
  })

  ipcMain.handle('rag:context', async (_, params) => {
    const { query, scriptId, sceneId, topK } = params || {}
    const rag = await getRagModule()
    const getEmbedding = await buildGetEmbedding()
    return rag.buildContext({
      query,
      scriptId,
      sceneId,
      topK: topK ?? 5,
      getEmbedding: getEmbedding || undefined,
    })
  })
}

module.exports = { registerRAGHandlers }
