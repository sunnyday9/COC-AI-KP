/**
 * Local GraphRAG — Microsoft GraphRAG-style pipeline.
 * Extract (LLM) → Community detection → Community summaries (LLM).
 * COC (Call of Cthulhu) domain specialization.
 * Persistence: userData/graph_index/{scriptId}.json
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { extractGraphFromChunksLLM } from './graphExtractLLM.mjs'
import { buildCommunityReportPrompt } from './prompts/cocCommunityReport.js'

function getGraphIndexDir() {
  return path.join(app.getPath('userData'), 'graph_index')
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function graphIndexPath(scriptId) {
  const safe = scriptId.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
  return path.join(getGraphIndexDir(), safe + '.json')
}

function loadGraph(scriptId) {
  const p = graphIndexPath(scriptId)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function saveGraph(scriptId, data) {
  ensureDir(getGraphIndexDir())
  fs.writeFileSync(graphIndexPath(scriptId), JSON.stringify(data), 'utf-8')
}

function deleteGraphFile(scriptId) {
  const p = graphIndexPath(scriptId)
  if (fs.existsSync(p)) {
    fs.unlinkSync(p)
    return true
  }
  return false
}

const memoryCache = new Map()

function computeCommunities(nodes, edges) {
  const idToIdx = new Map()
  nodes.forEach((n, i) => idToIdx.set(n.id, i))
  const parent = nodes.map((_, i) => i)
  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }
  function union(a, b) {
    const ra = find(idToIdx.get(a))
    const rb = find(idToIdx.get(b))
    if (ra != null && rb != null && ra !== rb) parent[ra] = rb
  }
  for (const e of edges || []) {
    if (e.source && e.target) union(e.source, e.target)
  }
  const result = new Map()
  nodes.forEach((n, i) => result.set(n.id, `community_${find(i)}`))
  return result
}

function buildCommunityInput(nodes, edges, communityId) {
  const commNodes = nodes.filter((n) => n.communityId === communityId)
  const nodeIds = new Set(commNodes.map((n) => n.id))
  const commEdges = (edges || []).filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const lines = ['Entities:', ...commNodes.map((n) => `  ${n.name} (${n.type}): ${(n.content || '').slice(0, 80)}`)]
  lines.push('', 'Relationships:', ...commEdges.map((e) => {
    const src = nodeById.get(e.source)?.name || e.source
    const tgt = nodeById.get(e.target)?.name || e.target
    return `  ${src} --[${e.type}]--> ${tgt}`
  }))
  return lines.join('\n')
}

async function generateCommunitySummaries(nodes, edges, invokeChat, extractionModel) {
  const summaries = {}
  const communityIds = [...new Set(nodes.map((n) => n.communityId).filter(Boolean))]
  const limit = Math.min(communityIds.length, 5)
  for (let i = 0; i < limit; i++) {
    const cid = communityIds[i]
    const input = buildCommunityInput(nodes, edges, cid)
    try {
      const prompt = buildCommunityReportPrompt({ inputText: input })
      const res = await invokeChat({
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.3,
        maxTokens: 512,
        model: extractionModel || undefined,
      })
      summaries[cid] = (res?.content || '').trim().slice(0, 500)
    } catch {
      summaries[cid] = ''
    }
  }
  return summaries
}

/**
 * Index graph from chunks using LLM extraction. Used when Microsoft GraphRAG is not available.
 * @param {object} [options] - { invokeChat, extractionModel? }
 */
export async function indexGraph(scriptId, chunks, storyMeta, options = {}) {
  if (!chunks?.length) {
    memoryCache.delete(scriptId)
    deleteGraphFile(scriptId)
    return { ok: true, nodeCount: 0, edgeCount: 0 }
  }

  const { invokeChat, extractionModel } = options || {}
  if (typeof invokeChat !== 'function') {
    return { ok: true, nodeCount: 0, edgeCount: 0 }
  }

  const result = await extractGraphFromChunksLLM({
    scriptId,
    storyMeta,
    chunks,
    invokeChat,
    extractionModel: extractionModel || undefined,
  })
  const nodes = result.nodes
  const edges = result.edges

  const communityIds = computeCommunities(nodes, edges)
  for (const n of nodes) {
    n.communityId = communityIds.get(n.id) ?? null
  }

  const communitySummaries = await generateCommunitySummaries(nodes, edges, invokeChat, extractionModel)
  const data = {
    scriptId,
    storyName: (storyMeta?.name) || scriptId,
    indexedAt: Date.now(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    communitySummaries,
  }

  memoryCache.set(scriptId, data)
  saveGraph(scriptId, data)
  return { ok: true, nodeCount: nodes.length, edgeCount: edges.length }
}

export function getGraph(scriptId) {
  if (memoryCache.has(scriptId)) return memoryCache.get(scriptId)
  const loaded = loadGraph(scriptId)
  if (loaded) {
    memoryCache.set(scriptId, loaded)
    return loaded
  }
  return null
}

export function deleteGraph(scriptId) {
  memoryCache.delete(scriptId)
  deleteGraphFile(scriptId)
  return { ok: true }
}

export function expandFromChunks(scriptId, chunkIds, maxHops = 2) {
  const graph = getGraph(scriptId)
  if (!graph?.nodes?.length) return { nodeIds: [], chunkIds: chunkIds || [] }

  const chunkToNode = new Map()
  for (const n of graph.nodes) {
    for (const cid of n.chunkIds || []) chunkToNode.set(cid, n)
  }

  let frontier = new Set()
  for (const cid of chunkIds || []) {
    const node = chunkToNode.get(cid)
    if (node) frontier.add(node.id)
  }

  const seen = new Set(frontier)
  const edgesBySource = new Map()
  for (const e of graph.edges || []) {
    if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, [])
    edgesBySource.get(e.source).push(e)
  }

  for (let h = 0; h < maxHops; h++) {
    const next = new Set()
    for (const nid of frontier) {
      const out = edgesBySource.get(nid) || []
      for (const e of out) {
        if (!seen.has(e.target)) {
          seen.add(e.target)
          next.add(e.target)
        }
      }
      const inEdges = (graph.edges || []).filter((ee) => ee.target === nid)
      for (const e of inEdges) {
        if (!seen.has(e.source)) {
          seen.add(e.source)
          next.add(e.source)
        }
      }
    }
    frontier = next
    if (frontier.size === 0) break
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const expandedChunkIds = new Set(chunkIds || [])
  for (const nid of seen) {
    const n = nodeById.get(nid)
    if (n?.chunkIds) for (const cid of n.chunkIds) expandedChunkIds.add(cid)
  }

  return { nodeIds: Array.from(seen), chunkIds: Array.from(expandedChunkIds) }
}
