const { ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { readSettings } = require('./settingsHandlers.cjs')
const { invokeChat } = require('./aiHandlers.cjs')

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

/** Build getEmbedding from settings. Always returns an embedding function when可能, 优先使用用户 API，其次回退到内置模型。 */
async function buildGetEmbedding() {
  const settings = await readSettings()
  const rag = settings.rag || {}
  const provider = rag.provider === 'api' ? 'api' : 'builtin'
  const embed = await getEmbeddingModule()

  if (provider === 'api') {
    const ai = settings?.ai || {}
    const baseUrl = (ai.baseUrl || '').trim()
    const apiKey = ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null
    if (baseUrl && apiKey) {
      const apiEmbedder = embed.createEmbedder({
        baseUrl,
        apiKey,
        model: rag.model || 'text-embedding-3-small',
      })
      if (apiEmbedder) return apiEmbedder
    }
    // 如果 API 配置不完整或失败，则回退到内置模型
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
    const vectorResult = await rag.indexChunks(scriptId, chunks, storyMeta, options)
    const settings = await readSettings()
    const ragSettings = settings?.rag || {}
    if (ragSettings.useGraphRAG !== false && typeof invokeChat === 'function') {
      const graphModule = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'graphStore.mjs')).href)
      await graphModule.indexGraph(scriptId, chunks, storyMeta, {
        invokeChat,
        extractionModel: ragSettings.extractionModel || settings?.ai?.model || undefined,
      })
    }
    return vectorResult
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
    const vectorResult = rag.deleteChunks(scriptId)
    try {
      const graphModule = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'graphStore.mjs')).href)
      graphModule.deleteGraph(scriptId)
    } catch {}
    return vectorResult
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
    const settings = await readSettings()
    const useGraphRAG = settings?.rag?.useGraphRAG !== false
    const graphRag = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'graphRag.mjs')).href)
    const getEmbedding = await buildGetEmbedding()
    return graphRag.buildContextWithGraph({
      query,
      scriptId,
      sceneId,
      topK: topK ?? 5,
      getEmbedding: getEmbedding || undefined,
      useGraphRAG,
    })
  })

  ipcMain.handle('rag:getIndex', async (_, params) => {
    const { scriptId } = params || {}
    if (!scriptId) return { scriptId: '', storyName: '', chunkCount: 0, chunks: [] }
    const rag = await getRagModule()
    const storyInfo = rag.listIndexedStories().find(s => s.storyId === scriptId)
    let chunks = []
    try {
      const { app: elApp } = require('electron')
      const fs = require('fs')
      const idxPath = path.join(
        elApp.getPath('userData'), 'rag_index',
        scriptId.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_') + '.json'
      )
      if (fs.existsSync(idxPath)) {
        const raw = JSON.parse(fs.readFileSync(idxPath, 'utf-8'))
        chunks = (raw.docs || []).map(d => ({
          id: d.id,
          content: d.content,
          type: d.type,
          metadata: d.metadata || {},
          hasVector: Array.isArray(d.vector) && d.vector.length > 0,
        }))
      }
    } catch {}
    return {
      scriptId,
      storyName: storyInfo?.name || scriptId,
      chunkCount: chunks.length,
      chunks,
    }
  })

  ipcMain.handle('rag:getGraph', async (_, params) => {
    const { scriptId } = params || {}
    if (!scriptId) return null
    try {
      const graphModule = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'graphStore.mjs')).href)
      const graph = graphModule.getGraph(scriptId)
      if (!graph) return null
      return {
        scriptId: graph.scriptId,
        storyName: graph.storyName,
        indexedAt: graph.indexedAt,
        nodeCount: graph.nodeCount || (graph.nodes || []).length,
        edgeCount: graph.edgeCount || (graph.edges || []).length,
        nodes: (graph.nodes || []).map(n => ({
          id: n.id,
          type: n.type,
          name: n.name,
          content: n.content || '',
          communityId: n.communityId || null,
          chunkIds: n.chunkIds || [],
        })),
        edges: (graph.edges || []).map(e => ({
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label || '',
        })),
        communitySummaries: graph.communitySummaries || {},
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('rag:userGraphAdd', async (_, params) => {
    const { storyId, sessionId, event } = params || {}
    if (!storyId || !sessionId || !event) return
    const userGraph = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'userGraphStore.mjs')).href)
    userGraph.addEvent(storyId, sessionId, event)
  })
  ipcMain.handle('rag:userGraphSync', async (_, params) => {
    const { storyId, sessionId, state } = params || {}
    if (!storyId || !sessionId) return
    const userGraph = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'userGraphStore.mjs')).href)
    userGraph.syncFromState(storyId, sessionId, state)
  })
  ipcMain.handle('rag:userGraphSummary', async (_, params) => {
    const { storyId, sessionId } = params || {}
    if (!storyId || !sessionId) return ''
    const userGraph = await import(pathToFileURL(path.join(__dirname, '..', 'rag', 'userGraphStore.mjs')).href)
    return userGraph.getSummary(storyId, sessionId)
  })
}

module.exports = { registerRAGHandlers }
