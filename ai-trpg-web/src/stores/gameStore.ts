import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types/game'
import type { GamePhase, COCCharacterSheet } from '../types/character'
import { getContext, getStoryOverview } from '../services/ragService'
import {
  hasKpAgent,
  runKpAgentLoop as runKpAgentLoopService,
  runDirectChat as runDirectChatService,
} from '../services/kpSessionService'
import {
  resolveSkillCheck as resolveSkillCheckRule,
  SUCCESS_LEVEL_RANK as SUCCESS_LEVEL_RANK_RULE,
  SKILL_CHECK_RESULT_TEXT as SKILL_CHECK_RESULT_TEXT_RULE,
} from '../logic/coc7Rules'
import { rollD } from '../services/diceService'
import { getSkillName } from '../data/coc7'
import { useSettingsStore } from './settingsStore'
import { processToolCalls as processToolCallsOrchestrator } from '../toolCalling'
import type { ToolHandlerContext } from '../toolCalling'

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

  function updateCharacterLuck(delta: number) {
    const c = characterSheet.value
    if (!c?.attributes) return
    const newLuck = Math.max(0, Math.min(99, c.attributes.luck + delta))
    characterSheet.value = { ...c, attributes: { ...c.attributes, luck: newLuck } }
    derivedStatsVersion.value += 1
  }

  /** P0 疯狂：当日累计 SAN 损失（san_check 后调用） */
  function addCharacterDailySanLoss(amount: number) {
    const c = characterSheet.value
    if (!c) return
    const prev = c.dailySanLoss ?? 0
    characterSheet.value = { ...c, dailySanLoss: prev + amount }
    derivedStatsVersion.value += 1
  }

  /** P0 疯狂：重置当日 SAN 损失（新一天时由 KP 或规则触发） */
  function resetCharacterDailySanLoss() {
    const c = characterSheet.value
    if (!c) return
    characterSheet.value = { ...c, dailySanLoss: 0 }
    derivedStatsVersion.value += 1
  }

  /** P0 疯狂：设置疯狂状态、恐惧症、躁狂症 */
  function updateCharacterInsanityState(state: 'normal' | 'temporary' | 'indefinite' | 'permanent', phobias?: string[], manias?: string[]) {
    const c = characterSheet.value
    if (!c) return
    const next: Record<string, unknown> = { ...c, insanityState: state }
    if (phobias !== undefined) next.phobias = phobias
    if (manias !== undefined) next.manias = manias
    characterSheet.value = next as typeof c
    derivedStatsVersion.value += 1
  }

  /** P0 战斗：设置重伤与濒死 */
  function setCharacterMajorWound(hasMajorWound: boolean) {
    const c = characterSheet.value
    if (!c) return
    characterSheet.value = { ...c, hasMajorWound }
    derivedStatsVersion.value += 1
  }

  function setCharacterDying(isDying: boolean) {
    const c = characterSheet.value
    if (!c) return
    characterSheet.value = { ...c, isDying }
    derivedStatsVersion.value += 1
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
      if (char.damageBonus != null || char.build != null) parts.push(`伤害加值: ${char.damageBonus ?? '-'} 体格: ${char.build ?? '-'}`)
      if (char.armor != null && char.armor > 0) parts.push(`护甲: ${char.armor}`)
      if (char.weapons?.length) parts.push('武器: ' + char.weapons.map((w) => w.name + (w.damage ? ` ${w.damage}` : '')).join(', '))
      if (char.insanityState && char.insanityState !== 'normal') parts.push(`疯狂状态: ${char.insanityState}`)
      if (char.phobias?.length) parts.push(`恐惧症: ${char.phobias.join(', ')}`)
      if (char.manias?.length) parts.push(`躁狂症: ${char.manias.join(', ')}`)
      if (char.hasMajorWound) parts.push('重伤')
      if (char.isDying) parts.push('濒死')
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
    '- 需要检定时 → 调用 skill_check 工具（参数：技能名、技能值、难度；可选 bonusDice/penaltyDice、isPush 孤注一掷）。',
    '- 遭遇恐怖事物时 → 调用 san_check 工具；若发生 SAN 损失，再视情况调用 trigger_insanity(sanLost, intValue) 判定永久/不定性/临时疯狂与发作。',
    '- 失败 ≠ 完全失败：可以是部分成功、挫折或情况改变。',
    '- 检定失败后可提供"孤注一掷"选项（SAN检定和战斗检定除外），再次调用 skill_check 时设 isPush: true。',
    '- 玩家可在技能检定后选择消耗幸运：调用 spend_luck(amount)，不可用于幸运/SAN/伤害骰。',
    '',
    '【战斗规则 — 必须调用工具链】',
    '- 近战：优先调用 melee_attack（一次完成对抗检定、伤害加值、护甲减免、重伤/濒死/即死）；或分步调用 opposed_check → roll_dice → adjust_hp → apply_major_wound。',
    '- 远程：优先调用 ranged_attack（一次完成命中检定、伤害、护甲、重伤/濒死/即死）；或分步 skill_check → roll_dice → adjust_hp → apply_major_wound。',
    '- NPC 攻击玩家时同样必须完整调用工具链。',
    '- 禁止跳过任何步骤，禁止在文字中自编伤害数字。',
    '',
    '【线索传递】',
    '- 显明线索：不需检定，直接调用 grant_clue 工具。',
    '- 隐秘线索：需要检定成功后才调用 grant_clue。',
    '- 绝不让单一线索成为唯一推进路径。',
    '',
    '【场景管理】',
    '- 新游戏日开始（如过夜、休息后）时，调用 reset_day 工具重置当日 SAN 损失，以便不定性疯狂判定正确。',
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

  /** Roll COC damage bonus: "-2"/"-1" -> fixed negative, "0"/"" -> 0, "+1D4"/"+2D6" -> roll dice. */
  function rollDamageBonus(db: string): number {
    const s = String(db ?? '0').trim().toUpperCase()
    if (s === '' || s === '0') return 0
    const neg = s.match(/^-(\d+)$/)
    if (neg) return -Math.min(2, parseInt(neg[1]!, 10))
    const plus = s.match(/^\+(\d+)?D(\d+)$/)
    if (plus) return parseDiceExpr((plus[1] || '1') + 'd' + plus[2])
    return 0
  }

  const resolveSkillCheck = resolveSkillCheckRule
  const SUCCESS_LEVEL_RANK = SUCCESS_LEVEL_RANK_RULE

  /** Roll d100 with optional bonus/penalty dice. COC: bonus = extra d10 for tens digit, take lower (better). Penalty = take higher. 00 = 100 (tens 0). */
  function rollD100WithModifiers(bonusDice: number, penaltyDice: number): number {
    const base = rollD(100)
    const net = Math.max(-2, Math.min(2, (bonusDice || 0) - (penaltyDice || 0)))
    if (net === 0) return base
    const tens = base === 100 ? 0 : Math.floor(base / 10)
    const ones = base === 100 ? 0 : base % 10
    if (net > 0) {
      let bestTens = tens
      for (let i = 0; i < net; i++) {
        const r = rollD(10)
        const t = r === 10 ? 0 : r
        if (t < bestTens) bestTens = t
      }
      return bestTens === 0 && ones === 0 ? 100 : bestTens * 10 + ones
    } else {
      let worstTens = tens
      for (let i = 0; i < -net; i++) {
        const r = rollD(10)
        const t = r === 10 ? 0 : r
        if (t > worstTens) worstTens = t
      }
      return worstTens === 0 && ones === 0 ? 100 : worstTens * 10 + ones
    }
  }

  const SKILL_CHECK_RESULT_TEXT = SKILL_CHECK_RESULT_TEXT_RULE

  function buildToolContext(): ToolHandlerContext {
    return {
      characterSheet: characterSheet.value,
      getSkillName,
      rollD,
      parseDiceExpr,
      rollD100WithModifiers,
      rollDamageBonus,
      resolveSkillCheck,
      SUCCESS_LEVEL_RANK,
      SKILL_CHECK_RESULT_TEXT,
      updateCharacterHP,
      updateCharacterMP,
      updateCharacterSAN,
      updateCharacterLuck,
      addCharacterDailySanLoss,
      resetCharacterDailySanLoss,
      updateCharacterInsanityState,
      setCharacterMajorWound,
      setCharacterDying,
      transitionToScene,
      addClue,
      generateId,
    }
  }

  function processToolCalls(toolCalls: ToolCall[]): { toolResults: { role: 'tool'; tool_call_id: string; content: string }[]; displayMessages: Message[] } {
    return processToolCallsOrchestrator(toolCalls, buildToolContext())
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
        ? await runKpAgentLoopService(chatMessages, aiConfig, {
            processToolCalls,
            onStreamChunk: (preview) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) }),
            insertMessagesBeforeLast: (msgs) => insertMessagesBeforeLast(msgs as Message[]),
          })
        : await runDirectChatService(chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig, {
            onStreamChunk: (c) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(c) }),
          })

      if (fullContent.trim()) {
        kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.isStreaming = false })
    } catch (e) {
      updateLastMessage((m) => {
        if (m.role === 'kp') {
          m.content = '[开场生成失败: ' + (e instanceof Error ? e.message : String(e)) + ']'
          m.isStreaming = false
        }
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
        ? await runKpAgentLoopService(chatMessages, aiConfig, {
            processToolCalls,
            onStreamChunk: (preview) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) }),
            insertMessagesBeforeLast: (msgs) => insertMessagesBeforeLast(msgs as Message[]),
          })
        : await runDirectChatService(chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig, {
            onStreamChunk: (c) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(c) }),
          })

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
    updateCharacterLuck,
    requestOpening,
    sendPlayerMessage,
  }
})
