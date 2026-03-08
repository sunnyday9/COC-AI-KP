import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types/game'
import type { GamePhase, COCCharacterSheet } from '../types/character'
import type { StoryContext } from '../types/storyContext'
import { getContext, addUserGraphEvent, syncUserGraphFromState, getUserGraphSummary } from '../services/ragService'
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
import { summarizeLongTerm } from '../services/memoryService'
import { buildToolContext } from '../services/toolContextFactory'
import { buildOpeningPrompt, buildTurnPrompt, buildCharacterContext, buildMemoryBlock, buildRecentTurnsBlock, type PromptState } from '../services/kpPromptService'
import { SAVE_VERSION, writeSaveSnapshot, readSaveSnapshot, listSaveIds, readSaveMeta } from '../services/saveService'

function generateId(): string {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

/** Run long-term summarization every N player turns. */
const LONG_TERM_SUMMARY_EVERY_N_TURNS = 10
/** Number of recent messages to include in long-term summarization input. */
const SUMMARIZE_RECENT_MESSAGES = 20

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

function toPromptState(): PromptState {
  return {
    storyName: storyName.value,
    currentScene: currentScene.value,
    cluesObtained: cluesObtained.value,
    messages: messages.value,
    kpMemory: kpMemory.value,
    longTermSummary: longTermSummary.value,
    playerName: playerName.value,
    characterSheet: characterSheet.value,
  }
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
  /** Long-term session summary (key events, scenes, clues); updated on scene change / periodically. */
  const longTermSummary = ref<string>('')
  /** Optional discrete facts (e.g. clues learned) for long-term context. */
  const longTermFacts = ref<string[]>([])
  /** Number of player messages sent this session (for periodic long-term summarization). */
  const playerTurnCount = ref(0)
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
    longTermSummary.value = ''
    longTermFacts.value = []
    playerTurnCount.value = 0
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

  /** Start a game with an indexed story. */
  async function startGame(opts: { storyId: string; storyName?: string; name?: string }) {
    reset()
    storyId.value = opts.storyId
    storyName.value = opts.storyName || opts.storyId
    sessionId.value = 'sess_' + Date.now()
    if (opts.name) playerName.value = opts.name
    // Anti-spoiler: do not preload a full-story "overview" into prompts.
    // Opening context will be retrieved dynamically by RAG per scene/turn.
    storyOverview.value = ''
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
    if (storyId.value && sessionId.value) {
      addUserGraphEvent({
        storyId: storyId.value,
        sessionId: sessionId.value,
        event: { type: 'clue', name: description },
      }).catch(() => {})
    }
  }

  function transitionToScene(sceneName: string) {
    currentScene.value = sceneName
    if (storyId.value && sessionId.value) {
      addUserGraphEvent({
        storyId: storyId.value,
        sessionId: sessionId.value,
        event: { type: 'scene', name: sceneName },
      }).catch(() => {})
    }
    runLongTermSummarization()
  }

  /** Build recent conversation text for long-term summarization (fire-and-forget). */
  function runLongTermSummarization() {
    const settingsStore = useSettingsStore()
    const aiConfig = settingsStore.aiConfig
    if (!aiConfig?.model) return
    const recent = messages.value
      .filter((m): m is Message => m.role === 'player' || m.role === 'kp')
      .slice(-SUMMARIZE_RECENT_MESSAGES)
    const recentText = recent
      .map((m) => (m.role === 'player' ? `玩家: ${'content' in m ? m.content : ''}` : `守密人: ${'content' in m ? m.content : ''}`))
      .join('\n')
    if (!recentText.trim()) return
    const current = longTermSummary.value
    const sc = buildStoryContext()
    const storyContextText = sc
      ? [
          sc.sceneName ? `场景: ${sc.sceneName}` : '',
          sc.act ? `幕次/阶段: ${sc.act}` : '',
          sc.sanity?.currentSan != null ? `SAN: ${sc.sanity.currentSan}` : '',
          sc.sanity?.dailySanLoss != null ? `当日SAN损失: ${sc.sanity.dailySanLoss}` : '',
          cluesObtained.value.length ? `已获得线索: ${cluesObtained.value.slice(0, 12).join('；')}` : '',
        ].filter(Boolean).join('\n')
      : ''
    const sid = storyId.value
    const sessId = sessionId.value
    const ragQuery = [currentScene.value, ...cluesObtained.value.slice(0, 5)].filter(Boolean).join(' ') || '当前场景 已获线索 调查进展'
    Promise.all([
      sid ? getContext({ query: ragQuery, scriptId: sid, sceneId: currentScene.value || undefined, topK: 5 }) : Promise.resolve({ context: '' }),
      sid && sessId ? getUserGraphSummary(sid, sessId) : Promise.resolve(''),
    ])
      .then(([ctxRes, userGraphSummary]) => {
        const ragContextText = ctxRes?.context || ''
        return summarizeLongTerm(aiConfig, {
          recentMessagesText: recentText,
          currentSummary: current,
          storyContextText,
          ragContextText,
          userGraphSummary: userGraphSummary || '',
        })
      })
      .then((next) => {
        if (next) longTermSummary.value = next
      })
      .catch(() => { /* fire-and-forget; avoid unhandled rejection */ })
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
    const nextSkills = { ...c.skills, [skillId]: Math.max(0, Math.min(99, newValue)) }
    characterSheet.value = { ...c, skills: nextSkills }
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

  function buildCharacterContext(): string {
    return buildCharacterContext(toPromptState())
  }

  type ToolCall = { id: string; name: string; arguments: string }

  function processToolCalls(toolCalls: ToolCall[]): { toolResults: { role: 'tool'; tool_call_id: string; content: string }[]; displayMessages: Message[] } {
    if (storyId.value && sessionId.value) {
      for (const tc of toolCalls) {
        try {
          const args = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {}
          if (tc.name === 'skill_check') {
            addUserGraphEvent({
              storyId: storyId.value,
              sessionId: sessionId.value,
              event: { type: 'action', name: `技能检定: ${String(args.skillName ?? '未知')}`, description: String(args.result ?? '') },
            }).catch(() => {})
          } else if (tc.name === 'san_check') {
            addUserGraphEvent({
              storyId: storyId.value,
              sessionId: sessionId.value,
              event: { type: 'action', name: 'SAN检定', description: String(args.sanLost ?? '') },
            }).catch(() => {})
          } else if (tc.name === 'melee_attack' || tc.name === 'ranged_attack') {
            addUserGraphEvent({
              storyId: storyId.value,
              sessionId: sessionId.value,
              event: { type: 'action', name: tc.name === 'melee_attack' ? '近战攻击' : '远程攻击', description: '' },
            }).catch(() => {})
          }
        } catch { /* ignore parse errors */ }
      }
    }
    const ctx = buildToolContext({
      characterSheet: characterSheet.value,
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
    })
    return processToolCallsOrchestrator(toolCalls, ctx)
  }

  function buildStoryContext(): StoryContext | null {
    const scene = currentScene.value?.trim()
    const ctx: StoryContext = {}
    if (scene) {
      ctx.sceneId = scene
      ctx.sceneName = scene
      ctx.sceneType = 'investigation'
    }
    if (characterSheet.value) {
      const c = characterSheet.value
      const san = c.derived?.san
      const dailySanLoss = c.dailySanLoss ?? 0
      ctx.sanity = {
        currentSan: typeof san === 'number' ? san : undefined,
        dailySanLoss: dailySanLoss > 0 ? dailySanLoss : undefined,
      }
    }
    if (Object.keys(ctx).length === 0) return null
    return ctx
  }

  async function fetchRagContext(query: string): Promise<string> {
    if (!storyId.value) return ''
    try {
      const [ctxRes, userSummary] = await Promise.all([
        getContext({
          query,
          scriptId: storyId.value,
          sceneId: currentScene.value?.trim() || undefined,
          topK: 8,
        }),
        sessionId.value ? getUserGraphSummary(storyId.value, sessionId.value) : Promise.resolve(''),
      ])
      let ctx = ctxRes?.context || ''
      if (userSummary?.trim()) {
        ctx += (ctx ? '\n\n' : '') + '## 调查员行动记录\n' + userSummary.trim()
      }
      return ctx
    } catch { return '' }
  }

  async function saveGame(saveId: string, displayName?: string): Promise<void> {
    await writeSaveSnapshot(saveId, displayName, {
      storyId: storyId.value,
      storyName: storyName.value,
      storyOverview: storyOverview.value,
      currentScene: currentScene.value,
      cluesObtained: cluesObtained.value,
      messages: messages.value,
      kpMemory: kpMemory.value,
      longTermSummary: longTermSummary.value,
      longTermFacts: longTermFacts.value,
      playerTurnCount: playerTurnCount.value,
      gamePhase: gamePhase.value,
      characterSheet: characterSheet.value,
      playerName: playerName.value,
      selectedOccupationId: selectedOccupationId.value,
      selectedOccupationName: selectedOccupationName.value,
      sessionId: sessionId.value,
    })
  }

  async function loadGame(saveId: string): Promise<void> {
    const data = await readSaveSnapshot(saveId)
    const v = data.version as number | undefined
    if (v !== SAVE_VERSION) {
      longTermSummary.value = ''
      longTermFacts.value = []
      playerTurnCount.value = 0
    }
    if (typeof data.storyId === 'string') storyId.value = data.storyId
    if (typeof data.storyName === 'string') storyName.value = data.storyName
    if (typeof data.storyOverview === 'string') storyOverview.value = data.storyOverview
    if (typeof data.currentScene === 'string') currentScene.value = data.currentScene
    if (Array.isArray(data.cluesObtained)) cluesObtained.value = data.cluesObtained as string[]
    if (Array.isArray(data.messages)) messages.value = data.messages as Message[]
    if (Array.isArray(data.kpMemory)) kpMemory.value = data.kpMemory as string[]
    if (v === SAVE_VERSION) {
      if (typeof data.longTermSummary === 'string') longTermSummary.value = data.longTermSummary
      if (Array.isArray(data.longTermFacts)) longTermFacts.value = data.longTermFacts as string[]
      if (typeof data.playerTurnCount === 'number') playerTurnCount.value = data.playerTurnCount
    }
    if (typeof data.gamePhase === 'string') gamePhase.value = data.gamePhase as GamePhase
    if (data.characterSheet != null) characterSheet.value = data.characterSheet as COCCharacterSheet | null
    if (typeof data.playerName === 'string') playerName.value = data.playerName
    if (typeof data.selectedOccupationId === 'string') selectedOccupationId.value = data.selectedOccupationId
    if (typeof data.selectedOccupationName === 'string') selectedOccupationName.value = data.selectedOccupationName
    if (typeof data.sessionId === 'string') sessionId.value = data.sessionId
    isInGame.value = true
    if (storyId.value && sessionId.value) {
      syncUserGraphFromState({
        storyId: storyId.value,
        sessionId: sessionId.value,
        state: { cluesObtained: cluesObtained.value, currentScene: currentScene.value },
      }).catch(() => {})
    }
  }

  async function listSaves(): Promise<string[]> {
    return await listSaveIds()
  }

  async function getSaveMeta(saveId: string): Promise<{ name?: string; storyName?: string } | null> {
    return await readSaveMeta(saveId)
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
      const { chatMessages } = buildOpeningPrompt(toPromptState(), ragContext)

      const fullContent = hasKpAgent()
        ? await runKpAgentLoopService(chatMessages, aiConfig, {
            processToolCalls,
            onStreamChunk: (preview) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) }),
            insertMessagesBeforeLast: (msgs) => insertMessagesBeforeLast(msgs as Message[]),
            getStoryContext: buildStoryContext,
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
    playerTurnCount.value += 1
    isSending.value = true
    addMessage({ id: generateId(), timestamp: Date.now(), role: 'kp', content: '', isStreaming: true })

    try {
      const settingsStore = useSettingsStore()
      const aiConfig = settingsStore.aiConfig
      if (!aiConfig?.model) throw new Error('请先在设置中刷新模型列表并选择模型')

      const ragContext = await fetchRagContext(content)
      const { chatMessages } = buildTurnPrompt(toPromptState(), ragContext)

      const fullContent = hasKpAgent()
        ? await runKpAgentLoopService(chatMessages, aiConfig, {
            processToolCalls,
            onStreamChunk: (preview) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) }),
            insertMessagesBeforeLast: (msgs) => insertMessagesBeforeLast(msgs as Message[]),
            getStoryContext: buildStoryContext,
          })
        : await runDirectChatService(chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], aiConfig, {
            onStreamChunk: (c) => updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(c) }),
          })

      if (fullContent.trim()) {
        kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.isStreaming = false })
      if (playerTurnCount.value >= LONG_TERM_SUMMARY_EVERY_N_TURNS && playerTurnCount.value % LONG_TERM_SUMMARY_EVERY_N_TURNS === 0) {
        runLongTermSummarization()
      }
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
    storyOverview,
    currentScene,
    cluesObtained,
    messages,
    kpMemory,
    longTermSummary,
    longTermFacts,
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
    saveGame,
    loadGame,
    listSaves,
    getSaveMeta,
  }
})
