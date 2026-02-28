/**
 * COC KP AI Agent — Enhanced LangGraph Workflow (ReAct + Validation)
 *
 * Architecture:
 *   analyzeInput → planTools → generate → validate ──→ END
 *                                            ↓ (missing tools)
 *                                       forceTools ──→ validate (max 1 retry)
 *
 * Improvements over simple linear flow:
 *  1. Explicit tool planning based on classified intent
 *  2. Text-simulation detection (catches KP faking dice/HP in prose)
 *  3. Force-retry node: tool-only LLM call when validation fails
 *  4. Tool-continuation awareness (multi-turn tool chains)
 *  5. Conditional edges for retry loop with max-retry guard
 */
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

/* ================================================================== */
/*  State                                                              */
/* ================================================================== */

const KPState = Annotation.Root({
  messages:         Annotation({ reducer: (_, r) => (Array.isArray(r) ? r : [r]), default: () => [] }),
  playerIntent:     Annotation({ reducer: (_, r) => r, default: () => 'narrative' }),
  requiredTools:    Annotation({ reducer: (_, r) => r, default: () => [] }),
  toolPlan:         Annotation({ reducer: (_, r) => r, default: () => '' }),
  response:         Annotation({ reducer: (_, r) => r, default: () => '' }),
  toolCalls:        Annotation({ reducer: (_, r) => r, default: () => undefined }),
  retryCount:       Annotation({ reducer: (_, r) => r, default: () => 0 }),
  validationResult: Annotation({ reducer: (_, r) => r, default: () => 'pending' }),
})

/* ================================================================== */
/*  Intent constants & helpers                                         */
/* ================================================================== */

const INTENT_TYPES = [
  'investigate', 'skill_check', 'talk_npc', 'move',
  'combat', 'explore', 'use_item', 'san_encounter', 'narrative',
]

const INTENT_CLASSIFIER_PROMPT =
  '你是一个 COC 7th 跑团意图分类器。根据玩家最新一条消息，从以下意图中选出最匹配的，只回复一个英文关键词。\n\n' +
  '意图类型:\n' +
  '- investigate: 搜索、侦查、检查某物，图书馆/研究\n' +
  '- skill_check: 明确要进行技能检定或投骰\n' +
  '- talk_npc: 与NPC对话、询问、说服、恐吓\n' +
  '- move: 移动、前往某处\n' +
  '- combat: 战斗、攻击、格斗、射击、闪避\n' +
  '- explore: 探索环境、观察周围\n' +
  '- use_item: 使用道具或物品\n' +
  '- san_encounter: 目睹恐怖/超自然事件\n' +
  '- narrative: 一般叙事、角色扮演\n\n' +
  '玩家消息: '

function parseIntent(raw) {
  var s = (raw || '').trim().toLowerCase()
  for (var i = 0; i < INTENT_TYPES.length; i++) {
    if (s.includes(INTENT_TYPES[i]) || s.startsWith(INTENT_TYPES[i])) return INTENT_TYPES[i]
  }
  if (/dice|roll|投骰|检定/.test(s)) return 'skill_check'
  if (/search|exam|look|搜|查|侦/.test(s)) return 'investigate'
  if (/talk|ask|speak|说|问|劝/.test(s)) return 'talk_npc'
  if (/go|move|walk|去|前往|走/.test(s)) return 'move'
  if (/fight|attack|hit|战|攻|打|射/.test(s)) return 'combat'
  return 'narrative'
}

/* ================================================================== */
/*  Text-simulation detection                                          */
/* ================================================================== */

var TEXT_SIMULATION_PATTERNS = [
  /\bd\d+\s*[:=：]\s*\d+/i,
  /\d+d\d+\s*[:=：]\s*\d+/i,
  /投骰[结果]*\s*[:：]\s*\d+/,
  /HP\s*[降变至为低到].{0,8}\d+/,
  /SAN\s*[降损失至为低到].{0,8}\d+/,
  /MP\s*[降消耗至为低到].{0,8}\d+/,
  /受到\s*\d+\s*点.{0,4}伤害/,
  /伤害\s*\d+d\d+/,
  /d100\s*[:：]?\s*\d+/i,
  /目标[值≤]\s*\d+/,
]

function hasTextSimulation(text) {
  if (!text) return false
  for (var i = 0; i < TEXT_SIMULATION_PATTERNS.length; i++) {
    if (TEXT_SIMULATION_PATTERNS[i].test(text)) return true
  }
  return false
}

function cleanTextSimulation(text) {
  if (!text) return ''
  var cleaned = text
    .replace(/\*\*[^*]*(?:检定|伤害结算|d\d+|投骰|目标值)[^*]*\*\*/g, '')
    .replace(/[（(][^)）]*d\d+[^)）]*[)）]/g, '')
    .replace(/→\s*(?:成功|失败|大成功|大失败|极难成功|困难成功)/g, '')
    .replace(/HP\s*[降变至为].{0,15}\d+\/\d+/g, '')
    .replace(/SAN\s*[降损失].{0,15}\d+/g, '')
    .replace(/受到\s*\d+\s*点.{0,4}伤害[，。]?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned || text
}

/* ================================================================== */
/*  Tool-continuation analysis                                         */
/* ================================================================== */

function analyzeToolContinuation(messages) {
  var toolResults = []
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'tool') toolResults.unshift(messages[i])
    else break
  }
  if (toolResults.length === 0) return { isContinuation: false, followUpTools: [] }

  var followUp = []
  for (var j = 0; j < toolResults.length; j++) {
    try {
      var data = JSON.parse(toolResults[j].content)
      if (data.success === true && data.skillName) {
        var combatSkills = ['格斗', '射击', '手枪', '步枪', '投掷', '弓术', '斧', '刀', '矛', '鞭', '拳']
        var isCombat = false
        for (var k = 0; k < combatSkills.length; k++) {
          if ((data.skillName || '').indexOf(combatSkills[k]) >= 0) { isCombat = true; break }
        }
        if (isCombat) followUp.push('roll_dice')
      }
      if (data.roll !== undefined && data.sides !== undefined && !data.skillName && !data.currentSan) {
        followUp.push('adjust_hp')
      }
    } catch (_e) { /* ignore parse errors */ }
  }
  return { isContinuation: true, followUpTools: followUp }
}

/* ================================================================== */
/*  Node 1: Analyze Input                                              */
/* ================================================================== */

function createAnalyzeNode(invokeLLM) {
  return async function analyzeInput(state) {
    var msgs = state.messages || []

    var continuation = analyzeToolContinuation(msgs)
    if (continuation.isContinuation) {
      return {
        playerIntent: 'tool_continuation',
        retryCount: 0,
      }
    }

    var lastUser = null
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUser = msgs[i]; break }
    }
    var userText = (lastUser && lastUser.content) ? lastUser.content.trim() : ''

    var playerIntent = 'narrative'
    if (userText) {
      try {
        var result = await invokeLLM([
          { role: 'system', content: '只回复一个英文意图关键词，例如 narrative 或 investigate。不要解释。' },
          { role: 'user', content: INTENT_CLASSIFIER_PROMPT + userText },
        ])
        playerIntent = parseIntent(typeof result === 'string' ? result : ((result && result.content) || ''))
      } catch (_e) {
        playerIntent = 'narrative'
      }
    }

    return { playerIntent: playerIntent, retryCount: 0 }
  }
}

/* ================================================================== */
/*  Node 2: Plan Tools (programmatic — no LLM call)                    */
/* ================================================================== */

var TOOL_PLANS = {
  combat: {
    required: ['skill_check'],
    plan: '战斗行动。你必须调用 skill_check 工具进行攻击/防御检定。' +
      '命中后必须调用 roll_dice 投伤害骰，然后调用 adjust_hp 扣除伤害。' +
      'NPC 攻击调查员时同样必须完整调用工具链。' +
      '禁止在文字中编造任何骰子数字或 HP 变化。',
  },
  skill_check: {
    required: ['skill_check'],
    plan: '玩家请求检定。你必须调用 skill_check 工具执行检定，使用角色技能表中的技能值。' +
      '等待工具返回真实结果后再叙述后果。禁止在文字中编造投骰结果。',
  },
  san_encounter: {
    required: ['san_check'],
    plan: '恐怖/理智冲击。你必须调用 san_check 工具执行理智检定。' +
      '根据恐怖程度设定 successLoss 和 failureLoss。禁止在文字中编造 SAN 损失数字。',
  },
  investigate: {
    required: [],
    plan: '调查行动。如有隐藏线索需要检定，调用 skill_check（侦查/图书馆使用/聆听等）。' +
      '显明线索直接调用 grant_clue 给予。职业相关的常规调查可自动成功。',
  },
  talk_npc: {
    required: [],
    plan: 'NPC 对话。以 NPC 身份回应。如需社交检定（说服/恐吓/魅惑），调用 skill_check。' +
      'NPC 配合度取决于检定结果和玩家筹码。',
  },
  move: {
    required: [],
    plan: '场景移动。如果目标在故事情报中存在，调用 transition_scene(sceneName)。' +
      '如果目标不在故事中，告知无事发生并引导回到主线。',
  },
  explore: {
    required: [],
    plan: '探索环境。基本描述无需检定。如有隐藏细节可触发侦查检定。使用全感官描写，营造氛围。',
  },
  use_item: {
    required: [],
    plan: '使用物品。根据物品和情境决定是否需要检定（如急救需要 skill_check）。',
  },
  narrative: {
    required: [],
    plan: '一般叙事。推进剧情和氛围。若玩家未推动剧情，简短回应即可。不要重复已描述的内容。',
  },
  tool_continuation: {
    required: [],
    plan: '上一轮工具调用的结果已返回。根据结果继续叙事。' +
      '如果战斗中 skill_check 成功，你必须调用 roll_dice 投伤害骰。' +
      '如果 roll_dice 返回了伤害数字，你必须调用 adjust_hp 扣除伤害。' +
      '禁止在文字中编造任何数值，只能使用工具返回的真实结果。',
  },
}

function createPlanNode() {
  return async function planTools(state) {
    var intent = state.playerIntent || 'narrative'
    var plan = TOOL_PLANS[intent] || TOOL_PLANS.narrative

    var continuation = analyzeToolContinuation(state.messages || [])
    var required = plan.required.slice()
    if (continuation.isContinuation && continuation.followUpTools.length > 0) {
      for (var i = 0; i < continuation.followUpTools.length; i++) {
        if (required.indexOf(continuation.followUpTools[i]) < 0) {
          required.push(continuation.followUpTools[i])
        }
      }
    }

    return {
      requiredTools: required,
      toolPlan: plan.plan,
    }
  }
}

/* ================================================================== */
/*  Node 3: Generate (main LLM call)                                   */
/* ================================================================== */

function createGenerateNode(invokeLLM) {
  return async function generate(state) {
    var msgs = state.messages || []
    var toolPlan = state.toolPlan || ''
    var requiredTools = state.requiredTools || []

    var toolInstruction = ''
    if (requiredTools.length > 0) {
      toolInstruction = '\n\n### 本次必须调用的工具\n' +
        '你在本次回复中 **必须** 调用以下工具（不调用将被系统拒绝）:\n'
      for (var i = 0; i < requiredTools.length; i++) {
        toolInstruction += '- ' + requiredTools[i] + '\n'
      }
      toolInstruction += '先调用工具，然后写简短的过渡叙事。不要在文字中编造工具应该返回的数值。\n'
    }

    var hintBlock = '### 行动计划\n' + toolPlan + toolInstruction +
      '\n\n【输出规则】只输出给调查员看的剧情与对话。不要出现规则说明、意图分类、工具名称等内部内容。' +
      '绝对禁止在文字中编造骰子结果或数值变化，所有检定和数值变更必须通过工具实现。'

    var enhancedMsgs = msgs.slice()
    var systemIdx = -1
    for (var j = 0; j < enhancedMsgs.length; j++) {
      if (enhancedMsgs[j].role === 'system') { systemIdx = j; break }
    }
    if (systemIdx >= 0) {
      enhancedMsgs[systemIdx] = {
        role: 'system',
        content: (enhancedMsgs[systemIdx].content || '') + '\n\n' + hintBlock,
      }
    } else {
      enhancedMsgs.unshift({ role: 'system', content: hintBlock })
    }

    var result = await invokeLLM(enhancedMsgs)
    var content = typeof result === 'string' ? result : ((result && result.content) || '')
    var toolCalls = (typeof result === 'object' && result && result.toolCalls) ? result.toolCalls : undefined

    return { response: content || '', toolCalls: toolCalls }
  }
}

/* ================================================================== */
/*  Node 4: Validate (programmatic — no LLM call)                      */
/* ================================================================== */

function createValidateNode() {
  return async function validate(state) {
    var response = state.response || ''
    var toolCalls = state.toolCalls
    var required = state.requiredTools || []
    var retryCount = state.retryCount || 0

    var calledNames = []
    if (toolCalls && toolCalls.length > 0) {
      for (var i = 0; i < toolCalls.length; i++) {
        calledNames.push(toolCalls[i].name || '')
      }
    }

    var missingTools = []
    for (var j = 0; j < required.length; j++) {
      if (calledNames.indexOf(required[j]) < 0) {
        missingTools.push(required[j])
      }
    }

    var simulated = hasTextSimulation(response)

    if (missingTools.length === 0 && !simulated) {
      return { validationResult: 'valid' }
    }

    if (retryCount >= 1) {
      var cleanedResponse = simulated ? cleanTextSimulation(response) : response
      return { validationResult: 'max_retries', response: cleanedResponse }
    }

    var cleanedForRetry = simulated ? cleanTextSimulation(response) : response
    return {
      validationResult: 'missing_tools',
      response: cleanedForRetry,
    }
  }
}

/* ================================================================== */
/*  Node 5: Force Tool Call (tool-only LLM call)                       */
/* ================================================================== */

function createForceToolNode(invokeLLM) {
  return async function forceTools(state) {
    var msgs = state.messages || []
    var required = state.requiredTools || []
    var retryCount = state.retryCount || 0

    var toolList = required.join(', ')
    var forcePrompt =
      '你是 COC 7th 守密人 AI 的工具调度模块。\n' +
      '你必须根据当前对话上下文调用以下工具: ' + toolList + '\n\n' +
      '规则:\n' +
      '1. 只输出工具调用，不要输出任何叙事文字\n' +
      '2. 根据对话中的角色技能信息确定参数\n' +
      '3. 如果需要 skill_check，从角色技能表找到对应技能值\n' +
      '4. 如果需要 roll_dice，根据武器/情境确定骰子面数\n' +
      '5. 如果需要 adjust_hp，使用之前 roll_dice 的结果作为负数 delta\n'

    var forceMsgs = []
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'system') {
        forceMsgs.push({ role: 'system', content: msgs[i].content + '\n\n' + forcePrompt })
      } else {
        forceMsgs.push(msgs[i])
      }
    }
    if (forceMsgs.length === 0 || forceMsgs[0].role !== 'system') {
      forceMsgs.unshift({ role: 'system', content: forcePrompt })
    }

    forceMsgs.push({
      role: 'user',
      content: '请立即调用以下工具: ' + toolList + '。不要输出文字，只调用工具。',
    })

    var result
    try {
      result = await invokeLLM(forceMsgs)
    } catch (err) {
      console.error('[kpGraph forceTools] LLM call failed:', err?.message || err)
      return {
        retryCount: retryCount + 1,
        validationResult: 'max_retries',
      }
    }

    var newToolCalls = (typeof result === 'object' && result && result.toolCalls) ? result.toolCalls : undefined

    var merged = state.toolCalls ? state.toolCalls.slice() : []
    if (newToolCalls && newToolCalls.length > 0) {
      for (var j = 0; j < newToolCalls.length; j++) {
        merged.push(newToolCalls[j])
      }
    }

    return {
      toolCalls: merged.length > 0 ? merged : undefined,
      retryCount: retryCount + 1,
    }
  }
}

/* ================================================================== */
/*  Routing function                                                   */
/* ================================================================== */

function routeAfterValidation(state) {
  var result = state.validationResult || 'valid'
  if (result === 'valid' || result === 'max_retries') return 'end'
  return 'forceTools'
}

/* ================================================================== */
/*  Graph assembly                                                     */
/* ================================================================== */

export function createKPGraph(invokeLLM) {
  var graph = new StateGraph(KPState)
    .addNode('analyzeInput', createAnalyzeNode(invokeLLM))
    .addNode('planTools', createPlanNode())
    .addNode('generate', createGenerateNode(invokeLLM))
    .addNode('validate', createValidateNode())
    .addNode('forceTools', createForceToolNode(invokeLLM))
    .addEdge(START, 'analyzeInput')
    .addEdge('analyzeInput', 'planTools')
    .addEdge('planTools', 'generate')
    .addEdge('generate', 'validate')
    .addConditionalEdges('validate', routeAfterValidation, {
      end: END,
      forceTools: 'forceTools',
    })
    .addEdge('forceTools', 'validate')

  return graph.compile()
}

/* ================================================================== */
/*  Public entry point                                                 */
/* ================================================================== */

/**
 * Run the KP Agent graph.
 * @returns {Promise<{content: string, toolCalls?: Array<{id, name, arguments}>}>}
 */
export async function invokeKPAgent(messages, invokeLLM) {
  var graph = createKPGraph(invokeLLM)
  var result = await graph.invoke({ messages: messages })
  return {
    content: result.response || '',
    toolCalls: (result.toolCalls && result.toolCalls.length > 0) ? result.toolCalls : undefined,
  }
}
