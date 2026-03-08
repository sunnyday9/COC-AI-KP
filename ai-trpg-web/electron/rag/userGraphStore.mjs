/**
 * User-centric session graph: records investigator actions, clues, scenes visited.
 * COC domain: obtained, visited, performed, met.
 * Persistence: userData/session_graph/{storyId}_{sessionId}.json
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const ROOT_NODE_ID = 'investigator'

function getSessionGraphDir() {
  return path.join(app.getPath('userData'), 'session_graph')
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function graphKey(storyId, sessionId) {
  const s = [storyId, sessionId].filter(Boolean).join('_').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
  return s || 'default'
}

function graphPath(storyId, sessionId) {
  ensureDir(getSessionGraphDir())
  return path.join(getSessionGraphDir(), graphKey(storyId, sessionId) + '.json')
}

function loadGraph(storyId, sessionId) {
  const p = graphPath(storyId, sessionId)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function saveGraph(storyId, sessionId, data) {
  fs.writeFileSync(graphPath(storyId, sessionId), JSON.stringify(data), 'utf-8')
}

function toNodeId(type, name) {
  const safe = String(name || '').trim().replace(/[:\s|]+/g, '_') || 'unknown'
  return `${String(type || 'entity').toLowerCase()}:${safe}`
}

/**
 * Add a user event to the session graph.
 * @param {string} storyId
 * @param {string} sessionId
 * @param {object} event - { type: 'clue'|'scene'|'action'|'item'|'npc', name, description?, metadata? }
 */
export function addEvent(storyId, sessionId, event) {
  if (!storyId || !sessionId) return
  const { type, name, description = '', metadata = {} } = event || {}
  const nameStr = String(name || '').trim()
  if (!nameStr) return

  let data = loadGraph(storyId, sessionId)
  if (!data) {
    data = {
      storyId,
      sessionId,
      nodes: [{ id: ROOT_NODE_ID, type: 'investigator', name: '调查员', content: '', createdAt: Date.now() }],
      edges: [],
      createdAt: Date.now(),
    }
  }

  const nodes = data.nodes || []
  const edges = data.edges || []
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const nodeId = toNodeId(type, nameStr)
  const now = Date.now()

  if (!nodeById.has(nodeId)) {
    nodes.push({
      id: nodeId,
      type: String(type || 'entity').toLowerCase(),
      name: nameStr,
      content: description,
      metadata,
      createdAt: now,
    })
  }

  const edgeType = type === 'clue' ? 'obtained' : type === 'scene' ? 'visited' : type === 'action' ? 'performed' : type === 'npc' ? 'met' : 'related'
  const existingEdge = edges.some(
    (e) => e.source === ROOT_NODE_ID && e.target === nodeId && e.type === edgeType
  )
  if (!existingEdge) {
    edges.push({
      source: ROOT_NODE_ID,
      target: nodeId,
      type: edgeType,
      label: description || '',
      createdAt: now,
    })
  }

  data.updatedAt = now
  data.nodes = nodes
  data.edges = edges
  saveGraph(storyId, sessionId, data)
}

/**
 * Sync user graph from game state (e.g. on load). Ensures graph reflects cluesObtained and currentScene.
 */
export function syncFromState(storyId, sessionId, state) {
  if (!storyId || !sessionId) return
  const { cluesObtained = [], currentScene = '' } = state || {}

  let data = loadGraph(storyId, sessionId)
  if (!data) {
    data = {
      storyId,
      sessionId,
      nodes: [{ id: ROOT_NODE_ID, type: 'investigator', name: '调查员', content: '', createdAt: Date.now() }],
      edges: [],
      createdAt: Date.now(),
    }
  }

  const nodes = data.nodes || []
  const edges = data.edges || []
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const existingTargets = new Set(edges.filter((e) => e.source === ROOT_NODE_ID).map((e) => e.target))
  const now = Date.now()

  for (const clue of cluesObtained) {
    const nameStr = String(clue || '').trim()
    if (!nameStr) continue
    const nodeId = toNodeId('clue', nameStr)
    if (!nodeById.has(nodeId)) {
      nodes.push({ id: nodeId, type: 'clue', name: nameStr, content: '', createdAt: now })
    }
    if (!existingTargets.has(nodeId)) {
      edges.push({ source: ROOT_NODE_ID, target: nodeId, type: 'obtained', label: '', createdAt: now })
      existingTargets.add(nodeId)
    }
  }

  if (currentScene) {
    const nodeId = toNodeId('scene', currentScene)
    if (!nodeById.has(nodeId)) {
      nodes.push({ id: nodeId, type: 'scene', name: currentScene, content: '', createdAt: now })
    }
    if (!existingTargets.has(nodeId)) {
      edges.push({ source: ROOT_NODE_ID, target: nodeId, type: 'visited', label: '', createdAt: now })
      existingTargets.add(nodeId)
    }
  }

  data.nodes = nodes
  data.edges = edges
  data.updatedAt = now
  saveGraph(storyId, sessionId, data)
}

/**
 * Get a text summary of the user graph for memory/context.
 */
export function getSummary(storyId, sessionId) {
  const data = loadGraph(storyId, sessionId)
  if (!data?.nodes?.length) return ''

  const lines = []
  const edges = data.edges || []
  const nodeById = new Map((data.nodes || []).map((n) => [n.id, n]))

  const obtained = edges.filter((e) => e.type === 'obtained').map((e) => nodeById.get(e.target)?.name).filter(Boolean)
  const visited = edges.filter((e) => e.type === 'visited').map((e) => nodeById.get(e.target)?.name).filter(Boolean)
  const performed = edges.filter((e) => e.type === 'performed').map((e) => nodeById.get(e.target)?.name).filter(Boolean)
  const met = edges.filter((e) => e.type === 'met').map((e) => nodeById.get(e.target)?.name).filter(Boolean)

  if (obtained.length) lines.push('已获线索：' + obtained.join('、'))
  if (visited.length) lines.push('到访场景：' + visited.join('、'))
  if (performed.length) lines.push('关键行为：' + performed.join('、'))
  if (met.length) lines.push('接触NPC：' + met.join('、'))

  return lines.join('\n')
}

export function getGraph(storyId, sessionId) {
  return loadGraph(storyId, sessionId)
}

export function deleteUserGraph(storyId, sessionId) {
  const p = graphPath(storyId, sessionId)
  if (fs.existsSync(p)) {
    fs.unlinkSync(p)
    return true
  }
  return false
}
