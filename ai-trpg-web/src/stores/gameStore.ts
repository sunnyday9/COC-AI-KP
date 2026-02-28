import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types/game'
import type { GamePhase, COCCharacterSheet } from '../types/character'
import { chat, isStreamResponse } from '../services/ai'
import { getContext, getStoryOverview } from '../services/ragService'
import { rollD } from '../services/diceService'
import { getSkillName } from '../data/coc7'
import { useSettingsStore } from './settingsStore'

function generateId(): string {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

const MAX_MEMORY_ENTRIES = 8
const MAX_ENTRY_LEN = 280

function sanitizeKpResponse(content: string): string {
  if (!content?.trim()) return content
  const leakedPatterns = [
    /^\[意图提示\].*$/gm,
    /^\[工具说明\].*$/gm,
    /^\[避免重复\].*$/gm,
    /^## 内部指引（仅你可见.*$/gm,
    /^【重要】回复中只输出.*$/gm,
    /^- 意图：.*$/gm,
    /^- 工具：.*$/gm,
    /^- 避免重复：.*$/gm,
  ]
  let out = content
  for (const p of leakedPatterns) {
    out = out.replace(p, '')
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

function buildMemoryBlock(entries: string[]): string {
  if (entries.length === 0) return ''
  const truncated = entries.slice(-MAX_MEMORY_ENTRIES).map((s) => s.trim().slice(0, MAX_ENTRY_LEN) + (s.length > MAX_ENTRY_LEN ? '…' : ''))
  return `\n## 记忆：你（守密人）在本局已说过的内容\n以下是你已经向调查员表述过的内容，请避免用相同或高度相似的措辞重复。每次回应请用新的表述方式推进剧情。\n${truncated.map((t) => `- ${t}`).join('\n')}\n`
}

export const useGameStore = defineStore('game', () => {
  const sessionId = ref<string | null>(null)
  /** ID of the indexed story in the vector store */
  const storyId = ref<string | null>(null)
  /** Display name of the story */
  const storyName = ref<string>('')
  /** Story overview fetched from RAG on game start */
  const storyOverview = ref<string>('')
  /** Current scene name (narrative tracking, not script-enforced) */
  const currentScene = ref<string>('')
  /** Clues the investigator has obtained (descriptions) */
  const cluesObtained = ref<string[]>([])
  const messages = ref<Message[]>([])
  const kpMemory = ref<string[]>([])
  const isInGame = ref(false)
  const isSending = ref(false)
  const playerName = ref('调查员')

  const gamePhase = ref<GamePhase>('story_selected')
  const characterSheet = ref<COCCharacterSheet | null>(null)
  const derivedStatsVersion = ref(0)
  const selectedOccupationId = ref<string | null>(null)
  const selectedOccupationName = ref<string>('')

  function reset() {
    sessionId.value = null
    storyId.value = null
    storyName.value = ''
    storyOverview.value = ''
    currentScene.value = ''
    cluesObtained.value = []
    messages.value = []
    kpMemory.value = []
    isInGame.value = false
    isSending.value = false
    gamePhase.value = 'story_selected'
    characterSheet.value = null
    selectedOccupationId.value = null
    selectedOccupationName.value = ''
  }

  function setOccupation(occupationId: string, occupationName: string) {
    selectedOccupationId.value = occupationId
    selectedOccupationName.value = occupationName
    gamePhase.value = 'occupation_selected'
  }

  /** Start a game with an indexed story (fetches overview from RAG). */
  async function startGame(opts: { storyId: string; storyName?: string; name?: string }) {
    reset()
    storyId.value = opts.storyId
    storyName.value = opts.storyName || opts.storyId
    sessionId.value = 'sess_' + Date.now()
    if (opts.name) playerName.value = opts.name
    try {
      const overview = await getStoryOverview(opts.storyId, 15)
      storyOverview.value = overview.overview
      if (overview.storyName) storyName.value = overview.storyName
    } catch { /* proceed without overview */ }
    gamePhase.value = 'story_selected'
  }

  function setPhase(phase: GamePhase) {
    gamePhase.value = phase
  }

  function setCharacterSheet(sheet: COCCharacterSheet | null) {
    characterSheet.value = sheet
    if (sheet) playerName.value = sheet.playerName
  }

  function confirmCharacterAndEnterGame() {
    if (!characterSheet.value) return
    gamePhase.value = 'playing'
    isInGame.value = true
  }

  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  function insertMessagesBeforeLast(msgs: Message[]) {
    if (msgs.length === 0) return
    const last = messages.value.pop()
    for (const m of msgs) messages.value.push(m)
    if (last) messages.value.push(last)
  }

  function addClue(description: string) {
    if (!cluesObtained.value.includes(description)) cluesObtained.value.push(description)
  }

  function transitionToScene(sceneName: string) {
    currentScene.value = sceneName
  }

  function updateCharacterHP(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newHp = Math.max(0, Math.min(c.derived.hpMax, c.derived.hp + delta))
    characterSheet.value = { ...c, derived: { ...c.derived, hp: newHp } }
    derivedStatsVersion.value += 1
  }

  function updateCharacterMP(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newMp = Math.max(0, Math.min(c.derived.mpMax, c.derived.mp + delta))
    characterSheet.value = { ...c, derived: { ...c.derived, mp: newMp } }
    derivedStatsVersion.value += 1
  }

  function updateCharacterSAN(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newSan = Math.max(0, Math.min(c.derived.sanMax, c.derived.san + delta))
    characterSheet.value = { ...c, derived: { ...c.derived, san: newSan } }
    derivedStatsVersion.value += 1
  }

  function updateCharacterSkill(skillId: string, newValue: number) {
    const c = characterSheet.value
    if (!c?.skills) return
    c.skills[skillId] = Math.max(0, Math.min(99, newValue))
  }

  function updateLastMessage(updater: (m: Message) => void) {
    const last = messages.value[messages.value.length - 1]
    if (last) updater(last)
  }

  /** Build character status context (always available without RAG). */
  function buildCharacterContext(): string {
    const parts: string[] = []
    const char = characterSheet.value
    if (char) {
      const d = char.derived ?? { hp: 0, hpMax: 0, mp: 0, mpMax: 0, san: 0, sanMax: 0 }
      parts.push(`## 调查员: ${char.playerName} (${char.occupationName})`)
      parts.push(`HP ${d.hp}/${d.hpMax} MP ${d.mp}/${d.mpMax} SAN ${d.san}/${d.sanMax}`)
      parts.push(`属性: STR ${char.attributes.str} CON ${char.attributes.con} SIZ ${char.attributes.siz} DEX ${char.attributes.dex} APP ${char.attributes.app} INT ${char.attributes.int} POW ${char.attributes.pow} EDU ${char.attributes.edu} Luck ${char.attributes.luck}`)
      const skillLines = Object.entries(char.skills)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${getSkillName(k)}: ${v}%`)
      if (skillLines.length) parts.push('技能: ' + skillLines.join(', '))
    }
    if (storyName.value) parts.push(`\n## 故事: ${storyName.value}`)
    if (currentScene.value) parts.push(`当前场景: ${currentScene.value}`)
    if (cluesObtained.value.length) {
      parts.push('\n### 已获线索')
      for (const desc of cluesObtained.value) parts.push(`- ${desc}`)
    }
    return parts.join('\n')
  }

  type AiConfig = { provider: string; model?: string; baseUrl?: string; apiKey?: string; temperature?: number; maxTokens?: number }
  type ToolCall = { id: string; name: string; arguments: string }

  const BASE_INSTRUCTIONS = [
    '你是克苏鲁的呼唤第七版（COC 7th）的守密人（Keeper/KP）。',
    '你的所有故事知识来源于「故事情报」中检索到的原文片段。请严格基于这些片段进行叙事，不要凭空编造场景或 NPC。',
    '保持洛夫克拉夫特式的恐怖氛围。',
    '',
    '【严禁事项 — 违反将导致系统错误】',
    '- 绝对禁止在文字中自行编造骰子结果（如"d100: 45"、"投骰 1d8 = 4"等）。',
    '- 绝对禁止在文字中自行声称 HP/MP/SAN 变化（如"HP 降至 4"、"损失 3 SAN"等）。',
    '- 所有检定、投骰、数值变更必须且只能通过调用工具函数实现。',
    '- 工具返回结果后，你才能在叙事中提及结果。',
    '',
    '【检定规则】',
    '- 仅在有戏剧性冲突、不确定性或危险时才要求检定。日常/职业常规行动自动成功。',
    '- 需要检定时 → 调用 skill_check 工具（参数：技能名、技能值、难度）。',
    '- 遭遇恐怖事物时 → 调用 san_check 工具。',
    '- 失败 ≠ 完全失败：可以是部分成功、挫折或情况改变。',
    '- 检定失败后可提供"孤注一掷"选项（SAN检定和战斗检定除外）。',
    '',
    '【战斗规则 — 必须调用工具链】',
    '- 攻击: 调用 skill_check → 命中后调用 roll_dice → 最后调用 adjust_hp',
    '- NPC 攻击玩家时同样必须完整调用工具链',
    '- 禁止跳过任何步骤，禁止在文字中自编伤害数字',
    '',
    '【线索传递】',
    '- 显明线索：不需检定，直接调用 grant_clue 工具。',
    '- 隐秘线索：需要检定成功后才调用 grant_clue。',
    '- 绝不让单一线索成为唯一推进路径。',
    '',
    '【场景管理】',
    '- 当调查员移动到新地点时，调用 transition_scene 工具。',
    '- 场景名称来自故事原文，不要自行创造故事中不存在的地点。',
    '- 若调查员想去的地方在故事情报中没有提及，告知该处无事可做并引导回到故事主线。',
    '',
    '【叙事原则】',
    '- 描述证据而非结论（"地毯上有泥泞脚印" 而非 "有人闯入"）',
    '- 少即是多：暗示恐怖而非完全揭示',
    '- 使用全部感官（视觉、听觉、嗅觉、触觉）',
    '- 致命遭遇前给予至少两次警告暗示',
    '- 已叙述过的内容不要用相同措辞重复',
  ].join('\n')

  /** Parse a dice expression like "1d6", "2d6", or a plain number. */
  function parseDiceExpr(expr: string): number {
    const s = String(expr).trim().toLowerCase()
    const match = s.match(/^(\d+)?d(\d+)$/)
    if (match) {
      const count = Math.max(1, Math.min(10, parseInt(match[1] || '1', 10)))
      const sides = Math.max(1, Math.min(100, parseInt(match[2]!, 10)))
      let total = 0
      for (let i = 0; i < count; i++) total += rollD(sides)
      return total
    }
    return Math.max(0, Math.floor(Number(s)) || 0)
  }

  function resolveSkillCheck(roll: number, skillValue: number, difficulty: string): { threshold: number; result: string } {
    const regular = skillValue
    const hard = Math.floor(skillValue / 2)
    const extreme = Math.floor(skillValue / 5)
    const threshold = difficulty === 'extreme' ? extreme : difficulty === 'hard' ? hard : regular
    const isFumble = skillValue < 50 ? roll >= 96 : roll === 100
    if (roll === 1) return { threshold, result: 'critical_success' }
    if (isFumble) return { threshold, result: 'fumble' }
    if (roll <= extreme) return { threshold, result: 'extreme_success' }
    if (roll <= hard) return { threshold, result: 'hard_success' }
    if (roll <= regular) return { threshold, result: 'regular_success' }
    return { threshold, result: 'failure' }
  }

  const SKILL_CHECK_RESULT_TEXT: Record<string, string> = {
    critical_success: '大成功',
    extreme_success: '极难成功',
    hard_success: '困难成功',
    regular_success: '成功',
    failure: '失败',
    fumble: '大失败',
  }

  function processToolCalls(toolCalls: ToolCall[]): { toolResults: { role: 'tool'; tool_call_id: string; content: string }[]; displayMessages: Message[] } {
    const toolResults: { role: 'tool'; tool_call_id: string; content: string }[] = []
    const displayMessages: Message[] = []
    for (const tc of toolCalls) {
      let result = 'ok'
      try {
        const args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>

        if (tc.name === 'skill_check') {
          const skillName = String(args.skillName ?? '未知')
          const skillValue = Math.max(0, Math.min(99, Math.floor(Number(args.skillValue ?? 50))))
          const difficulty = String(args.difficulty ?? 'regular')
          const roll = rollD(100)
          const { threshold, result: checkResult } = resolveSkillCheck(roll, skillValue, difficulty)
          const isSuccess = ['critical_success', 'extreme_success', 'hard_success', 'regular_success'].includes(checkResult)
          result = JSON.stringify({ roll, threshold, skillName, skillValue, difficulty, result: checkResult, success: isSuccess })
          const diffLabel = difficulty === 'extreme' ? '极难' : difficulty === 'hard' ? '困难' : '常规'
          displayMessages.push({
            id: generateId(), timestamp: Date.now(), role: 'system', type: 'dice',
            content: `${skillName}检定(${diffLabel}) d100: ${roll} / 目标≤${threshold} → ${SKILL_CHECK_RESULT_TEXT[checkResult] ?? checkResult}`,
            result: { roll, target: threshold },
          })
        } else if (tc.name === 'san_check') {
          const currentSan = Math.max(0, Math.min(99, Math.floor(Number(args.currentSan ?? 50))))
          const successLossExpr = String(args.successLoss ?? '0')
          const failureLossExpr = String(args.failureLoss ?? '1d6')
          const roll = rollD(100)
          const passed = roll <= currentSan
          const isFumble = roll === 100
          const lossExpr = passed ? successLossExpr : failureLossExpr
          let sanLost = isFumble ? 0 : parseDiceExpr(lossExpr)
          if (isFumble) {
            const m = failureLossExpr.match(/^(\d+)?d(\d+)$/)
            sanLost = m ? parseInt(m[1] || '1', 10) * parseInt(m[2]!, 10) : parseDiceExpr(failureLossExpr)
          }
          updateCharacterSAN(-sanLost)
          result = JSON.stringify({ roll, currentSan, passed, isFumble, sanLost, lossExpression: lossExpr })
          const statusText = isFumble ? '大失败' : passed ? '成功' : '失败'
          displayMessages.push({
            id: generateId(), timestamp: Date.now(), role: 'system', type: 'dice',
            content: `SAN检定 d100: ${roll} / 目标≤${currentSan} → ${statusText}，损失 ${sanLost} SAN`,
            result: { roll, target: currentSan },
          })
          if (sanLost > 0) {
            displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `SAN -${sanLost}` })
          }
        } else if (tc.name === 'roll_dice') {
          const sides = Math.max(2, Math.min(1000, Math.floor(Number(args.sides ?? 100)) || 100))
          const roll = rollD(sides)
          result = JSON.stringify({ roll, sides })
          displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', type: 'dice', content: `投骰 d${sides}: ${roll}`, result: { roll, target: sides } })
        } else if (tc.name === 'adjust_hp') {
          const delta = Number(args.delta ?? 0)
          updateCharacterHP(delta)
          result = `HP adjusted by ${delta}`
          displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `HP +${delta}` : `HP ${delta}` })
        } else if (tc.name === 'adjust_san') {
          const delta = Number(args.delta ?? 0)
          updateCharacterSAN(delta)
          result = `SAN adjusted by ${delta}`
          displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `SAN +${delta}` : `SAN ${delta}` })
        } else if (tc.name === 'adjust_mp') {
          const delta = Number(args.delta ?? 0)
          updateCharacterMP(delta)
          result = `MP adjusted by ${delta}`
          displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `MP +${delta}` : `MP ${delta}` })
        } else if (tc.name === 'transition_scene') {
          const sceneName = String(args.sceneName ?? '')
          if (sceneName) {
            transitionToScene(sceneName)
            result = `Scene transitioned to: ${sceneName}`
            displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `场景切换: ${sceneName}` })
          } else result = 'error: sceneName required'
        } else if (tc.name === 'grant_clue') {
          const description = String(args.description ?? '')
          if (description) {
            addClue(description)
            result = `Clue granted: ${description}`
            displayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `获得线索: ${description}` })
          } else result = 'error: description required'
        }
      } catch { result = 'error' }
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result })
    }
    return { toolResults, displayMessages }
  }

  async function kpInvokeOnce(
    msgs: unknown[],
    aiConfig: AiConfig,
    onDelta?: (chunk: string) => void,
  ): Promise<{ content?: string; toolCalls?: ToolCall[] }> {
    const api = (window as unknown as {
      electronAPI?: {
        kpInvoke?: (p: unknown) => Promise<{ content?: string; toolCalls?: ToolCall[] }>
        kpInvokeStream?: (p: unknown) => Promise<{ streamId: string }>
        onKpStream?: (handler: (payload: { streamId: string; type: 'chunk' | 'end' | 'error'; chunk?: string; content?: string; toolCalls?: ToolCall[]; error?: string }) => void) => () => void
      }
    }).electronAPI

    if (api?.kpInvokeStream && api?.onKpStream) {
      const kpStream = api.kpInvokeStream
      const onStream = api.onKpStream
      const { streamId } = await kpStream({
        messages: msgs, provider: aiConfig.provider, model: aiConfig.model,
        baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey, temperature: aiConfig.temperature, maxTokens: aiConfig.maxTokens,
      })
      return await new Promise((resolve, reject) => {
        let streamed = ''
        const off = onStream((payload) => {
          if (!payload || payload.streamId !== streamId) return
          if (payload.type === 'chunk' && payload.chunk) { streamed += payload.chunk; onDelta?.(payload.chunk) }
          else if (payload.type === 'end') { off(); resolve({ content: payload.content ?? streamed, toolCalls: payload.toolCalls }) }
          else if (payload.type === 'error') { off(); reject(new Error(payload.error || 'KP stream error')) }
        })
      })
    }

    if (!api?.kpInvoke) throw new Error('No KP API')
    return await api.kpInvoke({
      messages: msgs, provider: aiConfig.provider, model: aiConfig.model,
      baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey, temperature: aiConfig.temperature, maxTokens: aiConfig.maxTokens,
    })
  }

  async function runKpAgentLoop(chatMessages: unknown[], aiConfig: AiConfig): Promise<string> {
    let fullContent = ''
    let msgs: unknown[] = chatMessages
    const MAX_TOOL_ITERATIONS = 8
    for (let loop = 0; loop < MAX_TOOL_ITERATIONS; loop++) {
      const base = fullContent
      let iter = ''
      const r = await kpInvokeOnce(msgs, aiConfig, (chunk) => {
        iter += chunk
        const preview = (base ? base + '\n\n' : '') + iter
        updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) })
      })

      const endContent = r?.content
      const iterFinal = (endContent !== undefined && endContent !== null ? endContent : iter) || ''
      if (iterFinal.trim()) {
        fullContent = base ? (base + '\n\n' + iterFinal) : iterFinal
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })

      if (!r?.toolCalls?.length) break
      const { toolResults, displayMessages } = processToolCalls(r.toolCalls)
      insertMessagesBeforeLast(displayMessages)
      msgs = [
        ...msgs,
        { role: 'assistant' as const, content: iterFinal, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: t.arguments } })) },
        ...toolResults,
      ]
    }

    if (!fullContent.trim()) {
      fullContent = '守密人正在思考……请稍候再试，或换一种方式描述你的行动。'
      updateLastMessage((m) => { if (m.role === 'kp') m.content = fullContent })
    }

    return fullContent
  }

  async function runDirectChat(chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig: AiConfig): Promise<string> {
    let fullContent = ''
    const result = await chat(aiConfig, { messages: chatMessages, stream: true })
    if (isStreamResponse(result)) {
      for await (const chunk of result) {
        fullContent += chunk
        updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
      }
    } else {
      fullContent = result.content ?? ''
      updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
    }
    return fullContent
  }

  function hasKpAgent(): boolean {
    return !!(window as unknown as { electronAPI?: { kpInvoke?: unknown } }).electronAPI?.kpInvoke
  }

  async function fetchRagContext(query: string): Promise<string> {
    if (!storyId.value) return ''
    try {
      const ctxRes = await getContext({ query, scriptId: storyId.value, topK: 8 })
      return ctxRes.context
    } catch { return '' }
  }

  async function requestOpening() {
    if (gamePhase.value !== 'playing' || !characterSheet.value || !storyId.value || messages.value.length > 0 || isSending.value) return
    isSending.value = true
    addMessage({ id: generateId(), timestamp: Date.now(), role: 'kp', content: '', isStreaming: true })
    try {
      const settingsStore = useSettingsStore()
      const aiConfig = settingsStore.aiConfig
      if (!aiConfig?.model) throw new Error('请先在设置中刷新模型列表并选择模型')

      const ragContext = await fetchRagContext('开场 故事背景 场景描述 第一幕')
      const charContext = buildCharacterContext()
      const memoryBlock = buildMemoryBlock(kpMemory.value)
      const overviewBlock = storyOverview.value ? `\n## 故事概要\n${storyOverview.value}\n` : ''
      const ragBlock = ragContext ? `\n## 故事情报\n${ragContext}\n` : ''
      const systemPrompt = `${BASE_INSTRUCTIONS}${memoryBlock}${overviewBlock}${ragBlock}\n## 当前状态\n${charContext}\n\n请根据故事情报，向调查员做开场白，描述他们所处的场景，营造神秘与悬疑氛围。`
      const chatMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请开始游戏，向调查员做开场白。' }]

      const fullContent = hasKpAgent()
        ? await runKpAgentLoop(chatMessages, aiConfig)
        : await runDirectChat(chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig)

      if (fullContent.trim()) {
        kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.isStreaming = false })
    } catch (e) {
      updateLastMessage((m) => {
        if (m.role === 'kp') { m.content = '[开场生成失败: ' + (e instanceof Error ? e.message : String(e)) + ']'; m.isStreaming = false }
      })
    } finally { isSending.value = false }
  }

  async function sendPlayerMessage(content: string) {
    if (!content.trim() || isSending.value) return
    addMessage({ id: generateId(), timestamp: Date.now(), role: 'player', playerName: playerName.value, content: content.trim() })
    isSending.value = true
    addMessage({ id: generateId(), timestamp: Date.now(), role: 'kp', content: '', isStreaming: true })

    try {
      const settingsStore = useSettingsStore()
      const aiConfig = settingsStore.aiConfig
      if (!aiConfig?.model) throw new Error('请先在设置中刷新模型列表并选择模型')

      const ragContext = await fetchRagContext(content)
      const charContext = buildCharacterContext()
      const memoryBlock = buildMemoryBlock(kpMemory.value)
      const ragBlock = ragContext ? `\n## 故事情报\n${ragContext}` : ''
      const systemPrompt = `${BASE_INSTRUCTIONS}${memoryBlock}${ragBlock}\n\n## 当前状态\n${charContext}`

      const conv = messages.value
        .filter((m) => (m.role === 'kp' || m.role === 'player') && !(m.role === 'kp' && (m as { isStreaming?: boolean }).isStreaming))
        .slice(-18)
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...conv.map((m) => ({
          role: m.role === 'player' ? 'user' as const : 'assistant' as const,
          content: m.role === 'player' ? `[${m.playerName}] ${m.content}` : m.content,
        })),
      ]

      const fullContent = hasKpAgent()
        ? await runKpAgentLoop(chatMessages, aiConfig)
        : await runDirectChat(chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig)

      if (fullContent.trim()) {
        kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.isStreaming = false })
    } catch (e) {
      updateLastMessage((m) => {
        if (m.role === 'kp') { m.content = '[错误: ' + (e instanceof Error ? e.message : String(e)) + ']'; m.isStreaming = false }
      })
    } finally { isSending.value = false }
  }

  return {
    sessionId,
    storyId,
    storyName,
    currentScene,
    cluesObtained,
    messages,
    isInGame,
    isSending,
    playerName,
    gamePhase,
    characterSheet,
    derivedStatsVersion,
    reset,
    startGame,
    setPhase,
    setCharacterSheet,
    setOccupation,
    selectedOccupationId,
    selectedOccupationName,
    confirmCharacterAndEnterGame,
    addMessage,
    addClue,
    transitionToScene,
    updateCharacterHP,
    updateCharacterMP,
    updateCharacterSAN,
    updateCharacterSkill,
    requestOpening,
    sendPlayerMessage,
  }
})
