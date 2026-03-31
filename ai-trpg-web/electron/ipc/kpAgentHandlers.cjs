const { ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { readSettings } = require('./settingsHandlers.cjs')
const { invokeChat, COC_KP_TOOLS } = require('./aiHandlers.cjs')
const { logError, logWarn } = require('../logging.cjs')

let invokeKPAgentPromise = null

async function getInvokeKPAgent() {
  if (!invokeKPAgentPromise) {
    const graphPath = path.join(__dirname, '..', 'agent', 'kpGraph.mjs')
    invokeKPAgentPromise = import(pathToFileURL(graphPath).href).then((m) => m.invokeKPAgent)
  }
  return invokeKPAgentPromise
}

function isIntentClassifierCall(msgs) {
  return Array.isArray(msgs) &&
    msgs.length > 0 &&
    msgs[0]?.role === 'system' &&
    typeof msgs[0]?.content === 'string' &&
    msgs[0].content.includes('只回复一个英文意图关键词')
}

function isForceToolCall(msgs) {
  return Array.isArray(msgs) &&
    msgs.length > 0 &&
    msgs[msgs.length - 1]?.role === 'user' &&
    typeof msgs[msgs.length - 1]?.content === 'string' &&
    msgs[msgs.length - 1].content.includes('请立即调用以下工具')
}

function buildInvokeLLM(pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax) {
  return async (msgs) => {
    const settings = await readSettings()
    const ai = settings?.ai || {}
    const apiKey = (pApiKey && pApiKey !== '***' ? pApiKey : null) || (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined

    const isClassifier = isIntentClassifierCall(msgs)

    const result = await invokeChat({
      provider: pProvider || ai.provider,
      model: pModel || ai.model,
      baseUrl: pBaseUrl || ai.baseUrl,
      apiKey,
      temperature: pTemp ?? ai.temperature,
      maxTokens: isClassifier ? 32 : (pMax ?? ai.maxTokens),
      messages: msgs,
      stream: false,
      tools: isClassifier ? null : COC_KP_TOOLS,
    })
    return result?.toolCalls ? { content: result.content ?? '', toolCalls: result.toolCalls } : (result?.content ?? '')
  }
}

function buildStreamInvokeLLM(pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax, event, streamId) {
  return async (msgs) => {
    const settings = await readSettings()
    const ai = settings?.ai || {}
    const apiKey = (pApiKey && pApiKey !== '***' ? pApiKey : null) || (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined

    const isClassifier = isIntentClassifierCall(msgs)
    const isForceTool = isForceToolCall(msgs)
    const canStream = !isClassifier && !isForceTool

    const result = await invokeChat({
      provider: pProvider || ai.provider,
      model: pModel || ai.model,
      baseUrl: pBaseUrl || ai.baseUrl,
      apiKey,
      temperature: pTemp ?? ai.temperature,
      maxTokens: isClassifier ? 32 : (pMax ?? ai.maxTokens),
      messages: msgs,
      stream: canStream,
      tools: isClassifier ? null : COC_KP_TOOLS,
      onChunk: canStream
        ? (chunk) => event.sender.send('kp:stream', { streamId, type: 'chunk', chunk })
        : undefined,
    })
    return result?.toolCalls ? { content: result.content ?? '', toolCalls: result.toolCalls } : (result?.content ?? '')
  }
}

async function directFallback(msgs, pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax) {
  const settings = await readSettings()
  const ai = settings?.ai || {}
  const apiKey = (pApiKey && pApiKey !== '***' ? pApiKey : null) || (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined
  const result = await invokeChat({
    provider: pProvider || ai.provider,
    model: pModel || ai.model,
    baseUrl: pBaseUrl || ai.baseUrl,
    apiKey,
    temperature: pTemp ?? ai.temperature,
    maxTokens: pMax ?? ai.maxTokens,
    messages: msgs,
    stream: false,
    tools: COC_KP_TOOLS,
  })
  return {
    content: result?.content ?? '',
    toolCalls: result?.toolCalls,
  }
}

function registerKPAgentHandlers() {
  ipcMain.handle('kp:invoke', async (_, params) => {
    const { messages, provider: pProvider, model: pModel, baseUrl: pBaseUrl, apiKey: pApiKey, temperature: pTemp, maxTokens: pMax, storyContext } = params || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return { content: '' }
    }

      try {
        const invokeKPAgent = await getInvokeKPAgent()
        const invokeLLM = buildInvokeLLM(pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax)
        const { content, toolCalls, _traceEvents } = await invokeKPAgent(messages, invokeLLM, storyContext)
        if (content || (toolCalls && toolCalls.length > 0)) {
          return { content, toolCalls, _traceEvents: _traceEvents || [] }
        }
      } catch (err) {
      logError('KP', 'Graph failed in kp:invoke, falling back to direct LLM', { error: err?.message || String(err) })
    }

    try {
      return await directFallback(messages, pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax)
    } catch (err2) {
      logError('KP', 'directFallback in kp:invoke failed', { error: err2?.message || String(err2) })
      return { content: '[KP 回复生成失败: ' + (err2?.message || String(err2)) + ']' }
    }
  })

  ipcMain.handle('kp:invokeStream', async (event, params) => {
    const { messages, provider: pProvider, model: pModel, baseUrl: pBaseUrl, apiKey: pApiKey, temperature: pTemp, maxTokens: pMax, storyContext } = params || {}
    const streamId = 'kp_stream_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
    if (!Array.isArray(messages) || messages.length === 0) {
      event.sender.send('kp:stream', { streamId, type: 'end', content: '', toolCalls: undefined })
      return { streamId }
    }

    ;(async () => {
      let content = ''
      let toolCalls

      let traceEvents = []
      try {
        const invokeKPAgent = await getInvokeKPAgent()
        const invokeLLM = buildStreamInvokeLLM(pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax, event, streamId)
        const result = await invokeKPAgent(messages, invokeLLM, storyContext)
        content = result.content ?? ''
        toolCalls = result.toolCalls
        traceEvents = result._traceEvents || []
      } catch (err) {
        logError('KP', 'Graph failed in kp:invokeStream, falling back to direct LLM', { error: err?.message || String(err) })
        try {
          const fallback = await directFallback(messages, pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax)
          content = fallback.content ?? ''
          toolCalls = fallback.toolCalls
        } catch (err2) {
          logError('KP', 'directFallback in kp:invokeStream failed', { error: err2 instanceof Error ? err2.message : String(err2) })
          event.sender.send('kp:stream', { streamId, type: 'error', error: err2 instanceof Error ? err2.message : String(err2) })
          return
        }
      }

      if (!content && (!toolCalls || toolCalls.length === 0)) {
        try {
          const fallback = await directFallback(messages, pProvider, pModel, pBaseUrl, pApiKey, pTemp, pMax)
          content = fallback.content ?? ''
          toolCalls = fallback.toolCalls
        } catch (_e) { /* use empty content */ }
      }

      if (traceEvents.length > 0) {
        event.sender.send('kp:stream', { streamId, type: 'trace', traceEvents })
      }
      event.sender.send('kp:stream', { streamId, type: 'end', content, toolCalls })
    })()

    return { streamId }
  })
}

module.exports = { registerKPAgentHandlers }
