const { ipcMain } = require('electron')
const path = require('path')
const OpenAI = require('openai')
const { readSettings } = require('./settingsHandlers.cjs')
const { logWarn } = require('../logging.cjs')

const API_KEY_PLACEHOLDER = '***'

/* ═══════════════════ COC KP Tool Definitions ═══════════════════ */

const COC_KP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'skill_check',
      description: 'Perform a COC 7th skill check. Rolls d100 against the skill value at the given difficulty. Returns the roll, threshold, and result (critical_success/extreme_success/hard_success/regular_success/failure/fumble). Use for perception, social, non-combat checks. For combat attack vs dodge/fight back use opposed_check instead. Optional: bonusDice/penaltyDice (0-2), isPush for 孤注一掷 (one retry after failure, cannot use for Luck/SAN/combat).',
      parameters: {
        type: 'object',
        properties: {
          skillName: { type: 'string', description: 'Name of the skill being checked (e.g. "侦查", "格斗", "说服")' },
          skillValue: { type: 'integer', description: 'The investigator\'s skill value (0-99)' },
          difficulty: { type: 'string', enum: ['regular', 'hard', 'extreme'], description: 'Difficulty level. regular=skill value, hard=skill/2, extreme=skill/5' },
          bonusDice: { type: 'integer', description: 'Number of bonus dice (0-2). Lower tens digit is used. Cancels with penaltyDice.' },
          penaltyDice: { type: 'integer', description: 'Number of penalty dice (0-2). Higher tens digit is used. Cancels with bonusDice.' },
          isPush: { type: 'boolean', description: 'True if this is a 孤注一掷 (pushing roll) after a failed check. Not allowed for Luck, SAN, or combat checks.' },
        },
        required: ['skillName', 'skillValue', 'difficulty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'opposed_check',
      description: 'COC 7th opposed roll. Both sides roll d100; compare success levels (critical_success > extreme > hard > regular > failure > fumble). Tie in level: higher skill value wins. Still tie: use tieBreaker. Optional: sideABonusDice/sideAPenaltyDice, sideBBonusDice/sideBPenaltyDice (0-2 each) for 以多打少 etc. Use for melee combat (attacker vs defender: 反击 = tieBreaker attacker, 闪避 = tieBreaker defender), social contests, etc.',
      parameters: {
        type: 'object',
        properties: {
          sideAName: { type: 'string', description: 'Name of side A (e.g. "调查员格斗")' },
          sideAValue: { type: 'integer', description: 'Skill value of side A (0-99)' },
          sideBName: { type: 'string', description: 'Name of side B (e.g. "NPC闪避")' },
          sideBValue: { type: 'integer', description: 'Skill value of side B (0-99)' },
          tieBreaker: { type: 'string', enum: ['attacker', 'defender'], description: 'If both same success level and same skill value: attacker = side A wins; defender = side B wins. Use attacker for 反击, defender for 闪避.' },
          sideABonusDice: { type: 'integer', description: 'Bonus dice for side A (0-2). Cancels with sideAPenaltyDice.' },
          sideAPenaltyDice: { type: 'integer', description: 'Penalty dice for side A (0-2).' },
          sideBBonusDice: { type: 'integer', description: 'Bonus dice for side B (0-2).' },
          sideBPenaltyDice: { type: 'integer', description: 'Penalty dice for side B (0-2).' },
        },
        required: ['sideAName', 'sideAValue', 'sideBName', 'sideBValue', 'tieBreaker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'san_check',
      description: 'Perform a COC 7th sanity check. Rolls d100 against current SAN value, then rolls the appropriate loss. Returns the roll, whether it passed, and the SAN lost. Call this when the investigator encounters something horrifying or supernatural.',
      parameters: {
        type: 'object',
        properties: {
          currentSan: { type: 'integer', description: 'Investigator\'s current SAN value' },
          successLoss: { type: 'string', description: 'SAN loss on success (e.g. "0", "1", "1d3")' },
          failureLoss: { type: 'string', description: 'SAN loss on failure (e.g. "1d6", "2d6", "1d10")' },
        },
        required: ['currentSan', 'successLoss', 'failureLoss'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll dice to get a random result. Use for damage rolls, random events, etc. For skill checks, prefer skill_check tool instead. Each call returns a new independent random number.',
      parameters: {
        type: 'object',
        properties: {
          sides: { type: 'integer', description: 'Number of sides (e.g. 6 for d6 damage, 10 for d10). Default 100.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_hp',
      description: 'Adjust investigator HP. Use negative delta for damage (after armor), positive for healing.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'HP change (e.g. -3 for 3 damage, +2 for healing)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'first_aid',
      description:
        'Apply COC 7th First Aid effect after a successful 急救检定. If the investigator is dying and wounded, restores 1 HP (not above hpMax) and stabilises them from dying to major wound.',
      parameters: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description:
              'Whether the First Aid skill check succeeded. If false, HP and dying state do not change (only narrative message). Default true.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_san',
      description: 'Adjust investigator SAN after a san_check result. Use the loss value returned by san_check as negative delta.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'SAN change (e.g. -4 for 4 sanity loss)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_mp',
      description: 'Adjust investigator MP when they cast spells or recover magic points.',
      parameters: {
        type: 'object',
        properties: { delta: { type: 'integer', description: 'MP change (negative for spending)' } },
        required: ['delta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'medicine',
      description:
        'Apply COC 7th Medicine effect after a successful 医学检定 under proper medical care. On success heals 1D3 HP (not above hpMax).',
      parameters: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Whether the Medicine skill check succeeded. If false, HP does not change.',
          },
          healExpr: {
            type: 'string',
            description: 'Healing dice expression, default "1d3".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spend_luck',
      description: 'Spend Luck points (1:1) to reduce a d100 roll result after a skill/attribute check. Cannot be used for Luck check, SAN check, or damage rolls. Cannot change critical/fumble. Call after skill_check when player chooses to spend Luck; pass amount spent. Returns new Luck value.',
      parameters: {
        type: 'object',
        properties: { amount: { type: 'integer', description: 'Luck points to spend (positive integer)' } },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transition_scene',
      description: 'Record a scene transition when the investigator moves to a new location mentioned in the story. Use the scene/location name from the story text.',
      parameters: {
        type: 'object',
        properties: {
          sceneName: { type: 'string', description: 'The name of the scene/location (e.g. "昏暗的酒吧", "图书馆二楼")' },
        },
        required: ['sceneName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grant_clue',
      description: 'Grant a clue to the investigator when they discover important information. Use for obvious clues (no check needed) or after a successful investigation. Describe the clue in natural language.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Natural language description of the clue (e.g. "日记本中记载了1923年的神秘仪式")' },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_game',
      description: 'End the scenario and transition the UI to an ending summary screen. Call when the story reaches a clear conclusion (victory/defeat/partial). Must provide a concise but complete ending summary and outcome.',
      parameters: {
        type: 'object',
        properties: {
          outcome: { type: 'string', enum: ['victory', 'defeat', 'partial', 'survival', 'unknown'], description: 'Ending outcome type' },
          title: { type: 'string', description: 'Ending title' },
          summary: { type: 'string', description: 'Ending summary (500-900 Chinese chars recommended)' },
          epilogueOptions: { type: 'array', items: { type: 'string' }, description: 'Optional epilogue / follow-up options' },
          keyFacts: { type: 'array', items: { type: 'string' }, description: 'Optional key facts / truths revealed' },
          keyTurnIds: { type: 'array', items: { type: 'string' }, description: 'Optional key turn ids for replay' },
        },
        required: ['outcome', 'title', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_insanity',
      description: 'After SAN loss (e.g. from san_check), evaluate insanity: permanent if SAN dropped to 0; indefinite if daily SAN loss >= 1/5 of current SAN; if single loss >= 5, INT check—success = temporary insanity (roll bout), failure = 压抑. For temporary/indefinite, 1D10 bout table: 9 = add phobia, 10 = add mania. Call after san_check when SAN was lost.',
      parameters: {
        type: 'object',
        properties: {
          sanLost: { type: 'integer', description: 'SAN just lost in this event' },
          intValue: { type: 'integer', description: 'Investigator INT value for temporary insanity check (when single loss >= 5)' },
        },
        required: ['sanLost', 'intValue'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_major_wound',
      description: 'Apply major wound and dying rules. If damageDealt > hpMax then instant death (立即死亡). Else if damageDealt >= hpMax/2 then major wound (CON check for unconscious). If hpAfter <= 0 and (major wound or instant death) then investigator is dying. Call after damage is applied (adjust_hp).',
      parameters: {
        type: 'object',
        properties: {
          hpMax: { type: 'integer', description: 'Investigator max HP' },
          damageDealt: { type: 'integer', description: 'Damage dealt in this hit (before armor)' },
          hpAfter: { type: 'integer', description: 'HP after this damage (current HP)' },
        },
        required: ['hpMax', 'damageDealt', 'hpAfter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reset_day',
      description: 'Start a new game day: reset daily SAN loss counter to 0. Call when the investigator rests overnight or when you narrate that a new day has begun. Required for correct 不定性疯狂 (indefinite insanity) triggering on the next day.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'melee_attack',
      description: 'COC 7th melee: opposed check (attacker A vs defender B), then winner deals damage (weapon dice + damage bonus - loser armor). If investigator is the loser, HP and major wound/dying are applied automatically. Use instead of separate opposed_check + roll_dice + adjust_hp + apply_major_wound.',
      parameters: {
        type: 'object',
        properties: {
          sideAName: { type: 'string', description: 'Attacker name (e.g. 调查员格斗)' },
          sideAValue: { type: 'integer', description: 'Attacker skill value (0-99)' },
          sideBName: { type: 'string', description: 'Defender name (e.g. NPC闪避)' },
          sideBValue: { type: 'integer', description: 'Defender skill value (0-99)' },
          tieBreaker: { type: 'string', enum: ['attacker', 'defender'], description: 'attacker = 反击 (A wins tie), defender = 闪避 (B wins tie)' },
          damageExpr: { type: 'string', description: 'Weapon damage dice (e.g. "1d6", "1d8")' },
          attackerDamageBonus: { type: 'string', description: 'Side A damage bonus (e.g. "0", "+1D4")' },
          defenderDamageBonus: { type: 'string', description: 'Side B damage bonus' },
          attackerArmor: { type: 'integer', description: 'Side A armor (damage reduction)' },
          defenderArmor: { type: 'integer', description: 'Side B armor' },
          investigatorSide: { type: 'string', enum: ['A', 'B', 'none'], description: 'Which side is the investigator (A, B, or none for NPC vs NPC)' },
          sideABonusDice: { type: 'integer', description: 'Optional bonus/penalty dice for A (0-2)' },
          sideAPenaltyDice: { type: 'integer' },
          sideBBonusDice: { type: 'integer' },
          sideBPenaltyDice: { type: 'integer' },
        },
        required: ['sideAName', 'sideAValue', 'sideBName', 'sideBValue', 'tieBreaker', 'damageExpr', 'investigatorSide'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ranged_attack',
      description: 'COC 7th ranged: skill check to hit (e.g. 手枪), then on success roll damage and subtract target armor. If targetIsInvestigator, HP and major wound/dying are applied automatically.',
      parameters: {
        type: 'object',
        properties: {
          skillName: { type: 'string', description: 'Ranged skill name (e.g. 手枪, 步枪)' },
          skillValue: { type: 'integer', description: 'Shooter skill value (0-99)' },
          difficulty: { type: 'string', enum: ['regular', 'hard', 'extreme'], description: 'Difficulty (e.g. hard for long range)' },
          damageExpr: { type: 'string', description: 'Weapon damage (e.g. "1d10")' },
          targetArmor: { type: 'integer', description: 'Target armor value' },
          targetIsInvestigator: { type: 'boolean', description: 'True if the investigator is the target (takes damage)' },
        },
        required: ['skillName', 'skillValue', 'damageExpr', 'targetIsInvestigator'],
      },
    },
  },
]

/* ═══════════════════ Provider: OpenAI Compatible ═══════════════════ */

async function doOpenAICompat(config, messages, stream, temp, maxTokens, tools, onChunk) {
  const model = config.model
  if (!model) throw new Error('请先在设置中选择或输入模型名称')
  const baseURL = (config.baseUrl || '').replace(/\/$/, '')
  if (!baseURL) throw new Error('请在设置中填写 Base URL')

  const client = new OpenAI({
    baseURL,
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

  if (stream) {
    let fullText = ''
    const toolCallsByIndex = new Map()
    for await (const chunk of res) {
      const choice = chunk.choices?.[0]
      const delta = choice?.delta?.content
      if (delta) {
        fullText += delta
        if (onChunk) onChunk(delta)
      }
      const tcs = choice?.delta?.tool_calls
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          const idx = tc.index ?? 0
          const prev = toolCallsByIndex.get(idx) ?? { id: tc.id, name: '', arguments: '' }
          toolCallsByIndex.set(idx, {
            id: tc.id ?? prev.id,
            name: tc.function?.name ?? prev.name,
            arguments: (prev.arguments ?? '') + (tc.function?.arguments ?? ''),
          })
        }
      }
    }
    const toolCalls = [...toolCallsByIndex.values()].map((tc, idx) => ({
      id: tc.id ?? `tc_${idx}`,
      name: tc.name ?? '',
      arguments: tc.arguments?.trim() ? tc.arguments : '{}',
    }))
    return {
      stream: false,
      content: fullText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  }

  const msg = res.choices?.[0]?.message ?? {}
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '{}',
  }))
  return {
    stream: false,
    content: msg.content ?? '',
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}

/* ═══════════════════ Provider: Anthropic Compatible ═══════════════════ */

function toAnthropicTools(openaiTools) {
  if (!openaiTools?.length) return undefined
  return openaiTools.map((t) => {
    const fn = t.function
    if (!fn) return null
    return {
      name: fn.name,
      description: fn.description ?? '',
      input_schema: fn.parameters ?? { type: 'object', properties: {} },
    }
  }).filter(Boolean)
}

function toAnthropicMessages(messages) {
  const system = []
  const raw = []

  for (const m of messages) {
    if (m.role === 'system') {
      system.push(m.content || '')
      continue
    }
    if (m.role === 'user') {
      raw.push({ role: 'user', content: m.content || '' })
    } else if (m.role === 'assistant') {
      const blocks = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          let input = {}
          try { input = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments ?? {}) } catch (_e) { /* ignore */ }
          blocks.push({
            type: 'tool_use',
            id: tc.id || `tc_${Date.now()}`,
            name: tc.function?.name ?? '',
            input,
          })
        }
      }
      if (blocks.length > 0) raw.push({ role: 'assistant', content: blocks })
    } else if (m.role === 'tool') {
      const last = raw[raw.length - 1]
      const result = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id || '',
        content: m.content || '',
      }
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(result)
      } else {
        raw.push({ role: 'user', content: [result] })
      }
    }
  }

  const msgs = []
  for (const m of raw) {
    const prev = msgs[msgs.length - 1]
    if (prev && prev.role === m.role) {
      const prevBlocks = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content || '' }]
      const curBlocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content || '' }]
      prev.content = prevBlocks.concat(curBlocks)
    } else {
      msgs.push({ ...m })
    }
  }

  if (msgs.length > 0 && msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '（继续）' })
  }

  return { system: system.join('\n\n'), messages: msgs }
}

async function doAnthropic(config, messages, stream, temp, maxTokens, tools, onChunk) {
  const model = config.model
  if (!model) throw new Error('请先在设置中选择或输入模型名称')
  const baseURL = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
  const apiKey = config.apiKey
  if (!apiKey) throw new Error('Anthropic 需要 API Key')

  const { system, messages: anthropicMsgs } = toAnthropicMessages(messages)
  const anthropicTools = toAnthropicTools(tools)

  const body = {
    model,
    messages: anthropicMsgs,
    max_tokens: maxTokens ?? 2048,
    temperature: temp ?? 0.7,
    stream: !!stream,
  }
  if (system) body.system = system
  if (anthropicTools?.length) body.tools = anthropicTools

  const res = await fetch(`${baseURL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic: ${res.status} ${errText}`)
  }

  if (stream) {
    let fullText = ''
    const toolBlocks = []
    let currentToolId = ''
    let currentToolName = ''
    let currentToolInput = ''

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
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') continue
        let evt
        try { evt = JSON.parse(raw) } catch (_e) { continue }

        if (evt.type === 'content_block_start') {
          const block = evt.content_block || {}
          if (block.type === 'tool_use') {
            currentToolId = block.id || ''
            currentToolName = block.name || ''
            currentToolInput = ''
          }
        } else if (evt.type === 'content_block_delta') {
          const delta = evt.delta || {}
          if (delta.type === 'text_delta' && delta.text) {
            fullText += delta.text
            if (onChunk) onChunk(delta.text)
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            currentToolInput += delta.partial_json
          }
        } else if (evt.type === 'content_block_stop') {
          if (currentToolName) {
            let parsedInput = {}
            try { parsedInput = JSON.parse(currentToolInput) } catch (_e) { /* ignore */ }
            toolBlocks.push({
              id: currentToolId,
              name: currentToolName,
              arguments: JSON.stringify(parsedInput),
            })
            currentToolId = ''
            currentToolName = ''
            currentToolInput = ''
          }
        }
      }
    }

    return {
      stream: false,
      content: fullText,
      toolCalls: toolBlocks.length > 0 ? toolBlocks : undefined,
    }
  }

  const data = await res.json()
  let text = ''
  const toolCalls = []
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text || ''
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id || `tc_${toolCalls.length}`,
        name: block.name || '',
        arguments: JSON.stringify(block.input || {}),
      })
    }
  }
  return {
    stream: false,
    content: text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}

/* ═══════════════════ Provider: Google Compatible ═══════════════════ */

function toGeminiTools(openaiTools) {
  if (!openaiTools?.length) return null

  function toGeminiSchema(schema) {
    const t = (schema?.type ?? 'string').toLowerCase()
    const base = {
      type: t === 'object' ? 'OBJECT' : t === 'array' ? 'ARRAY' : t === 'integer' ? 'INTEGER' : t === 'number' ? 'NUMBER' : t === 'boolean' ? 'BOOLEAN' : 'STRING',
      description: schema?.description ?? '',
    }

    if (t === 'array') {
      const itemSchema = schema?.items ?? { type: 'string' }
      base.items = toGeminiSchema(itemSchema)
      return base
    }

    if (t === 'object') {
      const props = schema?.properties ?? {}
      const required = schema?.required ?? []
      const out = { ...base, properties: {}, required }
      for (const [k, v] of Object.entries(props)) out.properties[k] = toGeminiSchema(v)
      return out
    }

    if (Array.isArray(schema?.enum)) {
      base.enum = schema.enum
    }

    return base
  }

  const declarations = openaiTools.map((t) => {
    const fn = t.function
    if (!fn) return null
    const params = fn.parameters ?? { type: 'object', properties: {}, required: [] }
    const geminiParams = toGeminiSchema(params)
    return {
      name: fn.name,
      description: fn.description ?? '',
      parameters: geminiParams,
    }
  }).filter(Boolean)
  return declarations.length ? [{ functionDeclarations: declarations }] : null
}

async function doGoogle(config, messages, stream, temp, maxTokens, tools, onChunk) {
  const apiKey = config.apiKey
  if (!apiKey) throw new Error('Google API 需要 API Key')
  let model = (config.model || '').trim()
  if (!model) throw new Error('请先在设置中选择或输入模型名称')
  model = model.replace(/^models\//, '')

  const baseURL = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')

  const systemMsg = messages.find((m) => m.role === 'system')
  const other = messages.filter((m) => m.role !== 'system')
  const contents = []
  let pendingToolNames = []
  for (const m of other) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      pendingToolNames = m.tool_calls.map((tc) => tc.function?.name ?? '')
      for (const tc of m.tool_calls) {
        const partObj = {
          functionCall: {
            name: tc.function?.name ?? '',
            args: typeof tc.function?.arguments === 'string'
              ? (() => { try { return JSON.parse(tc.function.arguments) } catch (_e) { return {} } })()
              : (tc.function?.arguments ?? {}),
          },
        }
        if (tc._thoughtSignature) partObj.thoughtSignature = tc._thoughtSignature
        contents.push({ role: 'model', parts: [partObj] })
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

  const endpoint = stream ? 'streamGenerateContent' : 'generateContent'
  const altParam = stream ? '&alt=sse' : ''
  const url = `${baseURL}/v1beta/models/${model}:${endpoint}?key=${apiKey}${altParam}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    const msg = res.status === 404
      ? `Google: 404 模型不存在或已下线 (当前: ${model})`
      : `Google: ${res.status} ${text}`
    throw new Error(msg)
  }

  if (stream) {
    let fullText = ''
    const geminiToolCalls = []
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue
        let obj
        try { obj = JSON.parse(raw) } catch (_e) { continue }
        const parts = obj.candidates?.[0]?.content?.parts ?? []
        for (const part of parts) {
          if (part.text) {
            fullText += part.text
            if (onChunk) onChunk(part.text)
          }
          if (part.functionCall) {
            const tc = {
              id: `gemini_tc_${geminiToolCalls.length}`,
              name: part.functionCall.name ?? '',
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            }
            if (part.thoughtSignature) tc._thoughtSignature = part.thoughtSignature
            geminiToolCalls.push(tc)
          }
        }
      }
    }

    return {
      stream: false,
      content: fullText,
      toolCalls: geminiToolCalls.length > 0 ? geminiToolCalls : undefined,
    }
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts ?? []
  let text = ''
  const geminiToolCalls = []
  for (const part of parts) {
    if (part.text) text += part.text
    if (part.functionCall) {
      const tc = {
        id: `gemini_tc_${geminiToolCalls.length}`,
        name: part.functionCall.name ?? '',
        arguments: JSON.stringify(part.functionCall.args ?? {}),
      }
      if (part.thoughtSignature) tc._thoughtSignature = part.thoughtSignature
      geminiToolCalls.push(tc)
    }
  }
  return {
    stream: false,
    content: text,
    toolCalls: geminiToolCalls.length > 0 ? geminiToolCalls : undefined,
  }
}

/* ═══════════════════ Provider → Protocol Resolver ═══════════════════ */

const PROVIDER_MAP = {
  // Preset providers
  openai:     { protocol: 'openai_compatible',    defaultBaseUrl: 'https://api.openai.com/v1' },
  openrouter: { protocol: 'openai_compatible',    defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  deepseek:   { protocol: 'openai_compatible',    defaultBaseUrl: 'https://api.deepseek.com/v1' },
  gemini:     { protocol: 'google_compatible',    defaultBaseUrl: 'https://generativelanguage.googleapis.com' },
  vllm:       { protocol: 'openai_compatible',    defaultBaseUrl: 'http://localhost:8000/v1' },
  ollama:     { protocol: 'openai_compatible',    defaultBaseUrl: 'http://localhost:11434/v1' },
  // Custom compatible providers
  openai_compatible:    { protocol: 'openai_compatible',    defaultBaseUrl: '' },
  anthropic_compatible: { protocol: 'anthropic_compatible', defaultBaseUrl: 'https://api.anthropic.com' },
  google_compatible:    { protocol: 'google_compatible',    defaultBaseUrl: 'https://generativelanguage.googleapis.com' },
  deepseek_compatible:  { protocol: 'openai_compatible',    defaultBaseUrl: 'https://api.deepseek.com/v1' },
}

function resolveProvider(providerName, userBaseUrl) {
  const entry = PROVIDER_MAP[providerName]
  if (!entry) throw new Error(`Unknown provider: ${providerName}. 请在设置中选择正确的提供商。`)
  return {
    protocol: entry.protocol,
    baseUrl: userBaseUrl || entry.defaultBaseUrl,
  }
}

/* ═══════════════════ Unified invokeChat ═══════════════════ */

async function invokeChat(params) {
  // E2E: return deterministic local mock only when E2E/CI context is set
  if (process.env.E2E_MOCK_AI === '1' && (process.env.E2E_FORCE_PROD === '1' || process.env.CI === '1')) {
    const messages = Array.isArray(params?.messages) ? params.messages : []
    const onChunk = typeof params?.onChunk === 'function' ? params.onChunk : null
    const system0 = messages?.[0]?.role === 'system' ? String(messages?.[0]?.content || '') : ''
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user' && typeof m?.content === 'string')
    const userText = (lastUser?.content || '').trim()

    // Intent classifier call (kpGraph.mjs expects a single English keyword)
    if (system0.includes('只回复一个英文意图关键词')) {
      return { stream: false, content: 'narrative' }
    }

    const content = userText
      ? `【E2E】已收到你的行动：${userText}\n\n我会基于已索引的故事信息推进剧情，并在需要时请求检定或给出线索。`
      : '【E2E】我已准备好主持本次跑团。请描述你的行动。'

    // Avoid triggering text-simulation validation patterns (d100 / HP / SAN etc)
    const safe = content
      .replace(/\bd\d+\s*[:=：]\s*\d+/gi, '')
      .replace(/\bd100\b/gi, '')

    if (params?.stream && onChunk) {
      onChunk(safe)
    }
    return { stream: false, content: safe }
  }

  const { provider, model, baseUrl, apiKey: paramApiKey, messages, temperature, maxTokens, stream } = params
  const onChunk = typeof params.onChunk === 'function' ? params.onChunk : null
  const settings = await readSettings()
  const ai = settings?.ai || {}
  const apiKey = (paramApiKey && paramApiKey !== API_KEY_PLACEHOLDER ? paramApiKey : null) ||
    (ai.apiKey && ai.apiKey !== API_KEY_PLACEHOLDER ? ai.apiKey : null) || undefined

  const p = provider || ai.provider
  if (!p) throw new Error('请先在设置中配置 AI 提供商')

  const { protocol, baseUrl: resolvedBaseUrl } = resolveProvider(p, baseUrl || ai.baseUrl)

  const config = {
    provider: p,
    model: model || ai.model,
    baseUrl: resolvedBaseUrl,
    apiKey,
    temperature: temperature ?? ai.temperature ?? 0.7,
    maxTokens: maxTokens ?? ai.maxTokens ?? 2048,
  }

  const temp = config.temperature
  const max = config.maxTokens

  if (protocol === 'openai_compatible') {
    return doOpenAICompat(config, messages, stream, temp, max, params.tools, onChunk)
  }
  if (protocol === 'anthropic_compatible') {
    return doAnthropic(config, messages, stream, temp, max, params.tools, onChunk)
  }
  if (protocol === 'google_compatible') {
    return doGoogle(config, messages, stream, temp, max, params.tools, onChunk)
  }

  throw new Error(`Unknown protocol: ${protocol}`)
}

/* ═══════════════════ Model Listing ═══════════════════ */

async function listModels(params) {
  const { provider, baseUrl: paramBaseUrl, apiKey: paramApiKey, purpose = 'chat' } = params || {}
  const settings = await readSettings()
  const ai = settings?.ai || {}
  const apiKey = (paramApiKey && paramApiKey !== '***' ? paramApiKey : null) ||
    (ai.apiKey && ai.apiKey !== '***' ? ai.apiKey : null) || undefined

  const p = provider || ai.provider
  if (!p) return []

  const { protocol, baseUrl: resolvedBaseUrl } = resolveProvider(p, paramBaseUrl || ai.baseUrl)

  if (protocol === 'openai_compatible') {
    const url = resolvedBaseUrl.replace(/\/$/, '')
    if (!url) return []
    try {
      const modelsUrl = url.endsWith('/v1') ? `${url}/models` : `${url}/v1/models`
      const headers = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      const res = await fetch(modelsUrl, { headers })
      if (!res.ok) return []
      const data = await res.json()
      let models = (data.data || []).filter((m) => m.id).map((m) => ({ value: m.id, label: m.id }))
      if (purpose === 'embeddings') {
        const filtered = models.filter((m) => /(embedding|embed)/i.test(m.value))
        if (filtered.length) models = filtered
      }
      return models.slice(0, 100)
    } catch (_e) {
      return []
    }
  }

  if (protocol === 'anthropic_compatible') {
    if (purpose === 'embeddings') return []
    return [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ]
  }

  if (protocol === 'google_compatible') {
    if (!apiKey) return []
    const baseURL = resolvedBaseUrl.replace(/\/$/, '') || 'https://generativelanguage.googleapis.com'
    try {
      const res = await fetch(
        `${baseURL}/v1beta/models?key=${apiKey}&pageSize=100`
      )
      if (!res.ok) return []
      const data = await res.json()
      const models = data.models || []
      const chatFiltered = models.filter((m) => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
      const embedFiltered = models.filter((m) => {
        const methods = m.supportedGenerationMethods || []
        return m.name && (methods.includes('embedContent') || methods.includes('embedText') || methods.includes('embedding'))
      })
      const final = purpose === 'embeddings' ? (embedFiltered.length ? embedFiltered : chatFiltered) : chatFiltered
      return final.map((m) => {
        const id = (m.name || '').replace('models/', '') || m.name || ''
        return { value: id, label: m.displayName || id }
      })
    } catch (_e) {
      return []
    }
  }

  return []
}

/* ═══════════════════ 工具名单与 cocToolNames.json 一致性校验 ═══════════════════ */
try {
  const cocToolNamesPath = path.join(__dirname, '../../src/toolCalling/cocToolNames.json')
  const cocToolNames = require(cocToolNamesPath)
  const backendNames = new Set(COC_KP_TOOLS.map((t) => t.function.name))
  const missingInBackend = cocToolNames.filter((n) => !backendNames.has(n))
  const missingInList = [...backendNames].filter((n) => !cocToolNames.includes(n))
  if (missingInBackend.length || missingInList.length) {
    logWarn('AI', '工具名单与 cocToolNames.json 不一致', { missingInBackend, missingInList })
  }
} catch (e) {
  // 打包后路径可能不同，仅开发时校验
}

/* ═══════════════════ IPC Registration ═══════════════════ */

function registerAIHandlers() {
  ipcMain.handle('ai:chat', async (_, params) => invokeChat(params))
  ipcMain.handle('ai:listModels', async (_, params) => listModels(params))
}

module.exports = { registerAIHandlers, invokeChat, COC_KP_TOOLS }
