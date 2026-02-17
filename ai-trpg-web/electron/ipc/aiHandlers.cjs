const { ipcMain } = require('electron')
const OpenAI = require('openai')
const { readSettings } = require('./settingsHandlers.cjs')

const API_KEY_PLACEHOLDER = '***'

const COC_KP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'adjust_hp',
      description: 'Adjust player HP when they take damage or heal. Use negative delta for damage, positive for healing.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'Change amount (e.g. -3 for 3 damage)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_san',
      description: 'Adjust player SAN (sanity) when they lose or recover sanity. Use negative delta for sanity loss, positive for recovery.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'Change amount (e.g. -1d3 for sanity loss)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_mp',
      description: 'Adjust player MP when they use or recover magic points.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'Change amount (negative for spending)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll dice to get a random result. Call this every time you need to resolve a dice roll (e.g. d100 skill check, d6 damage). Each call returns a new independent result.',
      parameters: {
        type: 'object',
        properties: {
          sides: { type: 'integer', description: 'Number of sides (e.g. 100 for d100, 6 for d6). Default 100 for COC.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transition_scene',
      description: 'Transition to a new scene when the player moves to a different location or the story progresses. Use this when the player enters a new area, completes an objective, or when a scene change is narratively appropriate.',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: 'The scene ID from the script (e.g. "scene_001", "scene_002")' },
        },
        required: ['sceneId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grant_clue',
      description: 'Grant a clue to the player when they discover or learn something important. Use this when the player successfully investigates, finds evidence, or learns key information that advances the investigation.',
      parameters: {
        type: 'object',
        properties: {
          clueId: { type: 'string', description: 'The clue ID from the script (e.g. "clue_001", "clue_002")' },
        },
        required: ['clueId'],
      },
    },
  },
]

async function doOpenAICompat(config, messages, stream, temp, maxTokens, tools = null) {
  const model = config.model
  if (!model) throw new Error('请先在设置中刷新模型列表并选择模型')
  const client = new OpenAI({
    baseURL: config.baseUrl?.replace(/\/$/, '') || 'http://localhost:8000/v1',
    apiKey: config.apiKey || 'not-needed',
  })
  const opts = {
    model,
    messages,
    temperature: temp ?? 0.7,
    max_tokens: maxTokens ?? 2048,
    stream: !!stream,
  }
  if (tools && tools.length > 0) {
    opts.tools = tools
    opts.tool_choice = 'auto'
  }
  const res = await client.chat.completions.create(opts)
  return res
}

/** Convert OpenAI-format messages to Ollama format (tool_name instead of tool_call_id) */
function toOllamaMessages(messages, toolCallIdToName = new Map()) {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const toolCalls = m.tool_calls.map((tc, idx) => ({
        type: 'function',
        function: {
          index: idx,
          name: tc.function?.name ?? '',
          arguments: typeof tc.function?.arguments === 'string'
            ? (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
            : (tc.function?.arguments ?? {}),
        },
      }))
      return { role: 'assistant', content: m.content ?? '', tool_calls: toolCalls }
    }
    if (m.role === 'tool') {
      const name = toolCallIdToName.get(m.tool_call_id) ?? m.tool_call_id
      return { role: 'tool', tool_name: name, content: m.content ?? '' }
    }
    return { role: m.role, content: m.content ?? '' }
  })
}

/** Build tool_call_id -> name map from assistant message */
function buildToolCallIdMap(messages) {
  const map = new Map()
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        if (tc.id && tc.function?.name) map.set(tc.id, tc.function.name)
      }
    }
  }
  return map
}

async function doOllama(config, messages, stream, temp, maxTokens, tools = null) {
  const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'http://localhost:11434'
  const model = config.model
  if (!model) throw new Error('请先在设置中刷新模型列表并选择模型')
  const toolCallIdMap = buildToolCallIdMap(messages)
  const ollamaMessages = toOllamaMessages(messages, toolCallIdMap)
  const body = {
    model,
    messages: ollamaMessages,
    stream: !!stream,
  }
  if (tools && tools.length > 0) body.tools = tools
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Ollama: ${res.status} ${await res.text()}`)
  return res
}

/** Convert COC_KP_TOOLS to Gemini functionDeclarations format */
function toGeminiTools(openaiTools) {
  if (!openaiTools?.length) return null
  const declarations = openaiTools.map((t) => {
    const fn = t.function
    if (!fn) return null
    const params = fn.parameters ?? { type: 'object', properties: {}, required: [] }
    const geminiParams = {
      type: 'OBJECT',
      properties: {},
      required: params.required ?? [],
    }
    for (const [k, v] of Object.entries(params.properties ?? {})) {
      geminiParams.properties[k] = {
        type: (v.type ?? 'string').toUpperCase(),
        description: v.description ?? '',
      }
    }
    return {
      name: fn.name,
      description: fn.description ?? '',
      parameters: geminiParams,
    }
  }).filter(Boolean)
  return declarations.length ? [{ functionDeclarations: declarations }] : null
}

async function doGoogle(config, messages, stream, temp, maxTokens, tools = null) {
  const apiKey = config.apiKey
  if (!apiKey) throw new Error('Google API requires apiKey')
  let model = (config.model || '').trim()
  if (!model) throw new Error('请先在设置中刷新模型列表并选择模型')
  model = model.replace(/^models\//, '')
  const systemMsg = messages.find((m) => m.role === 'system')
  const other = messages.filter((m) => m.role !== 'system')
  const contents = []
  let pendingToolNames = []
  for (const m of other) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      pendingToolNames = m.tool_calls.map((tc) => tc.function?.name ?? '')
      for (const tc of m.tool_calls) {
        contents.push({
          role: 'model',
          parts: [{
            functionCall: {
              name: tc.function?.name ?? '',
              args: typeof tc.function?.arguments === 'string'
                ? (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
                : (tc.function?.arguments ?? {}),
            },
          }],
        })
      }
      if (m.content) {
        contents.push({ role: 'model', parts: [{ text: m.content }] })
      }
    } else if (m.role === 'tool') {
      const name = pendingToolNames.shift() ?? 'unknown'
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name,
            response: { content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') },
          },
        }],
      })
    } else if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content ?? '' }] })
      pendingToolNames = []
    } else if (m.role === 'assistant' && m.content && !m.tool_calls?.length) {
      contents.push({ role: 'model', parts: [{ text: m.content }] })
      pendingToolNames = []
    }
  }
  const body = {
    contents,
    generationConfig: {
      temperature: temp ?? 0.7,
      maxOutputTokens: maxTokens ?? 2048,
    },
  }
  if (systemMsg?.content) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }
  const geminiTools = toGeminiTools(tools)
  if (geminiTools) body.tools = geminiTools
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent${stream ? 'Stream' : ''}?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    const msg = res.status === 404
      ? `Google: 404 模型不存在或已下线，请到设置中刷新模型列表并重新选择 (当前: ${model})`
      : `Google: ${res.status} ${text}`
    throw new Error(msg)
  }
  return res
}

async function invokeChat(params) {
  const { provider, model, baseUrl, apiKey: paramApiKey, messages, temperature, maxTokens, stream } = params
  const onChunk = typeof params.onChunk === 'function' ? params.onChunk : null
  const settings = await readSettings()
  const ai = settings?.ai || {}
  const apiKey = (paramApiKey && paramApiKey !== API_KEY_PLACEHOLDER ? paramApiKey : null) ||
    (ai.apiKey && ai.apiKey !== API_KEY_PLACEHOLDER ? ai.apiKey : null) || undefined

  const config = {
    provider: provider || ai.provider,
    model: model || ai.model,
    baseUrl: baseUrl || ai.baseUrl,
    apiKey,
    temperature: temperature ?? ai.temperature ?? 0.7,
    maxTokens: maxTokens ?? ai.maxTokens ?? 2048,
  }

  const p = config.provider
  if (!p) throw new Error('请先在设置中配置 AI Provider 并选择模型')
  const temp = config.temperature
  const max = config.maxTokens
  if (p === 'openai') config.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
  if (p === 'openrouter') config.baseUrl = 'https://openrouter.ai/api/v1'

  if (p === 'vllm' || p === 'openai' || p === 'openrouter') {
    const res = await doOpenAICompat(config, messages, stream, temp, max, params.tools)
    if (stream) {
      const chunks = []
      let fullText = ''
      // OpenAI streaming tool_calls are delivered in delta.tool_calls
      const toolCallsByIndex = new Map()
      for await (const chunk of res) {
        const choice = chunk.choices?.[0]
        const delta = choice?.delta?.content
        if (delta) {
          fullText += delta
          if (onChunk) onChunk(delta)
          else chunks.push(delta)
        }
        const tcs = choice?.delta?.tool_calls
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const idx = tc.index ?? 0
            const prev = toolCallsByIndex.get(idx) ?? { id: tc.id, name: '', arguments: '' }
            const next = {
              id: tc.id ?? prev.id,
              name: tc.function?.name ?? prev.name,
              arguments: (prev.arguments ?? '') + (tc.function?.arguments ?? ''),
            }
            toolCallsByIndex.set(idx, next)
          }
        }
      }
      // If caller supplied onChunk, return final assembled result instead of chunks
      if (onChunk) {
        const toolCalls = [...toolCallsByIndex.values()].map((tc, idx) => ({
          id: tc.id ?? `openai_tc_${idx}`,
          name: tc.name ?? '',
          arguments: tc.arguments?.trim() ? tc.arguments : '{}',
        }))
        return {
          stream: false,
          content: fullText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        }
      }
      return { stream: true, chunks }
    }
    const msg = res.choices?.[0]?.message ?? {}
    const text = msg.content ?? ''
    const toolCalls = msg.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '{}',
    })) ?? []
    return { stream: false, content: text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined }
  }

  if (p === 'ollama') {
    const res = await doOllama(config, messages, stream, temp, max, params.tools)
    if (stream) {
      const chunks = []
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const obj = JSON.parse(line.slice(6))
              const c = obj.message?.content
              if (c) chunks.push(c)
            } catch {}
          }
        }
      }
      return { stream: true, chunks }
    }
    const data = await res.json()
    const msg = data.message ?? {}
    const text = msg.content ?? ''
    const rawToolCalls = msg.tool_calls ?? []
    const toolCalls = rawToolCalls.map((tc, idx) => ({
      id: tc.id ?? `ollama_tc_${idx}`,
      name: tc.function?.name ?? '',
      arguments: typeof tc.function?.arguments === 'object'
        ? JSON.stringify(tc.function.arguments ?? {})
        : (tc.function?.arguments ?? '{}'),
    }))
    return {
      stream: false,
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  }

  if (p === 'google') {
    const res = await doGoogle(config, messages, stream, temp, max, params.tools)
    if (stream) {
      const chunks = []
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const obj = JSON.parse(line.slice(6))
              const text = obj.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) chunks.push(text)
            } catch {}
          }
        }
      }
      return { stream: true, chunks }
    }
    const data = await res.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    let text = ''
    const geminiToolCalls = []
    for (const part of parts) {
      if (part.text) text += part.text
      if (part.functionCall) {
        geminiToolCalls.push({
          id: `gemini_tc_${geminiToolCalls.length}`,
          name: part.functionCall.name ?? '',
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        })
      }
    }
    return {
      stream: false,
      content: text,
      toolCalls: geminiToolCalls.length > 0 ? geminiToolCalls : undefined,
    }
  }

  throw new Error(`Unknown provider: ${p}`)
}

function registerAIHandlers() {
  ipcMain.handle('ai:chat', async (_, params) => invokeChat(params))

  ipcMain.handle('ai:listModels', async (_, params) => {
    const { provider, baseUrl: paramBaseUrl, apiKey: paramApiKey } = params || {}
    const settings = await readSettings()
    const ai = settings?.ai || {}
    const apiKey = (paramApiKey && paramApiKey !== '***' ? paramApiKey : null) ||
      (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined
    let url = paramBaseUrl || ai.baseUrl
    if (provider === 'ollama' && (!url || String(url).includes('/v1'))) {
      url = 'http://localhost:11434'
    }
    if (provider === 'vllm' && (!url || String(url).includes(':11434'))) {
      url = 'http://localhost:8000/v1'
    }

    if (provider === 'openrouter' || provider === 'google' || provider === 'openai') {
      if (!apiKey) return []
      try {
        if (provider === 'openrouter') {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (!res.ok) return []
          const data = await res.json()
          const models = (data.data || []).map((m) => ({ value: m.id, label: m.name || m.id })).slice(0, 80)
          return models
        }
        if (provider === 'google') {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
          )
          if (!res.ok) return []
          const data = await res.json()
          const models = (data.models || [])
            .filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m) => {
              const id = (m.name || '').replace('models/', '') || m.name || ''
              return { value: id, label: m.displayName || id }
            })
          return models
        }
        if (provider === 'openai') {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (!res.ok) return []
          const data = await res.json()
          const models = (data.data || []).filter((m) => m.id).map((m) => ({ value: m.id, label: m.id })).slice(0, 80)
          return models
        }
      } catch {
        return []
      }
    }

    if (provider === 'ollama') {
      try {
        const base = (url || 'http://localhost:11434').replace(/\/$/, '')
        const res = await fetch(`${base}/api/tags`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.models || []).map((m) => ({ value: m.name, label: m.name }))
      } catch {
        return []
      }
    }

    if (provider === 'vllm') {
      try {
        const base = (url || 'http://localhost:8000/v1').replace(/\/v1\/?$/, '')
        const res = await fetch(`${base}/v1/models`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []).map((m) => ({ value: m.id, label: m.id }))
      } catch {
        return []
      }
    }

    return []
  })
}

module.exports = { registerAIHandlers, invokeChat, COC_KP_TOOLS }
