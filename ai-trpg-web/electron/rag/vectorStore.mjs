/**
 * Pure JS Vector Store — TF-IDF + Cosine Similarity
 *
 * Replaces Python rag-service entirely. No external dependencies.
 * Designed for TRPG script chunks (Chinese + English text).
 *
 * Persistence: one JSON file per scriptId under userData/rag_index/
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                                */
/* ------------------------------------------------------------------ */

function getIndexDir() {
  return path.join(app.getPath('userData'), 'rag_index')
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function indexPath(scriptId) {
  var safe = scriptId.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
  return path.join(getIndexDir(), safe + '.json')
}

function loadIndex(scriptId) {
  var p = indexPath(scriptId)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (_e) {
    return null
  }
}

function saveIndex(scriptId, data) {
  ensureDir(getIndexDir())
  fs.writeFileSync(indexPath(scriptId), JSON.stringify(data), 'utf-8')
}

function deleteIndexFile(scriptId) {
  var p = indexPath(scriptId)
  if (fs.existsSync(p)) {
    fs.unlinkSync(p)
    return true
  }
  return false
}

/* ------------------------------------------------------------------ */
/*  Tokenization: character n-grams for Chinese + word tokens          */
/* ------------------------------------------------------------------ */

var STOP_CHARS = new Set('，。！？、；：\u201C\u201D\u2018\u2019【】（）《》「」\n\r\t .,!?;:()[]{}\"\'/\\|-_=+*&#@%^~`')

function tokenize(text) {
  var tokens = new Map()
  function inc(t) { tokens.set(t, (tokens.get(t) || 0) + 1) }

  var chars = []
  for (var ci = 0; ci < text.length; ci++) {
    var ch = text[ci]
    if (!STOP_CHARS.has(ch)) chars.push(ch.toLowerCase())
  }

  for (var i = 0; i < chars.length; i++) {
    var c = chars[i]
    inc(c)
    if (i + 1 < chars.length) inc(c + chars[i + 1])
    if (i + 2 < chars.length) inc(c + chars[i + 1] + chars[i + 2])
  }

  var words = text.toLowerCase().match(/[a-z]{2,}/g)
  if (words) {
    for (var wi = 0; wi < words.length; wi++) inc(words[wi])
  }

  return tokens
}

/* ------------------------------------------------------------------ */
/*  TF-IDF computation                                                 */
/* ------------------------------------------------------------------ */

function buildIdfFromDocs(docs) {
  var N = docs.length
  var df = new Map()
  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di]
    var seen = new Set()
    var tfEntries = Array.from(doc.tf.entries())
    for (var ti = 0; ti < tfEntries.length; ti++) {
      var term = tfEntries[ti][0]
      if (!seen.has(term)) {
        df.set(term, (df.get(term) || 0) + 1)
        seen.add(term)
      }
    }
  }
  var idf = new Map()
  var dfEntries = Array.from(df.entries())
  for (var ii = 0; ii < dfEntries.length; ii++) {
    var t = dfEntries[ii][0]
    var count = dfEntries[ii][1]
    idf.set(t, Math.log((N + 1) / (count + 1)) + 1)
  }
  return idf
}

function tfidfVector(tf, idf) {
  var vec = new Map()
  var norm = 0
  var entries = Array.from(tf.entries())
  for (var i = 0; i < entries.length; i++) {
    var term = entries[i][0]
    var freq = entries[i][1]
    var w = freq * (idf.get(term) || 1)
    vec.set(term, w)
    norm += w * w
  }
  norm = Math.sqrt(norm) || 1
  var vecEntries = Array.from(vec.entries())
  for (var j = 0; j < vecEntries.length; j++) {
    vec.set(vecEntries[j][0], vecEntries[j][1] / norm)
  }
  return vec
}

function cosineSimilarity(a, b) {
  var dot = 0
  var entries = Array.from(a.entries())
  for (var i = 0; i < entries.length; i++) {
    var wB = b.get(entries[i][0])
    if (wB !== undefined) dot += entries[i][1] * wB
  }
  return dot
}

/* ------------------------------------------------------------------ */
/*  In-memory index (per-script)                                       */
/* ------------------------------------------------------------------ */

var memoryCache = new Map()

function getOrLoadIndex(scriptId) {
  if (memoryCache.has(scriptId)) return memoryCache.get(scriptId)
  var saved = loadIndex(scriptId)
  if (saved) {
    for (var i = 0; i < saved.docs.length; i++) {
      saved.docs[i].tf = new Map(saved.docs[i].tf)
      saved.docs[i].tfidf = new Map(saved.docs[i].tfidf)
    }
    saved.idf = new Map(saved.idf)
    memoryCache.set(scriptId, saved)
    return saved
  }
  return null
}

function serializeIndex(idx) {
  return {
    scriptId: idx.scriptId,
    storyName: idx.storyName,
    indexedAt: idx.indexedAt,
    chunkCount: idx.chunkCount,
    docs: idx.docs.map(function (d) {
      return {
        id: d.id,
        content: d.content,
        type: d.type,
        metadata: d.metadata,
        tf: Array.from(d.tf.entries()),
        tfidf: Array.from(d.tfidf.entries()),
      }
    }),
    idf: Array.from(idx.idf.entries()),
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Index a batch of chunks for a story/script.
 */
export function indexChunks(storyId, chunks, storyMeta) {
  if (!chunks || !chunks.length) return { ok: true, indexed: 0 }

  var docs = chunks.map(function (c) {
    var tf = tokenize(c.content || '')
    return {
      id: c.id,
      content: c.content,
      type: c.type || 'unknown',
      metadata: normalizeMetadata(c.metadata || {}, storyId),
      tf: tf,
      tfidf: new Map(),
    }
  })

  var idf = buildIdfFromDocs(docs)
  for (var i = 0; i < docs.length; i++) {
    docs[i].tfidf = tfidfVector(docs[i].tf, idf)
  }

  var storyName = (storyMeta && storyMeta.name) ? storyMeta.name : storyId
  var idx = {
    scriptId: storyId,
    storyName: storyName,
    indexedAt: Date.now(),
    chunkCount: docs.length,
    docs: docs,
    idf: idf,
  }
  memoryCache.set(storyId, idx)
  saveIndex(storyId, serializeIndex(idx))

  return { ok: true, indexed: docs.length }
}

/**
 * List all indexed stories (reads metadata only).
 */
export function listIndexedStories() {
  var dir = getIndexDir()
  if (!fs.existsSync(dir)) return []
  var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json') })
  var results = []
  for (var i = 0; i < files.length; i++) {
    try {
      var raw = fs.readFileSync(path.join(dir, files[i]), 'utf-8')
      var data = JSON.parse(raw)
      var docsLen = (data.docs && data.docs.length) ? data.docs.length : 0
      results.push({
        storyId: data.scriptId || files[i].replace(/\.json$/, ''),
        name: data.storyName || data.scriptId || files[i].replace(/\.json$/, ''),
        chunkCount: docsLen,
        indexedAt: data.indexedAt || 0,
      })
    } catch (_e) { /* skip corrupt files */ }
  }
  return results
}

/**
 * Get a story overview: retrieves the top chunks for general story context.
 */
export function getStoryOverview(storyId, topK) {
  if (topK === undefined) topK = 15
  var idx = getOrLoadIndex(storyId)
  if (!idx || !idx.docs.length) return { overview: '', storyName: storyId }

  var limit = Math.min(topK, idx.docs.length)
  var chunks = idx.docs.slice(0, limit)
  var lines = []
  for (var i = 0; i < chunks.length; i++) {
    var label = chunks[i].type || 'info'
    lines.push('[' + label + '] ' + chunks[i].content)
  }
  return { overview: lines.join('\n\n'), storyName: idx.storyName || storyId }
}

/**
 * Delete all chunks for a script.
 */
export function deleteChunks(scriptId) {
  var idx = getOrLoadIndex(scriptId)
  var count = (idx && idx.docs && idx.docs.length) ? idx.docs.length : 0
  memoryCache.delete(scriptId)
  deleteIndexFile(scriptId)
  return { ok: true, deleted: count }
}

/**
 * Query for the top-K most relevant chunks.
 */
export function queryChunks(params) {
  var query = params.query
  var scriptId = params.scriptId
  var sceneId = params.sceneId
  var type = params.type
  var topK = params.topK || 5

  if (!scriptId) return { chunks: [] }
  var idx = getOrLoadIndex(scriptId)
  if (!idx || !idx.docs.length) return { chunks: [] }

  var queryTf = tokenize(query || '')
  var queryVec = tfidfVector(queryTf, idx.idf)

  var candidates = idx.docs
  if (sceneId) {
    candidates = candidates.filter(function (d) {
      var meta = d.metadata || {}
      return meta.scene_id === sceneId || meta.sceneId === sceneId
    })
  }
  if (type) {
    candidates = candidates.filter(function (d) { return d.type === type })
  }
  if (candidates.length === 0) candidates = idx.docs

  var scored = candidates.map(function (doc) {
    return {
      content: doc.content,
      metadata: doc.metadata,
      distance: 1 - cosineSimilarity(queryVec, doc.tfidf),
    }
  })

  scored.sort(function (a, b) { return a.distance - b.distance })
  return { chunks: scored.slice(0, topK) }
}

/**
 * Build a formatted context string for the LLM prompt.
 */
export function buildContext(params) {
  var query = params.query
  var scriptId = params.scriptId
  var sceneId = params.sceneId
  var topK = params.topK || 5

  var result = queryChunks({ query: query, scriptId: scriptId, sceneId: sceneId, topK: topK })
  var chunks = result.chunks
  if (!chunks.length) return { context: '' }

  var lines = ['## 剧本相关情报']
  for (var i = 0; i < chunks.length; i++) {
    var meta = chunks[i].metadata || {}
    var t = meta.type || 'info'
    lines.push('### [' + (i + 1) + '] ' + t)
    lines.push(chunks[i].content)
    lines.push('')
  }
  return { context: lines.join('\n') }
}

/**
 * Health check - always available since this is in-process.
 */
export function checkHealth() {
  return { status: 'ok', service: 'rag-embedded' }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeMetadata(meta, scriptId) {
  var out = {}
  var keys = Object.keys(meta)
  for (var i = 0; i < keys.length; i++) {
    out[keys[i]] = meta[keys[i]]
  }
  if (meta.scriptId) { out.script_id = meta.scriptId; delete out.scriptId }
  if (meta.sceneId) { out.scene_id = meta.sceneId; delete out.sceneId }
  if (meta.npcId) { out.npc_id = meta.npcId; delete out.npcId }
  if (!out.script_id) out.script_id = scriptId
  return out
}
