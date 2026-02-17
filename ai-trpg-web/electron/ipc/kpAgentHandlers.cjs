const { ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { readSettings } = require('./settingsHandlers.cjs')
const { invokeChat, COC_KP_TOOLS } = require('./aiHandlers.cjs')

let invokeKPAgentPromise = null

async function getInvokeKPAgent() {
  if (!invokeKPAgentPromise) {
    const graphPath = path.join(__dirname, '..', 'agent', 'kpGraph.mjs')
    invokeKPAgentPromise = import(pathToFileURL(graphPath).href).then((m) => m.invokeKPAgent)
  }
  return invokeKPAgentPromise
}

function registerKPAgentHandlers() {
  ipcMain.handle('kp:invoke', async (_, params) => {
    const { messages, provider: pProvider, model: pModel, baseUrl: pBaseUrl, apiKey: pApiKey, temperature: pTemp, maxTokens: pMax } = params || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return { content: '' }
    }
    const invokeKPAgent = await getInvokeKPAgent()
    const invokeLLM = async (msgs) => {
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
      return result?.toolCalls ? { content: result.content ?? '', toolCalls: result.toolCalls } : (result?.content ?? '')
    }
    const { content, toolCalls } = await invokeKPAgent(messages, invokeLLM)
    return { content, toolCalls }
  })

  // Streaming version: emits chunks over IPC while generating
  ipcMain.handle('kp:invokeStream', async (event, params) => {
    const { messages, provider: pProvider, model: pModel, baseUrl: pBaseUrl, apiKey: pApiKey, temperature: pTemp, maxTokens: pMax } = params || {}
    const streamId = 'kp_stream_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
    if (!Array.isArray(messages) || messages.length === 0) {
      event.sender.send('kp:stream', { streamId, type: 'end', content: '', toolCalls: undefined })
      return { streamId }
    }

    ;(async () => {
      try {
        const invokeKPAgent = await getInvokeKPAgent()
        const invokeLLM = async (msgs) => {
          const settings = await readSettings()
          const ai = settings?.ai || {}
          const apiKey = (pApiKey && pApiKey !== '***' ? pApiKey : null) || (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined

          const isIntentClassifier = Array.isArray(msgs) &&
            msgs[0]?.role === 'system' &&
            typeof msgs[0]?.content === 'string' &&
            msgs[0].content.includes('只回复一个英文意图关键词')

          const provider = pProvider || ai.provider
          const stream = !isIntentClassifier && (provider === 'vllm' || provider === 'openai' || provider === 'openrouter')

          const result = await invokeChat({
            provider,
            model: pModel || ai.model,
            baseUrl: pBaseUrl || ai.baseUrl,
            apiKey,
            temperature: pTemp ?? ai.temperature,
            maxTokens: pMax ?? ai.maxTokens,
            messages: msgs,
            stream,
            tools: COC_KP_TOOLS,
            onChunk: stream
              ? (chunk) => event.sender.send('kp:stream', { streamId, type: 'chunk', chunk })
              : undefined,
          })
          return result?.toolCalls ? { content: result.content ?? '', toolCalls: result.toolCalls } : (result?.content ?? '')
        }

        const { content, toolCalls } = await invokeKPAgent(messages, invokeLLM)
        event.sender.send('kp:stream', { streamId, type: 'end', content: content ?? '', toolCalls })
      } catch (err) {
        event.sender.send('kp:stream', { streamId, type: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })()

    return { streamId }
  })
}

module.exports = { registerKPAgentHandlers }
