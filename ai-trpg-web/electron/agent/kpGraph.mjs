/**
 * COC KP（守密人）AI Agent 工作流 - LangGraph
 * 包含意图检测：先识别玩家意图，再据此生成更精准的 KP 回复
 */
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

const INTENT_PROMPT = `你是一个 COC 跑团意图分类器。根据玩家最新一条消息，从以下类型中选择最匹配的意图，只回复一个关键词，不要解释。

意图类型：
- skill_check: 玩家要进行技能检定（如侦查、聆听、心理学、说服等）
- dice_roll: 玩家要投骰子（如d100、d6、投骰）
- examine: 玩家要调查/观察/检查某物或某处
- talk: 玩家要与 NPC 对话或询问
- move: 玩家要移动、前往某处或切换场景
- combat: 玩家要进行战斗相关行动
- narrative: 一般叙事、行动或角色扮演

玩家消息：`

const KPState = Annotation.Root({
  messages: Annotation({
    reducer: (_, right) => (Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  intent: Annotation(),
  response: Annotation(),
  toolCalls: Annotation(),
})

const INTENT_TYPES = [
  'skill_check',
  'dice_roll',
  'examine',
  'talk',
  'move',
  'combat',
  'narrative',
]

function parseIntent(raw) {
  const s = (raw || '').trim().toLowerCase()
  for (const t of INTENT_TYPES) {
    if (s.includes(t) || s.startsWith(t)) return t
  }
  return 'narrative'
}

/**
 * 创建 KP Agent 图：意图检测 → KP 回复
 */
export function createKPGraph(invokeLLM) {
  const intentNode = async (state) => {
    const msgs = state.messages ?? []
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    const userText = lastUser?.content?.trim() || ''
    let intent = 'narrative'
    if (userText) {
      try {
        const prompt = INTENT_PROMPT + userText
        const msgsForIntent = [
          { role: 'system', content: '只回复一个英文意图关键词，例如 narrative 或 skill_check。' },
          { role: 'user', content: prompt },
        ]
        const raw = await invokeLLM(msgsForIntent)
        intent = parseIntent(raw)
      } catch {
        intent = 'narrative'
      }
    }
    return { intent }
  }

  const kpNode = async (state) => {
    const msgs = state.messages ?? []
    const intent = state.intent ?? 'narrative'
    const intentHint = {
      skill_check: '玩家意图为【技能检定】。你应立即调用 roll_dice 工具（sides 默认 100）取得骰子结果，不要要求玩家再投一次或提醒你投骰。根据工具返回的 roll 与技能值写出「投骰结果：XX」「检定成功/失败」，然后才叙述剧情。勿自行编造骰数。检定失败时可调用 adjust_hp / adjust_san。',
      dice_roll: '玩家意图为【投骰】。你应立即调用 roll_dice 工具取得随机结果（d100 用 sides=100，d6 用 sides=6），不要等待玩家再次确认或提醒。根据工具返回的 roll 写出「骰子结果：XX」再叙述剧情。每次投骰都须重新调用 roll_dice，勿重复使用同一数字。',
      examine: '玩家意图为【调查/观察】。请描述其调查结果，必要时可提示技能检定。若玩家发现重要线索，调用 grant_clue(clueId) 授予线索。',
      talk: '玩家意图为【对话/询问】。请以 NPC 身份回应或推动对话。',
      move: '玩家意图为【移动/行动】。若玩家移动到新地点或场景发生变化，调用 transition_scene(sceneId) 切换场景，然后描述新场景。',
      combat: '玩家意图为【战斗】。造成伤害时调用 adjust_hp，理智损失时调用 adjust_san。',
      narrative: '玩家意图为【一般叙事/行动】。请根据情境回应并推进剧情。',
    }[intent] || '玩家意图为【一般叙事/行动】。请根据情境回应并推进剧情。'

    const toolHint = '你有工具 adjust_hp、adjust_san、adjust_mp 可调整调查员 HP/SAN/MP；roll_dice(sides) 用于投骰，每次需要骰子结果时都必须调用 roll_dice 取得新的随机数；transition_scene(sceneId) 用于场景转换，当玩家移动到新地点或剧情推进到新场景时调用；grant_clue(clueId) 用于授予线索，当玩家发现重要信息或证据时调用。当玩家受伤、失去理智、使用魔法时，请调用相应工具，delta 为正数表示恢复、负数表示减少。'
    const antiRepeatHint = '若玩家未推动剧情、场景未变或只是重复/追问同一件事，请简短回应，不要重复已描述过的场景或台词；可简要确认或给一两句推进即可。'

    const systemIdx = msgs.findIndex((m) => m.role === 'system')
    const enhancedMsgs = [...msgs]
    const hintBlock = `## 内部指引（仅你可见，严禁在回复中引用、复述或输出给玩家）
- 意图：${intentHint}
- 工具：${toolHint}
- 避免重复：${antiRepeatHint}

【重要】回复中只输出给调查员看的剧情与对话，不要出现「意图提示」「工具说明」「避免重复」等字样或任何上述原文。`
    if (systemIdx >= 0) {
      enhancedMsgs[systemIdx] = {
        role: 'system',
        content: (enhancedMsgs[systemIdx].content || '') + `\n\n${hintBlock}`,
      }
    } else {
      enhancedMsgs.unshift({
        role: 'system',
        content: hintBlock,
      })
    }

    const result = await invokeLLM(enhancedMsgs)
    const content = typeof result === 'string' ? result : (result?.content ?? '')
    const toolCalls = typeof result === 'object' && result?.toolCalls ? result.toolCalls : undefined
    if (toolCalls?.length > 0) return { response: content || '', toolCalls }
    return { response: content ?? '' }
  }

  const graph = new StateGraph(KPState)
    .addNode('classifyIntent', intentNode)
    .addNode('kp', kpNode)
    .addEdge(START, 'classifyIntent')
    .addEdge('classifyIntent', 'kp')
    .addEdge('kp', END)

  return graph.compile()
}

/**
 * 运行 KP Agent：意图检测 → KP 回复
 * @returns { Promise<{ content: string, toolCalls?: Array<{ id, name, arguments }> }> }
 */
export async function invokeKPAgent(messages, invokeLLM) {
  const graph = createKPGraph(invokeLLM)
  const result = await graph.invoke({ messages })
  return {
    content: result.response ?? '',
    toolCalls: result.toolCalls?.length ? result.toolCalls : undefined,
  }
}
