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

/**
 * KPState fields:
 * - messages: LangGraph message array
 * - playerIntent: current classified intent
 * - requiredTools: tools this turn must call
 * - toolPlan: natural-language tool plan
 * - response: assistant narrative text
 * - toolCalls: tools selected by the LLM this turn
 * - retryCount: validation retry counter
 * - validationResult: 'pending' | 'valid' | 'missing_tools' | 'max_retries'
 * - agentType: 'generic' | 'combat' | 'sanity' | 'narrative' | 'resource'
 * - storyContext: optional structured story state injected from Electron/front-end
 * - narrativeStallLevel: simple counter to detect long-term narrative stalling
 */
const KPState = Annotation.Root({
  messages:            Annotation({ reducer: (_, r) => (Array.isArray(r) ? r : [r]), default: () => [] }),
  playerIntent:        Annotation({ reducer: (_, r) => r, default: () => 'narrative' }),
  requiredTools:       Annotation({ reducer: (_, r) => r, default: () => [] }),
  toolPlan:            Annotation({ reducer: (_, r) => r, default: () => '' }),
  response:            Annotation({ reducer: (_, r) => r, default: () => '' }),
  toolCalls:           Annotation({ reducer: (_, r) => r, default: () => undefined }),
  retryCount:          Annotation({ reducer: (_, r) => r, default: () => 0 }),
  validationResult:    Annotation({ reducer: (_, r) => r, default: () => 'pending' }),
  agentType:           Annotation({ reducer: (_, r) => r, default: () => 'generic' }),
  storyContext:        Annotation({ reducer: (_, r) => r, default: () => null }),
  narrativeStallLevel: Annotation({ reducer: (_, r) => r, default: () => 0 }),
  _traceEvents:        Annotation({ reducer: (prev, r) => (prev || []).concat(Array.isArray(r) ? r : [r]), default: () => [] }),
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
/*  Narrative progress analysis                                       */
/* ================================================================== */

/**
 * Lightweight narrative stall detector.
 *
 * Uses a simple counter on KPState instead of re-parsing full history so we
 * can gradually escalate from "suggest giving a线索" → "必须给线索" → "必须切场景"。
 */
function analyzeNarrativeProgress(state) {
  var intent = state.playerIntent || 'narrative'
  var stallLevel = state.narrativeStallLevel || 0
  var toolCalls = state.toolCalls || []

  var progressTools = ['grant_clue', 'transition_scene', 'skill_check']
  var hasProgressTool = false
  if (toolCalls && toolCalls.length > 0) {
    for (var i = 0; i < toolCalls.length; i++) {
      var name = toolCalls[i].name || ''
      for (var j = 0; j < progressTools.length; j++) {
        if (name === progressTools[j]) { hasProgressTool = true; break }
      }
      if (hasProgressTool) break
    }
  }

  var isNarrativeIntent =
    intent === 'investigate' ||
    intent === 'explore' ||
    intent === 'talk_npc' ||
    intent === 'move' ||
    intent === 'narrative' ||
    intent === 'tool_continuation'

  if (isNarrativeIntent && !hasProgressTool) {
    stallLevel = stallLevel + 1
  } else if (hasProgressTool) {
    stallLevel = 0
  }

  if (stallLevel < 0) stallLevel = 0
  if (stallLevel > 10) stallLevel = 10

  var shouldForceClue = stallLevel >= 2
  var shouldForceScene = stallLevel >= 4

  return {
    nextStallLevel: stallLevel,
    shouldForceClue: shouldForceClue,
    shouldForceScene: shouldForceScene,
  }
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
    var rawLLMOutput = ''
    if (userText) {
      try {
        var result = await invokeLLM([
          { role: 'system', content: '只回复一个英文意图关键词，例如 narrative 或 investigate。不要解释。' },
          { role: 'user', content: INTENT_CLASSIFIER_PROMPT + userText },
        ])
        rawLLMOutput = typeof result === 'string' ? result : ((result && result.content) || '')
        playerIntent = parseIntent(rawLLMOutput)
      } catch (_e) {
        playerIntent = 'narrative'
      }
    }

    return {
      playerIntent: playerIntent,
      retryCount: 0,
      _traceEvents: [{ span: 'kp_agent', type: 'intent_classified', data: { intent: playerIntent, rawLLMOutput: rawLLMOutput } }],
    }
  }
}

/* ================================================================== */
/*  Node 1.5: Route By Intent (programmatic)                           */
/* ================================================================== */

function createRouteByIntentNode() {
  return async function routeByIntent(state) {
    var intent = state.playerIntent || 'narrative'
    var agent = 'generic'
    if (intent === 'combat') agent = 'combat'
    else if (intent === 'san_encounter') agent = 'sanity'
    else if (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'tool_continuation' || intent === 'narrative') {
      agent = 'narrative'
    } else if (intent === 'use_item') {
      agent = 'resource'
    }
    return {
      agentType: agent,
      _traceEvents: [{ span: 'kp_agent', type: 'agent_routed', data: { agentType: agent, intent: intent } }],
    }
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

function createPlanNode(agentKind) {
  return async function planTools(state) {
    var intent = state.playerIntent || 'narrative'
    var plan = TOOL_PLANS[intent] || TOOL_PLANS.narrative

    var stallInfo = null
    if (agentKind === 'narrative' || agentKind === 'generic') {
      stallInfo = analyzeNarrativeProgress(state)
    }

    var continuation = analyzeToolContinuation(state.messages || [])
    var required = plan.required.slice()
    if (continuation.isContinuation && continuation.followUpTools.length > 0) {
      for (var i = 0; i < continuation.followUpTools.length; i++) {
        if (required.indexOf(continuation.followUpTools[i]) < 0) {
          required.push(continuation.followUpTools[i])
        }
      }
    }

    // Phase 2: narrative/generic hard constraints based on stall analysis
    if (stallInfo && (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'narrative' || intent === 'tool_continuation')) {
      if (stallInfo.shouldForceScene && agentKind === 'narrative') {
        if (required.indexOf('transition_scene') < 0) required.push('transition_scene')
      } else if (stallInfo.shouldForceClue) {
        if (required.indexOf('grant_clue') < 0) required.push('grant_clue')
      }
    }

    // Phase 2.5: narrative/generic SAN auto-check hint from storyContext
    if ((agentKind === 'narrative' || agentKind === 'generic') && state.storyContext && state.storyContext.sanity && state.storyContext.sanity.autoCheck) {
      if (required.indexOf('san_check') < 0) required.push('san_check')
    }

    // Phase 2.6: external anti-stall force transition flag (renderer side)
    if (agentKind === 'narrative' && state.storyContext && state.storyContext.forceTransitionScene) {
      if (required.indexOf('transition_scene') < 0) required.push('transition_scene')
    }

    // Phase 3: sanityAgent flow based on simple sanity context
    if (agentKind === 'sanity' && intent === 'san_encounter') {
      var sanityCtx = state.storyContext && state.storyContext.sanity ? state.storyContext.sanity : null
      if (sanityCtx) {
        var currentSan = typeof sanityCtx.currentSan === 'number' ? sanityCtx.currentSan : null
        var dailyLoss = typeof sanityCtx.dailySanLoss === 'number' ? sanityCtx.dailySanLoss : null
        var potentialLoss = typeof sanityCtx.potentialLoss === 'number' ? sanityCtx.potentialLoss : null

        var shouldConsiderTrigger =
          (potentialLoss !== null && potentialLoss >= 5) ||
          (currentSan !== null && currentSan > 0 && dailyLoss !== null && potentialLoss !== null &&
            (dailyLoss + potentialLoss) >= Math.floor(currentSan / 5))

        if (shouldConsiderTrigger && required.indexOf('trigger_insanity') < 0) {
          required.push('trigger_insanity')
        }
      }
    }

    // Phase 3: resourceAgent structured tool mapping
    if (agentKind === 'resource' && intent === 'use_item') {
      var msgs = state.messages || []
      var lastUser = null
      for (var u = msgs.length - 1; u >= 0; u--) {
        if (msgs[u].role === 'user') { lastUser = msgs[u]; break }
      }
      var text = (lastUser && lastUser.content) ? String(lastUser.content).toLowerCase() : ''

      if (/luck|幸运/.test(text) && required.indexOf('spend_luck') < 0) {
        required.push('spend_luck')
      }
      if (/(mp|魔法值|法力)/.test(text) && required.indexOf('adjust_mp') < 0) {
        required.push('adjust_mp')
      }
      if (/(san|理智)/.test(text) && required.indexOf('adjust_san') < 0) {
        required.push('adjust_san')
      }
    }

    // Phase 4: genericAgent guardrails — never force high-impact narrative tools
    if (agentKind === 'generic' && required.length > 0) {
      var filtered = []
      for (var g = 0; g < required.length; g++) {
        if (required[g] === 'transition_scene' || required[g] === 'grant_clue') continue
        filtered.push(required[g])
      }
      required = filtered
    }

    var nextStallLevel = stallInfo ? stallInfo.nextStallLevel : (state.narrativeStallLevel || 0)
    return {
      requiredTools: required,
      toolPlan: plan.plan,
      narrativeStallLevel: nextStallLevel,
      _traceEvents: [{ span: 'kp_agent', type: 'tool_plan_created', data: { requiredTools: required, plan: plan.plan, stallLevel: nextStallLevel } }],
    }
  }
}

/* ================================================================== */
/*  Node 3: Generate (main LLM call)                                   */
/* ================================================================== */

function createGenerateNode(invokeLLM, agentKind) {
  return async function generate(state) {
    var msgs = state.messages || []
    var toolPlan = state.toolPlan || ''
    var requiredTools = state.requiredTools || []
    var storyContext = state.storyContext || null

    var toolInstruction = ''
    if (requiredTools.length > 0) {
      toolInstruction = '\n\n### 本次必须调用的工具\n' +
        '你在本次回复中 **必须** 调用以下工具（不调用将被系统拒绝）:\n'
      for (var i = 0; i < requiredTools.length; i++) {
        toolInstruction += '- ' + requiredTools[i] + '\n'
      }
      toolInstruction += '先调用工具，然后写简短的过渡叙事。不要在文字中编造工具应该返回的数值。\n'
    }

    var storyContextBlock = ''
    if (storyContext && (agentKind === 'narrative' || agentKind === 'generic')) {
      var sc = storyContext
      storyContextBlock = '\n\n### 当前故事上下文（仅供你参考，不要直白念出字段名）\n'
      if (sc.sceneName || sc.sceneId) {
        storyContextBlock += '- 场景: ' + (sc.sceneName || sc.sceneId) + (sc.sceneType ? '（类型: ' + sc.sceneType + '）' : '') + '\n'
      }
      if (typeof sc.act === 'string') {
        storyContextBlock += '- 当前幕次/阶段: ' + sc.act + '\n'
      }
      if (Array.isArray(sc.openClues) && sc.openClues.length > 0) {
        storyContextBlock += '- 未解决线索:\n'
        for (var oc = 0; oc < sc.openClues.length; oc++) {
          storyContextBlock += '  - ' + String(sc.openClues[oc]) + '\n'
        }
      }
      if (Array.isArray(sc.activeNPCs) && sc.activeNPCs.length > 0) {
        storyContextBlock += '- 场景中重要 NPC:\n'
        for (var an = 0; an < sc.activeNPCs.length; an++) {
          var npc = sc.activeNPCs[an]
          if (npc && (npc.name || npc.role)) {
            storyContextBlock += '  - ' + (npc.name || 'NPC') + (npc.role ? '（' + npc.role + '）' : '') + '\n'
          }
        }
      }
      storyContextBlock += '请让叙事和行动选项尽量围绕上述线索和 NPC 展开。玩家跑题时，可以简短回应，但需要把话题拉回当前场景或主线。\n'
    }

    var agentHint = ''
    if (agentKind === 'combat') {
      agentHint =
        '\n\n【战斗守则】所有攻击/防御/伤害必须通过工具链完成（skill_check → roll_dice → adjust_hp）。' +
        '禁止在文字中编造命中结果、伤害点数或 HP 变化。'
    } else if (agentKind === 'sanity') {
      agentHint =
        '\n\n【理智守则】所有 SAN 检定与疯狂状态变化必须通过 san_check / trigger_insanity / adjust_san 工具完成，' +
        '禁止在文字中编造 SAN 数值或疯狂状态变更。'
    } else if (agentKind === 'narrative' || agentKind === 'generic') {
      agentHint =
        '\n\n【叙事守则】在每一轮回复中，请：' +
        '1）先用 1～2 句通过视觉/听觉/气味等感官强化当前场景氛围；' +
        '2）明确反馈玩家上一行动的直接结果；' +
        '3）给出 2～3 个清晰的下一步可选行动（使用列表或显式提示“你可以选择：…”），引导玩家与场景中的线索或 NPC 互动。' +
      '如需要推进剧情或给出重要信息，请优先调用 transition_scene / grant_clue / skill_check 等工具，而不是单纯在文本中硬塞信息。' +
      '当你描述调查员首次目睹超自然现象、惨烈尸体、不可名状的恐怖、或任何足以撼动理智的场景时，**必须**调用 san_check，并根据恐怖程度设定 successLoss/failureLoss。' +
      '当故事已明确结束（真相揭示、逃离成功/失败、团灭/永久疯狂等），**必须**调用 end_game(outcome,title,summary)，然后停止继续推进对话。'
    }

    if (agentKind === 'generic') {
      agentHint +=
        '\n\n【genericAgent 限制】你主要负责规则问答、规则说明或简单闲聊：' +
        '1）简要回答后，应自动补上一句自然的过渡，把话题拉回当前场景或主线；' +
        '2）不要主动调用 transition_scene 或 grant_clue 等高影响剧情工具，把这些留给叙事 Agent；' +
        '3）如需要让玩家回到故事，请用自然语言提醒当前场景和可以采取的行动，而不是开启全新世界观或无关剧情。'
    }

    var hintBlock = '### 行动计划\n' + toolPlan + toolInstruction + storyContextBlock +
      '\n\n【输出规则】只输出给调查员看的剧情与对话。不要出现规则说明、意图分类、工具名称等内部内容。' +
      '绝对禁止在文字中编造骰子结果或数值变化，所有检定和数值变更必须通过工具实现。' +
      agentHint

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

    var genStartTime = Date.now()
    var result = await invokeLLM(enhancedMsgs)
    var content = typeof result === 'string' ? result : ((result && result.content) || '')
    var toolCalls = (typeof result === 'object' && result && result.toolCalls) ? result.toolCalls : undefined
    var genDuration = Date.now() - genStartTime

    return {
      response: content || '',
      toolCalls: toolCalls,
      _traceEvents: [
        { span: 'kp_agent', type: 'llm_generate_start', data: { messageCount: enhancedMsgs.length, agentType: agentKind } },
        { span: 'kp_agent', type: 'llm_generate_end', data: { responseLength: (content || '').length, hasToolCalls: !!(toolCalls && toolCalls.length), toolCallCount: toolCalls ? toolCalls.length : 0, durationMs: genDuration } },
      ],
    }
  }
}

/* ================================================================== */
/*  Node 4: Validate (programmatic — no LLM call)                      */
/* ================================================================== */

// Unidirectional: calling the key tool implicitly satisfies all value tools.
// e.g. melee_attack internally performs skill_check + roll_dice + adjust_hp.
// Reverse does NOT hold — calling skill_check+roll_dice+adjust_hp won't satisfy melee_attack.
var TOOL_EQUIVALENTS = {
  'melee_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
  'ranged_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
}

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

    var expandedNames = calledNames.slice()
    for (var e = 0; e < calledNames.length; e++) {
      var equiv = TOOL_EQUIVALENTS[calledNames[e]]
      if (equiv) {
        for (var q = 0; q < equiv.length; q++) {
          if (expandedNames.indexOf(equiv[q]) < 0) expandedNames.push(equiv[q])
        }
      }
    }

    var missingTools = []
    for (var j = 0; j < required.length; j++) {
      if (expandedNames.indexOf(required[j]) < 0) {
        missingTools.push(required[j])
      }
    }

    var simulated = hasTextSimulation(response)

    var traceData = { span: 'kp_agent', type: 'validation_result', data: { result: 'valid', hasSimulation: simulated, missingTools: missingTools, retryCount: retryCount } }

    if (missingTools.length === 0 && !simulated) {
      traceData.data.result = 'valid'
      return { validationResult: 'valid', _traceEvents: [traceData] }
    }

    if (retryCount >= 1) {
      var cleanedResponse = simulated ? cleanTextSimulation(response) : response
      traceData.data.result = 'max_retries'
      return { validationResult: 'max_retries', response: cleanedResponse, _traceEvents: [traceData] }
    }

    var cleanedForRetry = simulated ? cleanTextSimulation(response) : response
    traceData.data.result = 'missing_tools'
    return {
      validationResult: 'missing_tools',
      response: cleanedForRetry,
      _traceEvents: [traceData],
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
      _traceEvents: [{ span: 'kp_agent', type: 'force_tools_invoked', data: { requiredTools: required, newToolCount: newToolCalls ? newToolCalls.length : 0 } }],
    }
  }
}

/* ================================================================== */
/*  Routing function                                                   */
/* ================================================================== */

function routeByIntentEdge(state) {
  var intent = state.playerIntent || 'narrative'
  if (intent === 'combat') return 'combat'
  if (intent === 'san_encounter') return 'sanity'
  if (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'tool_continuation' || intent === 'narrative') return 'narrative'
  if (intent === 'use_item') return 'resource'
  return 'generic'
}

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
    .addNode('routeByIntent', createRouteByIntentNode())
    // generic agent
    .addNode('genericPlan', createPlanNode('generic'))
    .addNode('genericGenerate', createGenerateNode(invokeLLM, 'generic'))
    // combat agent
    .addNode('combatPlan', createPlanNode('combat'))
    .addNode('combatGenerate', createGenerateNode(invokeLLM, 'combat'))
    // sanity agent
    .addNode('sanityPlan', createPlanNode('sanity'))
    .addNode('sanityGenerate', createGenerateNode(invokeLLM, 'sanity'))
    // narrative agent
    .addNode('narrativePlan', createPlanNode('narrative'))
    .addNode('narrativeGenerate', createGenerateNode(invokeLLM, 'narrative'))
    // resource agent
    .addNode('resourcePlan', createPlanNode('resource'))
    .addNode('resourceGenerate', createGenerateNode(invokeLLM, 'resource'))
    // shared validation / force-tools
    .addNode('validate', createValidateNode())
    .addNode('forceTools', createForceToolNode(invokeLLM))
    // edges
    .addEdge(START, 'analyzeInput')
    .addEdge('analyzeInput', 'routeByIntent')
    .addConditionalEdges('routeByIntent', routeByIntentEdge, {
      combat: 'combatPlan',
      sanity: 'sanityPlan',
      narrative: 'narrativePlan',
      resource: 'resourcePlan',
      generic: 'genericPlan',
    })
    .addEdge('genericPlan', 'genericGenerate')
    .addEdge('combatPlan', 'combatGenerate')
    .addEdge('sanityPlan', 'sanityGenerate')
    .addEdge('narrativePlan', 'narrativeGenerate')
    .addEdge('resourcePlan', 'resourceGenerate')
    .addEdge('genericGenerate', 'validate')
    .addEdge('combatGenerate', 'validate')
    .addEdge('sanityGenerate', 'validate')
    .addEdge('narrativeGenerate', 'validate')
    .addEdge('resourceGenerate', 'validate')
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
export async function invokeKPAgent(messages, invokeLLM, storyContext) {
  var graph = createKPGraph(invokeLLM)
  var initialState = { messages: messages }
  if (storyContext !== undefined && storyContext !== null) {
    initialState.storyContext = storyContext
  }
  var result = await graph.invoke(initialState)
  return {
    content: result.response || '',
    toolCalls: (result.toolCalls && result.toolCalls.length > 0) ? result.toolCalls : undefined,
    _traceEvents: result._traceEvents || [],
  }
}
