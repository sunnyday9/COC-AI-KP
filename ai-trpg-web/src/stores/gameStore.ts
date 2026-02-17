import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types/game'
import type { TRPGScript } from '../types/script'
import type { GamePhase, COCCharacterSheet } from '../types/character'
import { chat, isStreamResponse } from '../services/ai'
import { getContext } from '../services/ragService'
import { rollD } from '../services/diceService'
import { getSkillName } from '../data/coc7'
import { useSettingsStore } from './settingsStore'

function generateId(): string {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

function pathToScriptId(path: string): string {
  const name = path.split(/[/\\]/).pop() || path
  return name.replace(/\.(json|jsonc)$/i, '') || 'script'
}

const MAX_MEMORY_ENTRIES = 8
const MAX_ENTRY_LEN = 280

/** 移除 KP 回复中可能泄露的内部提示（避免展示给玩家） */
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
  const scriptId = ref<string | null>(null)
  const script = ref<TRPGScript | null>(null)
  const currentSceneId = ref<string | null>(null)
  const cluesObtained = ref<string[]>([])
  const messages = ref<Message[]>([])
  /** 本局 KP 已说过的内容摘要，用于避免重复表述 */
  const kpMemory = ref<string[]>([])
  const isInGame = ref(false)
  const isSending = ref(false)
  const playerName = ref('调查员')

  /** 游戏流程阶段：选剧本 -> 选职业 -> 建卡 -> 进入游戏(AI KP) */
  const gamePhase = ref<GamePhase>('script_selected')
  const characterSheet = ref<COCCharacterSheet | null>(null)
  /** HP/MP/SAN 更新后递增，用于强制信息栏同步刷新 */
  const derivedStatsVersion = ref(0)
  /** 当前选中的职业（建卡页使用，纯逻辑无 AI） */
  const selectedOccupationId = ref<string | null>(null)
  const selectedOccupationName = ref<string>('')

  function reset() {
    sessionId.value = null
    scriptId.value = null
    script.value = null
    currentSceneId.value = null
    cluesObtained.value = []
    messages.value = []
    kpMemory.value = []
    isInGame.value = false
    isSending.value = false
    gamePhase.value = 'script_selected'
    characterSheet.value = null
    selectedOccupationId.value = null
    selectedOccupationName.value = ''
  }

  function setOccupation(occupationId: string, occupationName: string) {
    selectedOccupationId.value = occupationId
    selectedOccupationName.value = occupationName
    gamePhase.value = 'occupation_selected'
  }

  /** 仅加载剧本并进入「选职业」阶段，不使用 AI */
  async function startGame(opts: { scriptPath: string; name?: string }) {
    reset()
    const api = (window as { electronAPI?: { readScript: (p: string) => Promise<string> } }).electronAPI
    if (!api?.readScript) {
      scriptId.value = pathToScriptId(opts.scriptPath)
      sessionId.value = 'sess_' + Date.now()
      if (opts.name) playerName.value = opts.name
      gamePhase.value = 'script_selected'
      return
    }
    try {
      const content = await api.readScript(opts.scriptPath)
      const data = JSON.parse(content) as TRPGScript
      if (!data.meta || !data.scenes?.length) throw new Error('Invalid script')
      script.value = data
      scriptId.value = pathToScriptId(opts.scriptPath)
      currentSceneId.value = data.scenes[0]?.id ?? null
      sessionId.value = 'sess_' + Date.now()
      if (opts.name) playerName.value = opts.name
      gamePhase.value = 'script_selected'
    } catch {
      scriptId.value = pathToScriptId(opts.scriptPath)
      sessionId.value = 'sess_' + Date.now()
      gamePhase.value = 'script_selected'
    }
  }

  function setPhase(phase: GamePhase) {
    gamePhase.value = phase
  }

  function setCharacterSheet(sheet: COCCharacterSheet | null) {
    characterSheet.value = sheet
    if (sheet) playerName.value = sheet.playerName
  }

  /** 确认角色卡并进入游戏阶段（此后才使用 AI KP） */
  function confirmCharacterAndEnterGame() {
    if (!characterSheet.value) return
    gamePhase.value = 'playing'
    isInGame.value = true
  }

  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  /** Insert one or more messages immediately before the last message (e.g. before the current KP bubble). */
  function insertMessagesBeforeLast(msgs: Message[]) {
    if (msgs.length === 0) return
    const last = messages.value.pop()
    for (const m of msgs) messages.value.push(m)
    if (last) messages.value.push(last)
  }

  function addClue(clueId: string) {
    if (!cluesObtained.value.includes(clueId)) cluesObtained.value.push(clueId)
  }

  /** 场景转换：更新当前场景 ID */
  function transitionToScene(sceneId: string) {
    if (!script.value) return
    const targetScene = script.value.scenes.find((s) => s.id === sceneId)
    if (targetScene) {
      currentSceneId.value = sceneId
    }
  }

  /** 游戏中 HP 变化（支持负值扣除）；替换引用并 bump 版本以触发信息栏刷新 */
  function updateCharacterHP(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newHp = Math.max(0, Math.min(c.derived.hpMax, c.derived.hp + delta))
    characterSheet.value = {
      ...c,
      derived: { ...c.derived, hp: newHp },
    }
    derivedStatsVersion.value += 1
  }

  /** 游戏中 MP 变化；替换引用并 bump 版本以触发信息栏刷新 */
  function updateCharacterMP(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newMp = Math.max(0, Math.min(c.derived.mpMax, c.derived.mp + delta))
    characterSheet.value = {
      ...c,
      derived: { ...c.derived, mp: newMp },
    }
    derivedStatsVersion.value += 1
  }

  /** 游戏中 SAN 变化（理智损失/恢复）；替换引用并 bump 版本以触发信息栏刷新 */
  function updateCharacterSAN(delta: number) {
    const c = characterSheet.value
    if (!c?.derived) return
    const newSan = Math.max(0, Math.min(c.derived.sanMax, c.derived.san + delta))
    characterSheet.value = {
      ...c,
      derived: { ...c.derived, san: newSan },
    }
    derivedStatsVersion.value += 1
  }

  /** 游戏中技能成长 */
  function updateCharacterSkill(skillId: string, newValue: number) {
    const c = characterSheet.value
    if (!c?.skills) return
    c.skills[skillId] = Math.max(0, Math.min(99, newValue))
  }

  function updateLastMessage(updater: (m: Message) => void) {
    const last = messages.value[messages.value.length - 1]
    if (last) updater(last)
  }

  function buildSystemContext(_extraQuery?: string): string {
    const parts: string[] = []
    const s = script.value
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
    if (s) {
      parts.push(`\n## 剧本: ${s.meta.title}`)

      // 所有可用场景列表，用于约束 KP 不要随意创造剧本外场景
      if (s.scenes?.length) {
        parts.push('\n### 剧本场景列表（仅这些场景是合法地点）')
        for (const scn of s.scenes) {
          parts.push(`- ${scn.id}: ${scn.name}`)
        }
      }

      const scene = currentSceneId.value
        ? s.scenes.find((sc) => sc.id === currentSceneId.value)
        : s.scenes[0]
      if (scene) {
        parts.push(`\n### 当前场景: ${scene.name}\n${scene.description || ''}`)
        if (scene.transitionCondition) parts.push(`过渡条件: ${scene.transitionCondition}`)
      }
      if (cluesObtained.value.length) {
        parts.push('\n### 已获线索')
        for (const cid of cluesObtained.value) {
          const clue = 'clues' in s && s.clues ? s.clues.find((c: { id: string }) => c.id === cid) : undefined
          if (clue) parts.push(`- ${clue.description || cid}`)
        }
      }
      if (s.npcs?.length) {
        parts.push('\n### NPC')
        for (const n of s.npcs) {
          parts.push(`- ${n.name}: ${n.description || ''} ${n.dialogueStyle ? `(台词: ${n.dialogueStyle})` : ''}`)
        }
      }
    }
    return parts.join('\n')
  }

  /**
   * 调用 KP（支持流式）。当主进程支持 kpInvokeStream 时，会边生成边回传 chunk，
   * 以便前端逐步渲染；否则回退到普通 kpInvoke。
   */
  async function kpInvokeOnce(
    msgs: unknown[],
    aiConfig: { provider: string; model?: string; baseUrl?: string; apiKey?: string; temperature?: number; maxTokens?: number },
    onDelta?: (chunk: string) => void
  ): Promise<{ content?: string; toolCalls?: { id: string; name: string; arguments: string }[] }> {
    const api = (window as unknown as {
      electronAPI?: {
        kpInvoke?: (p: unknown) => Promise<{ content?: string; toolCalls?: { id: string; name: string; arguments: string }[] }>
        kpInvokeStream?: (p: unknown) => Promise<{ streamId: string }>
        onKpStream?: (handler: (payload: { streamId: string; type: 'chunk' | 'end' | 'error'; chunk?: string; content?: string; toolCalls?: { id: string; name: string; arguments: string }[]; error?: string }) => void) => () => void
      }
    }).electronAPI

    if (api?.kpInvokeStream && api?.onKpStream) {
      const { streamId } = await api.kpInvokeStream({
        messages: msgs,
        provider: aiConfig.provider,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
      })

      return await new Promise((resolve, reject) => {
        let streamed = ''
        const off = api.onKpStream((payload) => {
          if (!payload || payload.streamId !== streamId) return
          if (payload.type === 'chunk' && payload.chunk) {
            streamed += payload.chunk
            if (onDelta) onDelta(payload.chunk)
          } else if (payload.type === 'end') {
            off()
            resolve({ content: payload.content ?? streamed, toolCalls: payload.toolCalls })
          } else if (payload.type === 'error') {
            off()
            reject(new Error(payload.error || 'KP stream error'))
          }
        })
      })
    }

    if (!api?.kpInvoke) throw new Error('No KP API')
    return await api.kpInvoke({
      messages: msgs,
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.maxTokens,
    })
  }

  async function requestOpening() {
    if (gamePhase.value !== 'playing' || !characterSheet.value || !scriptId.value || messages.value.length > 0 || isSending.value) return
    isSending.value = true
    const kpId = generateId()
    addMessage({
      id: kpId,
      timestamp: Date.now(),
      role: 'kp',
      content: '',
      isStreaming: true,
    })
    try {
      const settingsStore = useSettingsStore()
      const aiConfig = settingsStore.aiConfig
      if (!aiConfig?.model) throw new Error('请先在设置中刷新模型列表并选择模型')
      let ragContext = ''
      try {
        const ctxRes = await getContext({
          query: '开场 场景描述',
          scriptId: scriptId.value,
          sceneId: currentSceneId.value ?? undefined,
          topK: 5,
        })
        ragContext = ctxRes.context
      } catch {}
      const sceneContext = buildSystemContext()
      const memoryBlock = buildMemoryBlock(kpMemory.value)
      const combined = ragContext ? `${ragContext}\n\n## 当前状态\n${sceneContext}` : sceneContext
      const systemPrompt = `你是克苏鲁的呼唤（COC）的守密人（Keeper/KP）。请根据以下剧本情报，向调查员做开场白，描述他们所处的场景，营造神秘与悬疑氛围。保持第一人称叙事。${memoryBlock}\n${combined || '请做一个神秘调查的开场白。'}`
      const chatMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请开始游戏，向调查员做开场白。' }]
      let fullContent = ''
      // 优先走 KP Agent（支持流式），否则回退到直接 chat()
      if ((window as unknown as { electronAPI?: { kpInvoke?: unknown } }).electronAPI?.kpInvoke) {
        let msgs: unknown[] = chatMessages
        for (let loop = 0; loop < 5; loop++) {
          const base = fullContent
          let iter = ''
          const r = await kpInvokeOnce(msgs, aiConfig, (chunk) => {
            iter += chunk
            const preview = (base ? base + '\n\n' : '') + iter
            updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) })
          })
          const iterFinal = (r?.content ?? iter) || ''
          fullContent = (base ? base + '\n\n' : '') + iterFinal
          updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })

          if (!r?.toolCalls?.length) break
          const toolResults: { role: 'tool'; tool_call_id: string; content: string }[] = []
          const toolDisplayMessages: Message[] = []
          for (const tc of r.toolCalls) {
            let result = 'ok'
            try {
              const args = JSON.parse(tc.arguments || '{}') as { delta?: number; sides?: number; sceneId?: string; clueId?: string }
              const delta = Number(args?.delta ?? 0)
              if (tc.name === 'adjust_hp') {
                updateCharacterHP(delta)
                result = `HP adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `HP +${delta}` : `HP ${delta}` })
              } else if (tc.name === 'adjust_san') {
                updateCharacterSAN(delta)
                result = `SAN adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `SAN +${delta}` : `SAN ${delta}` })
              } else if (tc.name === 'adjust_mp') {
                updateCharacterMP(delta)
                result = `MP adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `MP +${delta}` : `MP ${delta}` })
              } else if (tc.name === 'roll_dice') {
                const sides = Math.max(2, Math.min(1000, Math.floor(Number(args?.sides ?? 100)) || 100))
                const roll = rollD(sides)
                result = JSON.stringify({ roll, sides })
                toolDisplayMessages.push({
                  id: generateId(),
                  timestamp: Date.now(),
                  role: 'system',
                  type: 'dice',
                  content: `投骰 d${sides}: ${roll}`,
                  result: { roll, target: sides },
                })
              } else if (tc.name === 'transition_scene') {
                const sceneId = String(args?.sceneId ?? '')
                if (sceneId) {
                  transitionToScene(sceneId)
                  const scene = script.value?.scenes.find((s) => s.id === sceneId)
                  result = scene ? `Scene transitioned to: ${scene.name}` : `Scene transitioned to: ${sceneId}`
                  if (scene) toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `场景切换: ${scene.name}` })
                } else result = 'error: sceneId required'
              } else if (tc.name === 'grant_clue') {
                const clueId = String(args?.clueId ?? '')
                if (clueId) {
                  addClue(clueId)
                  const clue = script.value?.clues?.find((c) => c.id === clueId)
                  result = clue ? `Clue granted: ${clue.description || clueId}` : `Clue granted: ${clueId}`
                  toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `获得线索: ${clue?.description || clueId}` })
                } else result = 'error: clueId required'
              }
            } catch { result = 'error' }
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result })
          }
          insertMessagesBeforeLast(toolDisplayMessages)
          msgs = [
            ...msgs,
            { role: 'assistant' as const, content: r?.content ?? iterFinal, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: t.arguments } })) },
            ...toolResults,
          ]
        }
      } else {
        const result = await chat(aiConfig, { messages: chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], stream: true })
        if (isStreamResponse(result)) {
          for await (const chunk of result) {
            fullContent += chunk
            updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
          }
        } else {
          fullContent = result.content ?? ''
          updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
        }
      }
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
    } finally {
      isSending.value = false
    }
  }

  async function sendPlayerMessage(content: string) {
    if (!content.trim() || isSending.value) return

    addMessage({
      id: generateId(),
      timestamp: Date.now(),
      role: 'player',
      playerName: playerName.value,
      content: content.trim(),
    })

    isSending.value = true
    const kpId = generateId()
    addMessage({
      id: kpId,
      timestamp: Date.now(),
      role: 'kp',
      content: '',
      isStreaming: true,
    })

    try {
      const settingsStore = useSettingsStore()
      const aiConfig = settingsStore.aiConfig
      if (!aiConfig?.model) throw new Error('请先在设置中刷新模型列表并选择模型')

      let ragContext = ''
      if (scriptId.value) {
        try {
          const ctxRes = await getContext({
            query: content,
            scriptId: scriptId.value,
            sceneId: currentSceneId.value ?? undefined,
            topK: 5,
          })
          ragContext = ctxRes.context
        } catch {}
      }

      const sceneContext = buildSystemContext()
      const baseInstructions = [
        '你是克苏鲁的呼唤（COC）的守密人（Keeper/KP）。',
        '根据剧本情报和当前场景回答调查员，保持角色扮演和悬疑氛围。',
        '当你判断需要进行技能检定或投骰时，不要等待玩家提醒；你应立即调用 roll_dice(sides) 获取随机结果，并在回复中明确写出「骰子结果/投骰结果」与「成功/失败」后再推进叙事。',
        '根据检定结果推进剧情，必要时切换场景。',
        '不得擅自创造剧本中不存在的新地点或场景。如果玩家描述的场景/地点明显与「剧本场景列表」中的任何场景都不相符，请礼貌地提醒对方当前剧本只包含这些场景，并引导其从这些场景中选择（或回到当前场景）继续行动，而不是跟随玩家跑去一个完全不在列表中的地方。',
      ].join(' ')
      const memoryBlock = buildMemoryBlock(kpMemory.value)
      const systemPrompt = ragContext
        ? `${baseInstructions}${memoryBlock}\n\n## 剧本情报\n${ragContext}\n\n## 当前状态\n${sceneContext}`
        : `${baseInstructions}${memoryBlock}\n\n${sceneContext}`

      const conv = messages.value
        .filter((m) =>
          (m.role === 'kp' || m.role === 'player') && !(m.role === 'kp' && (m as { isStreaming?: boolean }).isStreaming)
        )
        .slice(-18)
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...conv.map((m) => ({
          role: m.role === 'player' ? 'user' as const : 'assistant' as const,
          content: m.role === 'player' ? `[${m.playerName}] ${m.content}` : m.content,
        })),
      ]

      let fullContent = ''
      if ((window as unknown as { electronAPI?: { kpInvoke?: unknown } }).electronAPI?.kpInvoke) {
        let msgs: unknown[] = chatMessages
        for (let loop = 0; loop < 5; loop++) {
          const base = fullContent
          let iter = ''
          const r = await kpInvokeOnce(msgs, aiConfig, (chunk) => {
            iter += chunk
            const preview = (base ? base + '\n\n' : '') + iter
            updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(preview) })
          })
          const iterFinal = (r?.content ?? iter) || ''
          fullContent = (base ? base + '\n\n' : '') + iterFinal
          updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
          if (!r?.toolCalls?.length) break
          const toolResults: { role: 'tool'; tool_call_id: string; content: string }[] = []
          const toolDisplayMessages: Message[] = []
          for (const tc of r.toolCalls) {
            let result = 'ok'
            try {
              const args = JSON.parse(tc.arguments || '{}') as { delta?: number; sides?: number; sceneId?: string; clueId?: string }
              const delta = Number(args?.delta ?? 0)
              if (tc.name === 'adjust_hp') {
                updateCharacterHP(delta)
                result = `HP adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `HP +${delta}` : `HP ${delta}` })
              } else if (tc.name === 'adjust_san') {
                updateCharacterSAN(delta)
                result = `SAN adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `SAN +${delta}` : `SAN ${delta}` })
              } else if (tc.name === 'adjust_mp') {
                updateCharacterMP(delta)
                result = `MP adjusted by ${delta}`
                toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: delta >= 0 ? `MP +${delta}` : `MP ${delta}` })
              } else if (tc.name === 'roll_dice') {
                const sides = Math.max(2, Math.min(1000, Math.floor(Number(args?.sides ?? 100)) || 100))
                const roll = rollD(sides)
                result = JSON.stringify({ roll, sides })
                toolDisplayMessages.push({
                  id: generateId(),
                  timestamp: Date.now(),
                  role: 'system',
                  type: 'dice',
                  content: `投骰 d${sides}: ${roll}`,
                  result: { roll, target: sides },
                })
              } else if (tc.name === 'transition_scene') {
                const sceneId = String(args?.sceneId ?? '')
                if (sceneId) {
                  transitionToScene(sceneId)
                  const scene = script.value?.scenes.find((s) => s.id === sceneId)
                  result = scene ? `Scene transitioned to: ${scene.name}` : `Scene transitioned to: ${sceneId}`
                  if (scene) toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `场景切换: ${scene.name}` })
                } else result = 'error: sceneId required'
              } else if (tc.name === 'grant_clue') {
                const clueId = String(args?.clueId ?? '')
                if (clueId) {
                  addClue(clueId)
                  const clue = script.value?.clues?.find((c) => c.id === clueId)
                  result = clue ? `Clue granted: ${clue.description || clueId}` : `Clue granted: ${clueId}`
                  toolDisplayMessages.push({ id: generateId(), timestamp: Date.now(), role: 'system', content: `获得线索: ${clue?.description || clueId}` })
                } else result = 'error: clueId required'
              }
            } catch { result = 'error' }
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result })
          }
          insertMessagesBeforeLast(toolDisplayMessages)
          msgs = [
            ...msgs,
            { role: 'assistant' as const, content: r?.content ?? iterFinal, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: t.arguments } })) },
            ...toolResults,
          ]
        }
      } else {
        const result = await chat(aiConfig, { messages: chatMessages as { role: 'system' | 'user' | 'assistant'; content: string }[], stream: true })
        if (isStreamResponse(result)) {
          for await (const chunk of result) {
            fullContent += chunk
            updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
          }
        } else {
          fullContent = result.content ?? ''
          updateLastMessage((m) => { if (m.role === 'kp') m.content = sanitizeKpResponse(fullContent) })
        }
      }
      if (fullContent.trim()) {
        kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
      }
      updateLastMessage((m) => { if (m.role === 'kp') m.isStreaming = false })
    } catch (e) {
      updateLastMessage((m) => {
        if (m.role === 'kp') {
          m.content = '[错误: ' + (e instanceof Error ? e.message : String(e)) + ']'
          m.isStreaming = false
        }
      })
    } finally {
      isSending.value = false
    }
  }

  return {
    sessionId,
    scriptId,
    script,
    currentSceneId,
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
